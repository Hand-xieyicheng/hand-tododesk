import {
  aiModelResultSchema,
  type AiAction,
  type AiModelResult,
  type AiObjectType,
  type ApiAiMessage
} from "@todo/shared";
import {
  AI_READ_TOOL_DEFINITIONS,
  createDefaultAiToolContext,
  executeAiReadTool,
  type AiToolContext,
  type ObservedRecordRegistry
} from "./ai-tools.js";
import type { AiStore } from "./ai-store.js";
import type {
  DeepSeekAssistantMessage,
  DeepSeekClient,
  DeepSeekCompletionRequest
} from "./deepseek-client.js";
import { buildAiSystemPrompt } from "./ai-prompt.js";

export interface ProcessAiMessageResult {
  userMessage: ApiAiMessage;
  assistantMessage: ApiAiMessage;
}

export class AiOrchestratorError extends Error {
  constructor(
    public readonly code: "TOOL_LIMIT" | "INVALID_RESULT" | "UNOBSERVED_REFERENCE",
    message: string
  ) {
    super(message);
    this.name = "AiOrchestratorError";
  }
}

export interface AiOrchestratorOptions {
  store: AiStore;
  deepSeek: Pick<DeepSeekClient, "complete" | "summarize">;
  now?: () => Date;
  toolContextFactory?: (userId: string) => AiToolContext;
}

interface AiOrchestrationContext {
  userId: string;
  sessionId: string;
  now: Date;
  userMessage: ApiAiMessage;
  store: AiStore;
  deepSeek: Pick<DeepSeekClient, "complete" | "summarize">;
  observed: ObservedRecordRegistry;
}

function toConversationAssistantMessage(
  message: DeepSeekAssistantMessage
): DeepSeekCompletionRequest["messages"][number] {
  return {
    role: "assistant",
    content: message.content,
    toolCalls: message.toolCalls
  };
}

function parseModelResult(content: string | null): AiModelResult {
  if (!content) {
    throw new Error("Model result is empty");
  }
  return aiModelResultSchema.parse(JSON.parse(content));
}

function observedActionReferences(action: AiAction): Array<{
  objectType: AiObjectType;
  id: string;
}> {
  if (action.actionType === "CREATE") {
    return [];
  }
  if (action.objectType === "HABIT_CHECKIN") {
    if (action.actionType === "CANCEL_CHECK_IN") {
      return [
        { objectType: "HABIT" as const, id: action.targetId },
        {
          objectType: "HABIT_CHECKIN" as const,
          id: [action.targetId, action.input.date].join(":")
        }
      ];
    }
    return [{ objectType: "HABIT" as const, id: action.targetId }];
  }
  return [{ objectType: action.objectType, id: action.targetId }];
}

function validateObservedReferences(
  result: AiModelResult,
  observed: ObservedRecordRegistry
) {
  const references = result.type === "answer"
    ? result.records
    : result.type === "clarification"
      ? result.candidates
      : result.actions.flatMap(observedActionReferences);

  for (const reference of references) {
    if (!observed.has(reference.objectType, reference.id)) {
      throw new AiOrchestratorError(
        "UNOBSERVED_REFERENCE",
        "AI result references a record that was not observed"
      );
    }
  }
}

async function parseModelResultWithOneRepair(
  content: string | null,
  deepSeek: Pick<DeepSeekClient, "complete">
) {
  try {
    return parseModelResult(content);
  } catch (firstError) {
    const repair = await deepSeek.complete({
      messages: [
        {
          role: "system",
          content: "Repair the invalid todoDesk assistant output. Return only one JSON object matching answer, clarification, or proposal. Do not call tools."
        },
        {
          role: "user",
          content: JSON.stringify({
            invalidOutput: content?.slice(0, 8_000) ?? null,
            validationError: firstError instanceof Error
              ? firstError.message.slice(0, 2_000)
              : "Invalid output"
          })
        }
      ],
      tools: [],
      jsonOutput: true
    });
    if (repair.toolCalls.length > 0) {
      throw new AiOrchestratorError(
        "INVALID_RESULT",
        "AI returned invalid repaired output"
      );
    }
    try {
      return parseModelResult(repair.content);
    } catch {
      throw new AiOrchestratorError(
        "INVALID_RESULT",
        "AI returned invalid structured output"
      );
    }
  }
}

async function persistFinalResult(
  content: string | null,
  context: AiOrchestrationContext
): Promise<ProcessAiMessageResult> {
  const result = await parseModelResultWithOneRepair(content, context.deepSeek);
  validateObservedReferences(result, context.observed);

  if (result.type === "answer") {
    const records = result.records.map((record) => {
      const observed = context.observed.get(record.objectType, record.id);
      if (!observed) {
        throw new AiOrchestratorError(
          "UNOBSERVED_REFERENCE",
          "AI answer references a record that was not observed"
        );
      }
      return {
        objectType: record.objectType,
        id: record.id,
        data: observed.snapshot
      };
    });
    const assistantMessage = await context.store.appendMessage({
      userId: context.userId,
      sessionId: context.sessionId,
      role: "ASSISTANT",
      kind: records.length > 0 ? "QUERY_RESULT" : "TEXT",
      content: result.text,
      metadata: records.length > 0 ? { records } : null
    });
    return { userMessage: context.userMessage, assistantMessage };
  }

  if (result.type === "clarification") {
    const assistantMessage = await context.store.appendMessage({
      userId: context.userId,
      sessionId: context.sessionId,
      role: "ASSISTANT",
      kind: "CLARIFICATION",
      content: result.prompt,
      metadata: { candidates: result.candidates }
    });
    return { userMessage: context.userMessage, assistantMessage };
  }

  const baseMessage = await context.store.appendMessage({
    userId: context.userId,
    sessionId: context.sessionId,
    role: "ASSISTANT",
    kind: "PROPOSAL",
    content: result.summary,
    metadata: null
  });
  const proposal = await context.store.createProposal({
    userId: context.userId,
    sessionId: context.sessionId,
    messageId: baseMessage.id,
    expiresAt: new Date(context.now.getTime() + 30 * 60 * 1000),
    actions: result.actions,
    observedRecords: context.observed.snapshotMap()
  });
  return {
    userMessage: context.userMessage,
    assistantMessage: {
      ...baseMessage,
      metadata: { proposal }
    }
  };
}

export class AiOrchestrator {
  private readonly now: () => Date;
  private readonly toolContextFactory: (userId: string) => AiToolContext;

  constructor(private readonly options: AiOrchestratorOptions) {
    this.now = options.now ?? (() => new Date());
    this.toolContextFactory = options.toolContextFactory ?? createDefaultAiToolContext;
  }

  async processUserMessage(
    userId: string,
    sessionId: string,
    content: string
  ): Promise<ProcessAiMessageResult> {
    const requestNow = this.now();
    const userMessage = await this.options.store.appendMessage({
      userId,
      sessionId,
      role: "USER",
      kind: "TEXT",
      content,
      metadata: null
    });
    const conversation = await this.options.store.loadConversationContext(
      userId,
      sessionId,
      20
    );
    let summary = conversation.session.summary;
    if (conversation.overflowMessages.length > 0) {
      try {
        summary = (await this.options.deepSeek.summarize([
          summary ?? "",
          ...conversation.overflowMessages.map((message) => (
            [message.role, message.content].join(": ")
          ))
        ])).slice(0, 4_000);
        await this.options.store.updateSessionSummary(userId, sessionId, summary);
      } catch {
        summary = conversation.session.summary;
      }
    }

    const messages: DeepSeekCompletionRequest["messages"] = [
      { role: "system", content: buildAiSystemPrompt(requestNow) }
    ];
    if (summary) {
      messages.push({
        role: "system",
        content: "Previous conversation summary:\n" + summary
      });
    }
    messages.push(...conversation.recentMessages.map((message) => ({
      role: message.role === "USER" ? "user" as const : "assistant" as const,
      content: message.content
    })));

    const toolContext = this.toolContextFactory(userId);
    const orchestrationContext: AiOrchestrationContext = {
      userId,
      sessionId,
      now: requestNow,
      userMessage,
      store: this.options.store,
      deepSeek: this.options.deepSeek,
      observed: toolContext.observed
    };

    for (let round = 0; round < 4; round += 1) {
      const assistant = await this.options.deepSeek.complete({
        messages,
        tools: [...AI_READ_TOOL_DEFINITIONS],
        jsonOutput: true
      });
      messages.push(toConversationAssistantMessage(assistant));

      if (assistant.toolCalls.length === 0) {
        return persistFinalResult(assistant.content, orchestrationContext);
      }

      for (const call of assistant.toolCalls) {
        const result = await executeAiReadTool(
          call.function.name,
          call.function.arguments,
          toolContext
        );
        messages.push({
          role: "tool",
          toolCallId: call.id,
          content: JSON.stringify(result)
        });
      }
    }

    throw new AiOrchestratorError("TOOL_LIMIT", "AI tool limit exceeded");
  }
}
