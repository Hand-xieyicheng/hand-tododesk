import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ApiAiMessage,
  ApiAiProposal,
  ApiAiSession,
  ApiTask
} from "@todo/shared";
import { createAiToolContext } from "./ai-tools.js";
import type { AiStore } from "./ai-store.js";
import type { DeepSeekClient } from "./deepseek-client.js";
import {
  AiOrchestrator,
  AiOrchestratorError
} from "./ai-orchestrator.js";
import { buildAiSystemPrompt } from "./ai-prompt.js";

const now = new Date("2026-07-10T04:00:00.000Z");
const session: ApiAiSession = {
  id: "session-1",
  title: "新会话",
  summary: null,
  lastMessageAt: now.toISOString(),
  createdAt: now.toISOString(),
  updatedAt: now.toISOString()
};
const task: ApiTask = {
  id: "task-1",
  title: "交周报",
  notes: null,
  startAt: null,
  dueAt: "2026-07-10T09:00:00.000Z",
  priority: "IMPORTANT_URGENT",
  status: "TODO",
  sortOrder: 1000,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-09T00:00:00.000Z",
  completedAt: null,
  recurrenceRule: null,
  tags: [],
  pomodoroCompletedCount: 0,
  pomodoroCompletedMinutes: 0
};

function message(
  role: ApiAiMessage["role"],
  kind: ApiAiMessage["kind"],
  content: string,
  patch: Partial<ApiAiMessage> = {}
): ApiAiMessage {
  return {
    id: role === "USER" ? "message-user" : "message-assistant",
    sessionId: "session-1",
    role,
    kind,
    content,
    metadata: null,
    createdAt: now.toISOString(),
    ...patch
  };
}

function proposal(): ApiAiProposal {
  return {
    id: "proposal-1",
    sessionId: "session-1",
    messageId: "message-assistant",
    status: "PENDING_CONFIRMATION",
    version: 1,
    expiresAt: "2026-07-10T04:30:00.000Z",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    items: []
  };
}

function createHarness(overrides: {
  overflowMessages?: ApiAiMessage[];
  summary?: string | null;
} = {}) {
  const userMessage = message("USER", "TEXT", "周报还没做吗");
  const store = {
    appendMessage: vi.fn().mockImplementation(async (input: {
      role: ApiAiMessage["role"];
      kind: ApiAiMessage["kind"];
      content: string;
      metadata: ApiAiMessage["metadata"];
    }) => message(input.role, input.kind, input.content, {
      metadata: input.metadata
    })),
    loadConversationContext: vi.fn().mockResolvedValue({
      session: { ...session, summary: overrides.summary ?? null },
      recentMessages: [userMessage],
      overflowMessages: overrides.overflowMessages ?? []
    }),
    updateSessionSummary: vi.fn().mockResolvedValue(undefined),
    createProposal: vi.fn().mockResolvedValue(proposal())
  };
  const deepSeek = {
    complete: vi.fn(),
    summarize: vi.fn().mockResolvedValue("压缩后的上下文")
  };
  const taskDomain = {
    listTasks: vi.fn().mockResolvedValue([task])
  };
  const anniversaryDomain = {
    listAnniversaries: vi.fn().mockResolvedValue([])
  };
  const habitDomain = {
    listHabits: vi.fn().mockResolvedValue([]),
    getHabitDetail: vi.fn().mockResolvedValue(null)
  };
  const orchestrator = new AiOrchestrator({
    store: store as unknown as AiStore,
    deepSeek: deepSeek as unknown as Pick<DeepSeekClient, "complete" | "summarize">,
    now: () => now,
    toolContextFactory: (userId) => createAiToolContext({
      userId,
      taskDomain,
      anniversaryDomain,
      habitDomain
    })
  });
  return {
    orchestrator,
    store,
    deepSeek,
    taskDomain,
    userMessage
  };
}

describe("AI prompt", () => {
  it("includes Beijing time, domain limits, and confirmation rules", () => {
    const prompt = buildAiSystemPrompt(now);
    expect(prompt).toContain("2026-07-10 12:00:00 Asia/Shanghai");
    expect(prompt).toContain("tasks, anniversaries, habits, and habit check-ins");
    expect(prompt).toContain("return type=proposal");
    expect(prompt).toContain("confirm");
  });
});

describe("AI orchestrator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists a direct text answer without creating a proposal", async () => {
    const harness = createHarness();
    harness.deepSeek.complete.mockResolvedValueOnce({
      role: "assistant",
      content: JSON.stringify({
        type: "answer",
        text: "你今天没有待办",
        records: []
      }),
      toolCalls: []
    });

    const result = await harness.orchestrator.processUserMessage(
      "user-1",
      "session-1",
      "今天有什么待办"
    );

    expect(result.assistantMessage.kind).toBe("TEXT");
    expect(harness.store.createProposal).not.toHaveBeenCalled();
  });

  it("executes read-only tool calls and persists observed query records", async () => {
    const harness = createHarness();
    harness.deepSeek.complete
      .mockResolvedValueOnce({
        role: "assistant",
        content: null,
        toolCalls: [{
          id: "tool-1",
          type: "function",
          function: {
            name: "search_tasks",
            arguments: JSON.stringify({
              query: "周报",
              statuses: ["TODO"],
              from: null,
              to: null,
              limit: 10
            })
          }
        }]
      })
      .mockResolvedValueOnce({
        role: "assistant",
        content: JSON.stringify({
          type: "answer",
          text: "找到 1 个待办",
          records: [{ objectType: "TASK", id: "task-1" }]
        }),
        toolCalls: []
      });

    const result = await harness.orchestrator.processUserMessage(
      "user-1",
      "session-1",
      "周报还没做吗"
    );

    expect(harness.taskDomain.listTasks).toHaveBeenCalledWith("user-1");
    expect(harness.deepSeek.complete).toHaveBeenCalledTimes(2);
    expect(result.assistantMessage.kind).toBe("QUERY_RESULT");
    expect(result.assistantMessage.metadata?.records?.[0]).toMatchObject({
      objectType: "TASK",
      id: "task-1",
      data: expect.objectContaining({ title: "交周报" })
    });
  });

  it("creates but never executes an observed write proposal", async () => {
    const harness = createHarness();
    harness.deepSeek.complete
      .mockResolvedValueOnce({
        role: "assistant",
        content: null,
        toolCalls: [{
          id: "tool-1",
          type: "function",
          function: {
            name: "search_tasks",
            arguments: JSON.stringify({
              query: "周报",
              statuses: ["TODO"],
              from: null,
              to: null,
              limit: 10
            })
          }
        }]
      })
      .mockResolvedValueOnce({
        role: "assistant",
        content: JSON.stringify({
          type: "proposal",
          summary: "更新周报待办",
          actions: [{
            clientId: "action-1",
            objectType: "TASK",
            actionType: "UPDATE",
            targetId: "task-1",
            input: { title: "提交周报" }
          }]
        }),
        toolCalls: []
      });

    const result = await harness.orchestrator.processUserMessage(
      "user-1",
      "session-1",
      "把周报改成提交周报"
    );

    expect(harness.store.createProposal).toHaveBeenCalledTimes(1);
    expect(result.assistantMessage.kind).toBe("PROPOSAL");
    expect(result.assistantMessage.metadata?.proposal?.status).toBe("PENDING_CONFIRMATION");
  });

  it("rejects unobserved references and write targets", async () => {
    const harness = createHarness();
    harness.deepSeek.complete.mockResolvedValueOnce({
      role: "assistant",
      content: JSON.stringify({
        type: "proposal",
        summary: "删除一个未查询的待办",
        actions: [{
          clientId: "action-1",
          objectType: "TASK",
          actionType: "DELETE",
          targetId: "task-other",
          input: {}
        }]
      }),
      toolCalls: []
    });

    await expect(harness.orchestrator.processUserMessage(
      "user-1",
      "session-1",
      "删除那个待办"
    )).rejects.toMatchObject({ code: "UNOBSERVED_REFERENCE" });
    expect(harness.store.createProposal).not.toHaveBeenCalled();
  });

  it("rejects query answers that cite records no tool returned", async () => {
    const harness = createHarness();
    harness.deepSeek.complete.mockResolvedValueOnce({
      role: "assistant",
      content: JSON.stringify({
        type: "answer",
        text: "虚构的查询结果",
        records: [{ objectType: "TASK", id: "task-other" }]
      }),
      toolCalls: []
    });

    await expect(harness.orchestrator.processUserMessage(
      "user-1",
      "session-1",
      "查询不存在的待办"
    )).rejects.toMatchObject({ code: "UNOBSERVED_REFERENCE" });
  });

  it("repairs invalid model JSON once before persisting", async () => {
    const harness = createHarness();
    harness.deepSeek.complete
      .mockResolvedValueOnce({
        role: "assistant",
        content: "not-json",
        toolCalls: []
      })
      .mockResolvedValueOnce({
        role: "assistant",
        content: JSON.stringify({
          type: "answer",
          text: "已修复",
          records: []
        }),
        toolCalls: []
      });

    await expect(harness.orchestrator.processUserMessage(
      "user-1",
      "session-1",
      "测试"
    )).resolves.toMatchObject({
      assistantMessage: { content: "已修复" }
    });
    expect(harness.deepSeek.complete).toHaveBeenCalledTimes(2);
  });

  it("stops after four tool rounds", async () => {
    const harness = createHarness();
    harness.deepSeek.complete.mockResolvedValue({
      role: "assistant",
      content: null,
      toolCalls: [{
        id: "tool-loop",
        type: "function",
        function: {
          name: "search_tasks",
          arguments: JSON.stringify({
            query: "",
            statuses: [],
            from: null,
            to: null,
            limit: 1
          })
        }
      }]
    });

    await expect(harness.orchestrator.processUserMessage(
      "user-1",
      "session-1",
      "循环"
    )).rejects.toEqual(expect.any(AiOrchestratorError));
    await expect(harness.orchestrator.processUserMessage(
      "user-1",
      "session-1",
      "循环"
    )).rejects.toMatchObject({ code: "TOOL_LIMIT" });
  });

  it("compacts overflow context without blocking the main request", async () => {
    const overflow = Array.from({ length: 2 }, (_, index) => message(
      index % 2 === 0 ? "USER" : "ASSISTANT",
      "TEXT",
      "旧消息 " + index,
      { id: "old-" + index }
    ));
    const harness = createHarness({
      overflowMessages: overflow,
      summary: "旧摘要"
    });
    harness.deepSeek.complete.mockResolvedValueOnce({
      role: "assistant",
      content: JSON.stringify({
        type: "answer",
        text: "继续处理",
        records: []
      }),
      toolCalls: []
    });

    await harness.orchestrator.processUserMessage("user-1", "session-1", "继续");

    expect(harness.deepSeek.summarize).toHaveBeenCalledOnce();
    expect(harness.store.updateSessionSummary).toHaveBeenCalledWith(
      "user-1",
      "session-1",
      "压缩后的上下文"
    );
  });
});
