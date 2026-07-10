import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InjectOptions } from "light-my-request";
import type {
  AiAction,
  ApiAnniversaryEvent,
  ApiAiActionItem,
  ApiAiMessage,
  ApiAiProposal,
  ApiAiSession,
  ApiHabit,
  ApiHabitDetail,
  ApiTask
} from "@todo/shared";
import { authPlugin } from "../plugins/auth.js";
import { AiStoreConflictError, type AiStore } from "../services/ai-store.js";
import { AiActionExecutor } from "../services/ai-executor.js";
import { AiOrchestrator } from "../services/ai-orchestrator.js";
import { createAiToolContext, type ObservedRecord } from "../services/ai-tools.js";
import type { DeepSeekAssistantMessage } from "../services/deepseek-client.js";
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

const flowTask: ApiTask = {
  id: "task-existing",
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

const flowHabit: ApiHabit = {
  id: "habit-1",
  title: "喝咖啡",
  notes: null,
  icon: "Coffee",
  color: "mint",
  frequency: "DAILY",
  interval: 1,
  weekDays: [],
  monthDays: [],
  startDate: "2026-07-01",
  endDate: null,
  sortOrder: 1000,
  archivedAt: null,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-09T00:00:00.000Z",
  todayPlanned: true,
  todayChecked: true,
  stats: {
    monthCheckIns: 1,
    monthPlanned: 10,
    monthCompletionRate: 10,
    totalCheckIns: 1,
    currentStreak: 1,
    currentStreakUnit: "天"
  }
};

const flowHabitDetail: ApiHabitDetail = {
  habit: flowHabit,
  month: "2026-07",
  stats: flowHabit.stats,
  calendarDays: [],
  logs: [{
    id: "check-1",
    date: "2026-07-10",
    note: "已完成",
    createdAt: "2026-07-10T01:00:00.000Z",
    updatedAt: "2026-07-10T01:00:00.000Z"
  }]
};

function scriptedResult(result: unknown): DeepSeekAssistantMessage {
  return {
    role: "assistant",
    content: JSON.stringify(result),
    toolCalls: []
  };
}

function scriptedTool(name: string, args: Record<string, unknown>): DeepSeekAssistantMessage {
  return {
    role: "assistant",
    content: null,
    toolCalls: [{
      id: `tool-${name}`,
      type: "function",
      function: { name, arguments: JSON.stringify(args) }
    }]
  };
}

function createFullFlowHarness(script: DeepSeekAssistantMessage[], tasks: ApiTask[] = [flowTask]) {
  const now = new Date("2026-07-10T04:00:00.000Z");
  const messages: ApiAiMessage[] = [];
  const proposals = new Map<string, ApiAiProposal>();
  const idempotency = new Map<string, string>();
  let messageSequence = 0;
  let proposalSequence = 0;

  function targetSnapshot(
    action: AiAction,
    observed: ReadonlyMap<string, ObservedRecord>
  ) {
    if (action.actionType === "CREATE") return null;
    if (action.objectType === "HABIT_CHECKIN" && action.actionType === "CANCEL_CHECK_IN") {
      const habit = observed.get(`HABIT:${action.targetId}`)!;
      const checkIn = observed.get(`HABIT_CHECKIN:${action.targetId}:${action.input.date}`)!;
      return {
        objectType: "HABIT_CHECKIN",
        id: `${action.targetId}:${action.input.date}`,
        updatedAt: checkIn.updatedAt,
        date: action.input.date,
        habitUpdatedAt: habit.updatedAt,
        checkInUpdatedAt: checkIn.updatedAt,
        habitSnapshot: habit.snapshot,
        checkInSnapshot: checkIn.snapshot
      };
    }
    const objectType = action.objectType === "HABIT_CHECKIN" ? "HABIT" : action.objectType;
    return observed.get(`${objectType}:${action.targetId}`)?.snapshot ?? null;
  }

  function actionItems(
    actions: AiAction[],
    observed: ReadonlyMap<string, ObservedRecord>,
    current: ApiAiActionItem[] = []
  ): ApiAiActionItem[] {
    return actions.map((action, position) => ({
      id: current[position]?.id ?? `item-${position + 1}`,
      position,
      objectType: action.objectType,
      actionType: action.actionType,
      targetId: action.targetId,
      input: action.input,
      targetSnapshot: current[position]?.targetSnapshot ?? targetSnapshot(action, observed),
      status: "PENDING",
      result: null,
      errorCode: null,
      errorMessage: null
    }));
  }

  const store = {
    listSessions: vi.fn().mockResolvedValue([session]),
    createSession: vi.fn().mockResolvedValue(session),
    renameSession: vi.fn().mockResolvedValue(session),
    deleteSession: vi.fn().mockResolvedValue(undefined),
    getSession: vi.fn().mockResolvedValue(session),
    listMessages: vi.fn(async () => ({ messages, nextCursor: null })),
    appendMessage: vi.fn(async (input: {
      sessionId: string;
      role: ApiAiMessage["role"];
      kind: ApiAiMessage["kind"];
      content: string;
      metadata: ApiAiMessage["metadata"];
    }) => {
      const created: ApiAiMessage = {
        id: `flow-message-${messageSequence += 1}`,
        sessionId: input.sessionId,
        role: input.role,
        kind: input.kind,
        content: input.content,
        metadata: input.metadata,
        createdAt: now.toISOString()
      };
      messages.push(created);
      return created;
    }),
    loadConversationContext: vi.fn(async () => ({
      session,
      recentMessages: messages,
      overflowMessages: []
    })),
    updateSessionSummary: vi.fn().mockResolvedValue(undefined),
    createProposal: vi.fn(async (input: {
      sessionId: string;
      messageId: string;
      expiresAt: Date;
      actions: AiAction[];
      observedRecords: ReadonlyMap<string, ObservedRecord>;
    }) => {
      const created: ApiAiProposal = {
        id: `flow-proposal-${proposalSequence += 1}`,
        sessionId: input.sessionId,
        messageId: input.messageId,
        status: "PENDING_CONFIRMATION",
        version: 1,
        expiresAt: input.expiresAt.toISOString(),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        items: actionItems(input.actions, input.observedRecords)
      };
      proposals.set(created.id, created);
      return created;
    }),
    getProposal: vi.fn(async (_userId: string, proposalId: string) => proposals.get(proposalId) ?? null),
    updateProposal: vi.fn(async (input: {
      proposalId: string;
      expectedVersion: number;
      actions: AiAction[];
    }) => {
      const current = proposals.get(input.proposalId)!;
      if (current.version !== input.expectedVersion) {
        throw new AiStoreConflictError("VERSION_CONFLICT", "AI proposal version changed");
      }
      const updated: ApiAiProposal = {
        ...current,
        version: current.version + 1,
        items: actionItems(input.actions, new Map(), current.items)
      };
      proposals.set(updated.id, updated);
      return updated;
    }),
    cancelProposal: vi.fn(async (_userId: string, proposalId: string) => {
      const current = proposals.get(proposalId)!;
      const cancelled = { ...current, status: "CANCELLED" as const, version: current.version + 1 };
      proposals.set(proposalId, cancelled);
      return cancelled;
    }),
    claimProposalForExecution: vi.fn(async (input: {
      proposalId: string;
      expectedVersion: number;
      idempotencyKey: string;
    }) => {
      const replayId = idempotency.get(input.idempotencyKey);
      if (replayId) {
        return { proposal: proposals.get(replayId)!, replay: true };
      }
      const current = proposals.get(input.proposalId)!;
      if (current.version !== input.expectedVersion) {
        throw new AiStoreConflictError("VERSION_CONFLICT", "AI proposal version changed");
      }
      const executing = { ...current, status: "EXECUTING" as const, version: current.version + 1 };
      proposals.set(input.proposalId, executing);
      idempotency.set(input.idempotencyKey, input.proposalId);
      return { proposal: executing, replay: false };
    }),
    recordActionResult: vi.fn(async (input: {
      proposalId: string;
      itemId: string;
      status: "SUCCEEDED" | "FAILED";
      result?: Record<string, unknown>;
      errorCode?: string;
      errorMessage?: string;
    }) => {
      const current = proposals.get(input.proposalId)!;
      proposals.set(input.proposalId, {
        ...current,
        items: current.items.map((item) => item.id === input.itemId ? {
          ...item,
          status: input.status,
          result: input.result ?? null,
          errorCode: input.errorCode ?? null,
          errorMessage: input.errorMessage ?? null
        } : item)
      });
    }),
    finishProposal: vi.fn(async (_userId: string, proposalId: string) => {
      const current = proposals.get(proposalId)!;
      const successes = current.items.filter((item) => item.status === "SUCCEEDED").length;
      const failures = current.items.filter((item) => item.status === "FAILED").length;
      const finished: ApiAiProposal = {
        ...current,
        status: failures === 0 ? "SUCCEEDED" : successes === 0 ? "FAILED" : "PARTIAL_FAILED",
        version: current.version + 1
      };
      proposals.set(proposalId, finished);
      return finished;
    }),
    resetFailedItemsForRetry: vi.fn(async (_userId: string, proposalId: string) => {
      const current = proposals.get(proposalId)!;
      const reset: ApiAiProposal = {
        ...current,
        status: "PENDING_CONFIRMATION",
        version: current.version + 1,
        items: current.items.map((item) => item.status === "FAILED" ? {
          ...item,
          status: "PENDING",
          errorCode: null,
          errorMessage: null
        } : item)
      };
      proposals.set(proposalId, reset);
      return reset;
    })
  };

  const deepSeek = {
    complete: vi.fn(async () => {
      const response = script.shift();
      if (!response) throw new Error("Missing scripted DeepSeek response");
      return response;
    }),
    summarize: vi.fn().mockResolvedValue("summary")
  };
  const taskDomain = {
    listTasks: vi.fn().mockResolvedValue(tasks),
    getTask: vi.fn(async (_userId: string, id: string) => tasks.find((task) => task.id === id) ?? null),
    createTask: vi.fn(async (_userId: string, input: Record<string, unknown>) => ({
      ...flowTask,
      id: `created-task-${String(input.title)}`,
      ...input
    })),
    updateTask: vi.fn(),
    deleteTask: vi.fn()
  };
  const anniversaryDomain = {
    listAnniversaries: vi.fn().mockResolvedValue([]),
    getAnniversary: vi.fn(),
    createAnniversary: vi.fn(async (_userId: string, input: Record<string, unknown>): Promise<ApiAnniversaryEvent> => ({
      id: "created-anniversary",
      title: String(input.title),
      notes: typeof input.notes === "string" ? input.notes : null,
      category: input.category as ApiAnniversaryEvent["category"],
      date: String(input.date),
      repeat: input.repeat as ApiAnniversaryEvent["repeat"],
      direction: input.direction as ApiAnniversaryEvent["direction"],
      cardStyle: input.cardStyle as ApiAnniversaryEvent["cardStyle"],
      calendarType: input.calendarType as ApiAnniversaryEvent["calendarType"],
      lunarMonth: typeof input.lunarMonth === "number" ? input.lunarMonth : null,
      lunarDay: typeof input.lunarDay === "number" ? input.lunarDay : null,
      solarTerm: input.solarTerm as ApiAnniversaryEvent["solarTerm"] ?? null,
      sortOrder: 1000,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      displayDirection: "COUNTDOWN",
      displayDate: String(input.date),
      displayValue: "245天",
      displaySubtext: "距离目标日期还有",
      daysDelta: 245
    })),
    updateAnniversary: vi.fn(),
    deleteAnniversary: vi.fn()
  };
  const habitDomain = {
    listHabits: vi.fn().mockResolvedValue([flowHabit]),
    getHabit: vi.fn(async (_userId: string, id: string) => id === flowHabit.id ? flowHabit : null),
    getHabitDetail: vi.fn().mockResolvedValue(flowHabitDetail),
    createHabit: vi.fn(async (_userId: string, input: Record<string, unknown>) => ({
      ...flowHabit,
      id: "created-habit",
      ...input
    })),
    updateHabit: vi.fn(),
    deleteHabit: vi.fn(),
    checkInHabit: vi.fn().mockResolvedValue(flowHabitDetail.logs[0]),
    cancelHabitCheckIn: vi.fn().mockResolvedValue(undefined)
  };
  const orchestrator = new AiOrchestrator({
    store: store as unknown as AiStore,
    deepSeek,
    now: () => now,
    toolContextFactory: (userId) => createAiToolContext({
      userId,
      taskDomain,
      anniversaryDomain,
      habitDomain
    })
  });
  const executor = new AiActionExecutor({
    store: store as unknown as AiStore,
    taskDomain,
    anniversaryDomain,
    habitDomain
  });

  return {
    deps: {
      configured: true,
      store: store as unknown as AiStore,
      orchestrator,
      executor
    } satisfies AiRouteDependencies,
    deepSeek,
    store,
    taskDomain,
    anniversaryDomain,
    habitDomain
  };
}

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

  it("creates an editable batch proposal and writes only after one idempotent confirmation", async () => {
    const harness = createFullFlowHarness([
      scriptedResult({
        type: "proposal",
        summary: "创建两个待办",
        actions: [
          {
            clientId: "task-a",
            objectType: "TASK",
            actionType: "CREATE",
            targetId: null,
            input: {
              title: "买咖啡豆",
              notes: null,
              startAt: null,
              dueAt: "2026-07-11T06:00:00.000Z",
              priority: "IMPORTANT_NOT_URGENT",
              status: "TODO",
              tagId: null,
              recurrenceRule: null
            }
          },
          {
            clientId: "task-b",
            objectType: "TASK",
            actionType: "CREATE",
            targetId: null,
            input: {
              title: "交周报",
              notes: null,
              startAt: null,
              dueAt: "2026-07-11T09:00:00.000Z",
              priority: "IMPORTANT_URGENT",
              status: "TODO",
              tagId: null,
              recurrenceRule: null
            }
          }
        ]
      })
    ]);

    const sent = await injectAi(
      harness.deps,
      "POST",
      "/ai/sessions/session-1/messages",
      { content: "明天下午买咖啡豆，周五交周报" }
    );

    expect(sent.statusCode).toBe(200);
    expect(harness.taskDomain.createTask).not.toHaveBeenCalled();
    const createdProposal = sent.json().assistantMessage.metadata.proposal as ApiAiProposal;
    const edited = await injectAi(
      harness.deps,
      "PATCH",
      `/ai/proposals/${createdProposal.id}`,
      {
        version: createdProposal.version,
        actions: [
          {
            clientId: "task-a",
            objectType: "TASK",
            actionType: "CREATE",
            targetId: null,
            input: createdProposal.items[0]!.input
          },
          {
            clientId: "task-b",
            objectType: "TASK",
            actionType: "CREATE",
            targetId: null,
            input: { ...createdProposal.items[1]!.input, title: "提交并发送周报" }
          }
        ]
      }
    );
    expect(edited.statusCode).toBe(200);
    const editedProposal = edited.json().proposal as ApiAiProposal;
    const confirmation = {
      version: editedProposal.version,
      idempotencyKey: "86b5957a-3d25-4d74-8b4f-cd49566baf2f"
    };

    const confirmed = await injectAi(
      harness.deps,
      "POST",
      `/ai/proposals/${createdProposal.id}/confirm`,
      confirmation
    );
    const replayed = await injectAi(
      harness.deps,
      "POST",
      `/ai/proposals/${createdProposal.id}/confirm`,
      confirmation
    );

    expect(confirmed.statusCode).toBe(200);
    expect(confirmed.json()).toMatchObject({
      proposal: { status: "SUCCEEDED" },
      changedDomains: ["tasks"]
    });
    expect(replayed.statusCode).toBe(200);
    expect(harness.taskDomain.createTask).toHaveBeenCalledTimes(2);
    expect(harness.taskDomain.createTask).toHaveBeenLastCalledWith(
      "user-1",
      expect.objectContaining({ title: "提交并发送周报" })
    );
  });

  it("returns query-only results and clarifies ambiguous observed targets without writing", async () => {
    const duplicateTask = { ...flowTask, id: "task-duplicate", title: "交周报" };
    const queryHarness = createFullFlowHarness([
      scriptedTool("search_tasks", {
        query: "周报",
        statuses: ["TODO"],
        from: null,
        to: null,
        limit: 10
      }),
      scriptedResult({
        type: "answer",
        text: "找到 1 个待办",
        records: [{ objectType: "TASK", id: flowTask.id }]
      })
    ]);

    const query = await injectAi(
      queryHarness.deps,
      "POST",
      "/ai/sessions/session-1/messages",
      { content: "今天有哪些周报待办" }
    );

    expect(query.statusCode).toBe(200);
    expect(query.json().assistantMessage).toMatchObject({
      kind: "QUERY_RESULT",
      metadata: {
        records: [expect.objectContaining({ id: flowTask.id, objectType: "TASK" })]
      }
    });
    expect(queryHarness.taskDomain.createTask).not.toHaveBeenCalled();

    const clarificationHarness = createFullFlowHarness([
      scriptedTool("search_tasks", {
        query: "周报",
        statuses: ["TODO"],
        from: null,
        to: null,
        limit: 10
      }),
      scriptedResult({
        type: "clarification",
        prompt: "你指的是哪一个周报待办？",
        candidates: [
          { objectType: "TASK", id: flowTask.id, label: "周报（今天）" },
          { objectType: "TASK", id: duplicateTask.id, label: "周报（明天）" }
        ]
      })
    ], [flowTask, duplicateTask]);

    const clarification = await injectAi(
      clarificationHarness.deps,
      "POST",
      "/ai/sessions/session-1/messages",
      { content: "删除周报" }
    );

    expect(clarification.statusCode).toBe(200);
    expect(clarification.json().assistantMessage).toMatchObject({
      kind: "CLARIFICATION",
      content: "你指的是哪一个周报待办？"
    });
    expect(clarificationHarness.store.createProposal).not.toHaveBeenCalled();
  });

  it("confirms a solar birthday and an open-ended daily habit through domain services", async () => {
    const harness = createFullFlowHarness([
      scriptedResult({
        type: "proposal",
        summary: "创建生日和每日习惯",
        actions: [
          {
            clientId: "birthday-a",
            objectType: "ANNIVERSARY",
            actionType: "CREATE",
            targetId: null,
            input: {
              title: "我的生日",
              notes: null,
              category: "BIRTHDAY",
              date: "2027-03-12",
              repeat: "YEARLY",
              direction: "COUNTDOWN",
              cardStyle: "lavender",
              calendarType: "SOLAR",
              lunarMonth: null,
              lunarDay: null,
              solarTerm: null
            }
          },
          {
            clientId: "habit-a",
            objectType: "HABIT",
            actionType: "CREATE",
            targetId: null,
            input: {
              title: "每天喝水",
              notes: null,
              icon: "Droplets",
              color: "blue",
              frequency: "DAILY",
              interval: 1,
              weekDays: [],
              monthDays: [],
              startDate: "2026-07-10",
              endDate: null
            }
          }
        ]
      })
    ]);

    const sent = await injectAi(
      harness.deps,
      "POST",
      "/ai/sessions/session-1/messages",
      { content: "3月12日是我的生日，再创建每天喝水" }
    );
    const pending = sent.json().assistantMessage.metadata.proposal as ApiAiProposal;
    expect(harness.anniversaryDomain.createAnniversary).not.toHaveBeenCalled();
    expect(harness.habitDomain.createHabit).not.toHaveBeenCalled();

    const confirmed = await injectAi(
      harness.deps,
      "POST",
      `/ai/proposals/${pending.id}/confirm`,
      {
        version: pending.version,
        idempotencyKey: "d7355a8b-f7d7-4f63-9e36-a35fc6617fb5"
      }
    );

    expect(confirmed.statusCode).toBe(200);
    expect(confirmed.json().changedDomains).toEqual(["anniversaries", "habits"]);
    expect(harness.anniversaryDomain.createAnniversary).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ calendarType: "SOLAR", category: "BIRTHDAY" })
    );
    expect(harness.habitDomain.createHabit).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ frequency: "DAILY", endDate: null })
    );
  });

  it("checks in and cancels an observed habit check-in only after confirmation", async () => {
    const checkInHarness = createFullFlowHarness([
      scriptedTool("search_habits", {
        query: "咖啡",
        includeArchived: false,
        limit: 10
      }),
      scriptedResult({
        type: "proposal",
        summary: "记录咖啡打卡",
        actions: [{
          clientId: "check-in-a",
          objectType: "HABIT_CHECKIN",
          actionType: "CHECK_IN",
          targetId: flowHabit.id,
          input: { date: "2026-07-10", note: "已完成" }
        }]
      })
    ]);
    const checkInSent = await injectAi(
      checkInHarness.deps,
      "POST",
      "/ai/sessions/session-1/messages",
      { content: "我今天喝咖啡了" }
    );
    const checkInProposal = checkInSent.json().assistantMessage.metadata.proposal as ApiAiProposal;
    expect(checkInHarness.habitDomain.checkInHabit).not.toHaveBeenCalled();
    expect((await injectAi(
      checkInHarness.deps,
      "POST",
      `/ai/proposals/${checkInProposal.id}/confirm`,
      {
        version: checkInProposal.version,
        idempotencyKey: "ea36db24-af65-49a2-a442-9173ed81f0c1"
      }
    )).statusCode).toBe(200);
    expect(checkInHarness.habitDomain.checkInHabit).toHaveBeenCalledWith(
      "user-1",
      flowHabit.id,
      { date: "2026-07-10", note: "已完成" }
    );

    const cancelHarness = createFullFlowHarness([
      scriptedTool("search_habits", {
        query: "咖啡",
        includeArchived: false,
        limit: 10
      }),
      scriptedTool("get_habit_checkins", {
        habitId: flowHabit.id,
        from: "2026-07-10",
        to: "2026-07-10",
        limit: 10
      }),
      scriptedResult({
        type: "proposal",
        summary: "取消咖啡打卡",
        actions: [{
          clientId: "cancel-check-in-a",
          objectType: "HABIT_CHECKIN",
          actionType: "CANCEL_CHECK_IN",
          targetId: flowHabit.id,
          input: { date: "2026-07-10" }
        }]
      })
    ]);
    const cancelSent = await injectAi(
      cancelHarness.deps,
      "POST",
      "/ai/sessions/session-1/messages",
      { content: "取消今天的咖啡打卡" }
    );
    const cancelProposal = cancelSent.json().assistantMessage.metadata.proposal as ApiAiProposal;
    expect(cancelHarness.habitDomain.cancelHabitCheckIn).not.toHaveBeenCalled();
    expect((await injectAi(
      cancelHarness.deps,
      "POST",
      `/ai/proposals/${cancelProposal.id}/confirm`,
      {
        version: cancelProposal.version,
        idempotencyKey: "82096b69-e44d-46a4-8b7f-01d2749bb852"
      }
    )).statusCode).toBe(200);
    expect(cancelHarness.habitDomain.cancelHabitCheckIn).toHaveBeenCalledWith(
      "user-1",
      flowHabit.id,
      "2026-07-10"
    );
  });
});
