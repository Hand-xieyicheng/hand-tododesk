import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InjectOptions } from "light-my-request";
import type {
  ApiAiMessage,
  ApiAiProposal,
  ApiAiSession
} from "@todo/shared";
import { authPlugin } from "../plugins/auth.js";
import { AiStoreConflictError, type AiStore } from "../services/ai-store.js";
import { signAccessToken } from "../services/tokens.js";
import {
  createAiRoutes,
  type AiRouteDependencies
} from "./ai.js";

const session: ApiAiSession = {
  id: "session-1",
  title: "工作安排",
  summary: null,
  lastMessageAt: "2026-07-10T04:00:00.000Z",
  createdAt: "2026-07-10T04:00:00.000Z",
  updatedAt: "2026-07-10T04:00:00.000Z"
};
const message: ApiAiMessage = {
  id: "message-1",
  sessionId: "session-1",
  role: "USER",
  kind: "TEXT",
  content: "明天买咖啡豆",
  metadata: null,
  createdAt: "2026-07-10T04:00:00.000Z"
};
const proposal: ApiAiProposal = {
  id: "proposal-1",
  sessionId: "session-1",
  messageId: "message-1",
  status: "PENDING_CONFIRMATION",
  version: 1,
  expiresAt: "2026-07-10T04:30:00.000Z",
  createdAt: "2026-07-10T04:00:00.000Z",
  updatedAt: "2026-07-10T04:00:00.000Z",
  items: []
};

function createDependencies(configured = true) {
  const store = {
    listSessions: vi.fn().mockResolvedValue([session]),
    createSession: vi.fn().mockResolvedValue(session),
    renameSession: vi.fn().mockResolvedValue(session),
    deleteSession: vi.fn().mockResolvedValue(undefined),
    listMessages: vi.fn().mockResolvedValue({
      messages: [message],
      nextCursor: null
    }),
    updateProposal: vi.fn().mockResolvedValue(proposal),
    cancelProposal: vi.fn().mockResolvedValue({
      ...proposal,
      status: "CANCELLED",
      version: 2
    })
  };
  const orchestrator = {
    processUserMessage: vi.fn().mockResolvedValue({
      userMessage: message,
      assistantMessage: { ...message, id: "message-2", role: "ASSISTANT" }
    })
  };
  const executor = {
    confirm: vi.fn().mockResolvedValue({
      proposal: { ...proposal, status: "SUCCEEDED" },
      changedDomains: ["tasks"]
    }),
    retryFailed: vi.fn().mockResolvedValue({
      proposal: { ...proposal, status: "SUCCEEDED" },
      changedDomains: ["tasks"]
    })
  };
  return {
    configured,
    store: store as unknown as AiStore,
    orchestrator,
    executor
  } satisfies AiRouteDependencies;
}

async function injectAi(
  deps: AiRouteDependencies,
  method: InjectOptions["method"],
  url: string,
  payload?: InjectOptions["payload"],
  authenticated = true
) {
  const app = Fastify();
  await authPlugin(app);
  await app.register(createAiRoutes(deps));
  const response = await app.inject({
    method,
    url,
    headers: authenticated
      ? {
        authorization: "Bearer " + signAccessToken({
          sub: "user-1",
          email: "todo@example.com"
        })
      }
      : {},
    payload
  });
  await app.close();
  return response;
}

describe("AI routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires authentication before reporting configuration", async () => {
    const response = await injectAi(
      createDependencies(false),
      "GET",
      "/ai/sessions",
      undefined,
      false
    );
    expect(response.statusCode).toBe(401);
  });

  it("returns 503 when the server key is not configured", async () => {
    const response = await injectAi(
      createDependencies(false),
      "GET",
      "/ai/sessions"
    );
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: "AI assistant is not configured" });
  });

  it("scopes session and message operations to the authenticated user", async () => {
    const deps = createDependencies();

    expect((await injectAi(deps, "GET", "/ai/sessions")).statusCode).toBe(200);
    expect((await injectAi(deps, "POST", "/ai/sessions", {})).statusCode).toBe(201);
    expect((await injectAi(deps, "PATCH", "/ai/sessions/session-1", {
      title: "工作安排"
    })).statusCode).toBe(200);
    expect((await injectAi(
      deps,
      "GET",
      "/ai/sessions/session-1/messages?limit=20"
    )).statusCode).toBe(200);
    expect((await injectAi(deps, "POST", "/ai/sessions/session-1/messages", {
      content: "明天买咖啡豆"
    })).statusCode).toBe(200);
    expect((await injectAi(
      deps,
      "DELETE",
      "/ai/sessions/session-1"
    )).statusCode).toBe(204);

    expect(deps.store.listSessions).toHaveBeenCalledWith("user-1");
    expect(deps.store.renameSession).toHaveBeenCalledWith(
      "user-1",
      "session-1",
      "工作安排"
    );
    expect(deps.store.listMessages).toHaveBeenCalledWith(
      "user-1",
      "session-1",
      undefined,
      20
    );
    expect(deps.orchestrator.processUserMessage).toHaveBeenCalledWith(
      "user-1",
      "session-1",
      "明天买咖啡豆"
    );
    expect(deps.store.deleteSession).toHaveBeenCalledWith("user-1", "session-1");
  });

  it("edits, confirms, retries, and cancels versioned proposals", async () => {
    const deps = createDependencies();
    const createAction = {
      clientId: "action-1",
      objectType: "TASK",
      actionType: "CREATE",
      targetId: null,
      input: {
        title: "买咖啡豆",
        priority: "IMPORTANT_NOT_URGENT",
        status: "TODO"
      }
    };
    const confirmation = {
      version: 1,
      idempotencyKey: "86b5957a-3d25-4d74-8b4f-cd49566baf2f"
    };

    expect((await injectAi(deps, "PATCH", "/ai/proposals/proposal-1", {
      version: 1,
      actions: [createAction]
    })).statusCode).toBe(200);
    expect((await injectAi(
      deps,
      "POST",
      "/ai/proposals/proposal-1/confirm",
      confirmation
    )).statusCode).toBe(200);
    expect((await injectAi(
      deps,
      "POST",
      "/ai/proposals/proposal-1/retry",
      confirmation
    )).statusCode).toBe(200);
    expect((await injectAi(deps, "POST", "/ai/proposals/proposal-1/cancel", {
      version: 1
    })).statusCode).toBe(200);

    expect(deps.store.updateProposal).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      proposalId: "proposal-1",
      expectedVersion: 1
    }));
    expect(deps.executor.confirm).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      proposalId: "proposal-1",
      expectedVersion: 1
    }));
    expect(deps.executor.retryFailed).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      proposalId: "proposal-1",
      expectedVersion: 1
    }));
    expect(deps.store.cancelProposal).toHaveBeenCalledWith(
      "user-1",
      "proposal-1",
      1
    );
  });

  it("maps proposal version conflicts to 409", async () => {
    const deps = createDependencies();
    deps.store.updateProposal = vi.fn().mockRejectedValue(
      new AiStoreConflictError("VERSION_CONFLICT", "AI proposal version changed")
    );

    const response = await injectAi(
      deps,
      "PATCH",
      "/ai/proposals/proposal-1",
      {
        version: 1,
        actions: [{
          clientId: "action-1",
          objectType: "TASK",
          actionType: "CREATE",
          targetId: null,
          input: {
            title: "买咖啡豆",
            priority: "IMPORTANT_NOT_URGENT",
            status: "TODO"
          }
        }]
      }
    );

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: "AI proposal version changed" });
  });
});
