import type { FastifyInstance } from "fastify";
import { z, ZodError } from "zod";
import {
  cancelAiProposalRequestSchema,
  confirmAiProposalRequestSchema,
  createAiSessionRequestSchema,
  sendAiMessageRequestSchema,
  updateAiProposalRequestSchema,
  updateAiSessionRequestSchema
} from "@todo/shared";
import { config } from "../config.js";
import {
  AiActionExecutor,
  aiActionExecutor
} from "../services/ai-executor.js";
import {
  AiOrchestrator,
  AiOrchestratorError
} from "../services/ai-orchestrator.js";
import {
  AiStoreConflictError,
  aiStore,
  type AiStore
} from "../services/ai-store.js";
import {
  DeepSeekClient,
  DeepSeekClientError
} from "../services/deepseek-client.js";
import { parseFeatureFlags } from "../services/app-bootstrap.js";

export interface AiRouteDependencies {
  configured: boolean;
  store: AiStore;
  orchestrator: Pick<AiOrchestrator, "processUserMessage">;
  executor: Pick<AiActionExecutor, "confirm" | "retryFailed">;
}

function statusForAiError(error: unknown) {
  if (error instanceof AiStoreConflictError) {
    switch (error.code) {
      case "NOT_FOUND":
        return 404;
      case "EXPIRED":
        return 410;
      case "VERSION_CONFLICT":
      case "INVALID_STATE":
      case "IDEMPOTENCY_CONFLICT":
        return 409;
    }
  }
  if (error instanceof DeepSeekClientError) {
    switch (error.code) {
      case "RATE_LIMITED":
        return 429;
      case "TIMEOUT":
        return 504;
      case "NOT_CONFIGURED":
        return 503;
      case "UPSTREAM":
      case "INVALID_RESPONSE":
        return 502;
    }
  }
  if (error instanceof AiOrchestratorError) {
    return error.code === "TOOL_LIMIT" ? 502 : 422;
  }
  return null;
}

function safeAiErrorMessage(error: unknown) {
  if (
    error instanceof AiStoreConflictError ||
    error instanceof DeepSeekClientError ||
    error instanceof AiOrchestratorError
  ) {
    return error.message;
  }
  return "AI assistant request failed";
}

export function createAiRoutes(deps: AiRouteDependencies) {
  return async function aiRoutes(app: FastifyInstance) {
    app.addHook("preHandler", app.authenticate);
    app.addHook("preHandler", async (_request, reply) => {
      if (!deps.configured) {
        return reply.code(503).send({
          error: "AI assistant is not configured"
        });
      }
    });

    app.setErrorHandler((error, request, reply) => {
      if (error instanceof ZodError) {
        return reply.code(400).send({
          error: "Validation failed",
          issues: error.issues
        });
      }
      const status = statusForAiError(error);
      if (status) {
        return reply.code(status).send({ error: safeAiErrorMessage(error) });
      }
      request.log.error(error);
      return reply.code(500).send({ error: "AI assistant request failed" });
    });

    app.get("/ai/sessions", async (request) => ({
      sessions: await deps.store.listSessions(request.user.id)
    }));

    app.post("/ai/sessions", async (request, reply) => {
      createAiSessionRequestSchema.parse(request.body);
      const session = await deps.store.createSession(request.user.id);
      return reply.code(201).send({ session });
    });

    app.patch("/ai/sessions/:id", async (request) => {
      const { id } = request.params as { id: string };
      const body = updateAiSessionRequestSchema.parse(request.body);
      return {
        session: await deps.store.renameSession(request.user.id, id, body.title)
      };
    });

    app.delete("/ai/sessions/:id", async (request, reply) => {
      const { id } = request.params as { id: string };
      await deps.store.deleteSession(request.user.id, id);
      return reply.code(204).send();
    });

    app.get("/ai/sessions/:id/messages", async (request) => {
      const { id } = request.params as { id: string };
      const query = z.object({
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50)
      }).parse(request.query);
      return deps.store.listMessages(
        request.user.id,
        id,
        query.cursor,
        query.limit
      );
    });

    app.post("/ai/sessions/:id/messages", async (request) => {
      const { id } = request.params as { id: string };
      const body = sendAiMessageRequestSchema.parse(request.body);
      return deps.orchestrator.processUserMessage(
        request.user.id,
        id,
        body.content
      );
    });

    app.patch("/ai/proposals/:id", async (request) => {
      const { id } = request.params as { id: string };
      const body = updateAiProposalRequestSchema.parse(request.body);
      return {
        proposal: await deps.store.updateProposal({
          userId: request.user.id,
          proposalId: id,
          expectedVersion: body.version,
          actions: body.actions
        })
      };
    });

    app.post("/ai/proposals/:id/confirm", async (request) => {
      const { id } = request.params as { id: string };
      const body = confirmAiProposalRequestSchema.parse(request.body);
      return deps.executor.confirm({
        userId: request.user.id,
        proposalId: id,
        expectedVersion: body.version,
        idempotencyKey: body.idempotencyKey,
        now: new Date()
      });
    });

    app.post("/ai/proposals/:id/retry", async (request) => {
      const { id } = request.params as { id: string };
      const body = confirmAiProposalRequestSchema.parse(request.body);
      return deps.executor.retryFailed({
        userId: request.user.id,
        proposalId: id,
        expectedVersion: body.version,
        idempotencyKey: body.idempotencyKey,
        now: new Date()
      });
    });

    app.post("/ai/proposals/:id/cancel", async (request) => {
      const { id } = request.params as { id: string };
      const body = cancelAiProposalRequestSchema.parse(request.body);
      return {
        proposal: await deps.store.cancelProposal(
          request.user.id,
          id,
          body.version
        )
      };
    });
  };
}

export function createProductionAiDependencies(
  aiConfig: Pick<
    typeof config,
    | "DEEPSEEK_API_KEY"
    | "DEEPSEEK_API_URL"
    | "DEEPSEEK_MODEL"
    | "DEEPSEEK_TIMEOUT_MS"
    | "FEATURE_FLAGS_JSON"
  >
): AiRouteDependencies {
  const deepSeek = new DeepSeekClient({
    apiKey: aiConfig.DEEPSEEK_API_KEY,
    apiUrl: aiConfig.DEEPSEEK_API_URL,
    model: aiConfig.DEEPSEEK_MODEL,
    timeoutMs: aiConfig.DEEPSEEK_TIMEOUT_MS,
    fetchImpl: fetch
  });
  const flags = parseFeatureFlags(aiConfig.FEATURE_FLAGS_JSON);
  return {
    configured: flags.aiAssistant && Boolean(aiConfig.DEEPSEEK_API_KEY.trim()),
    store: aiStore,
    orchestrator: new AiOrchestrator({ store: aiStore, deepSeek }),
    executor: aiActionExecutor
  };
}
