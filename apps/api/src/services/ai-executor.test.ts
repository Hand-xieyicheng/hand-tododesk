import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ApiAiActionItem,
  ApiAiProposal,
  ApiTask
} from "@todo/shared";
import type { AiStore } from "./ai-store.js";
import { AiActionExecutor } from "./ai-executor.js";

const now = new Date("2026-07-10T08:00:00.000Z");
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

function item(patch: Partial<ApiAiActionItem> = {}): ApiAiActionItem {
  return {
    id: "item-1",
    position: 0,
    objectType: "TASK",
    actionType: "CREATE",
    targetId: null,
    input: {
      title: "交周报",
      notes: null,
      startAt: null,
      dueAt: "2026-07-10T09:00:00.000Z",
      priority: "IMPORTANT_URGENT",
      status: "TODO",
      tagId: null,
      recurrenceRule: null
    },
    targetSnapshot: null,
    status: "PENDING",
    result: null,
    errorCode: null,
    errorMessage: null,
    ...patch
  };
}

function proposal(
  status: ApiAiProposal["status"] = "EXECUTING",
  items: ApiAiActionItem[] = [item()],
  version = 2
): ApiAiProposal {
  return {
    id: "proposal-1",
    sessionId: "session-1",
    messageId: "message-1",
    status,
    version,
    expiresAt: "2026-07-10T12:30:00.000Z",
    createdAt: "2026-07-10T07:00:00.000Z",
    updatedAt: "2026-07-10T07:00:00.000Z",
    items
  };
}

function createHarness() {
  const store = {
    claimProposalForExecution: vi.fn(),
    recordActionResult: vi.fn().mockResolvedValue(undefined),
    finishProposal: vi.fn(),
    resetFailedItemsForRetry: vi.fn()
  };
  const taskDomain = {
    getTask: vi.fn(),
    createTask: vi.fn().mockResolvedValue(task),
    updateTask: vi.fn(),
    deleteTask: vi.fn()
  };
  const anniversaryDomain = {
    getAnniversary: vi.fn(),
    createAnniversary: vi.fn(),
    updateAnniversary: vi.fn(),
    deleteAnniversary: vi.fn()
  };
  const habitDomain = {
    getHabit: vi.fn(),
    getHabitDetail: vi.fn(),
    createHabit: vi.fn(),
    updateHabit: vi.fn(),
    deleteHabit: vi.fn(),
    checkInHabit: vi.fn(),
    cancelHabitCheckIn: vi.fn()
  };
  const executor = new AiActionExecutor({
    store: store as unknown as AiStore,
    taskDomain,
    anniversaryDomain,
    habitDomain
  });
  return {
    executor,
    store,
    taskDomain,
    anniversaryDomain,
    habitDomain
  };
}

describe("AI confirmed action executor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("performs no domain write before confirmation", () => {
    const harness = createHarness();
    expect(harness.taskDomain.createTask).not.toHaveBeenCalled();
    expect(harness.anniversaryDomain.createAnniversary).not.toHaveBeenCalled();
    expect(harness.habitDomain.createHabit).not.toHaveBeenCalled();
  });

  it("executes a confirmed create and reports the changed domain", async () => {
    const harness = createHarness();
    const executing = proposal();
    harness.store.claimProposalForExecution.mockResolvedValue({
      proposal: executing,
      replay: false
    });
    harness.store.finishProposal.mockResolvedValue(proposal(
      "SUCCEEDED",
      [item({ status: "SUCCEEDED", result: { id: "task-1" } })]
    ));

    const result = await harness.executor.confirm({
      userId: "user-1",
      proposalId: "proposal-1",
      expectedVersion: 2,
      idempotencyKey: "86b5957a-3d25-4d74-8b4f-cd49566baf2f",
      now
    });

    expect(harness.taskDomain.createTask).toHaveBeenCalledTimes(1);
    expect(result.proposal.status).toBe("SUCCEEDED");
    expect(result.changedDomains).toEqual(["tasks"]);
    expect(harness.store.recordActionResult).toHaveBeenCalledWith(
      expect.objectContaining({ status: "SUCCEEDED", itemId: "item-1" })
    );
  });

  it("rejects stale and cross-user targets without writing", async () => {
    const staleItem = item({
      actionType: "UPDATE",
      targetId: "task-1",
      input: { title: "提交周报" },
      targetSnapshot: {
        objectType: "TASK",
        id: "task-1",
        updatedAt: "2026-07-08T00:00:00.000Z"
      }
    });
    const harness = createHarness();
    harness.store.claimProposalForExecution.mockResolvedValue({
      proposal: proposal("EXECUTING", [staleItem]),
      replay: false
    });
    harness.taskDomain.getTask.mockResolvedValue(task);
    harness.store.finishProposal.mockResolvedValue(proposal(
      "FAILED",
      [{ ...staleItem, status: "FAILED", errorCode: "STALE_TARGET" }]
    ));

    await harness.executor.confirm({
      userId: "user-1",
      proposalId: "proposal-1",
      expectedVersion: 2,
      idempotencyKey: "idem-stale",
      now
    });
    expect(harness.taskDomain.updateTask).not.toHaveBeenCalled();
    expect(harness.store.recordActionResult).toHaveBeenCalledWith(
      expect.objectContaining({ status: "FAILED", errorCode: "STALE_TARGET" })
    );

    vi.clearAllMocks();
    harness.store.claimProposalForExecution.mockResolvedValue({
      proposal: proposal("EXECUTING", [staleItem]),
      replay: false
    });
    harness.taskDomain.getTask.mockResolvedValue(null);
    harness.store.finishProposal.mockResolvedValue(proposal("FAILED", [
      { ...staleItem, status: "FAILED", errorCode: "NOT_FOUND" }
    ]));
    await harness.executor.confirm({
      userId: "user-1",
      proposalId: "proposal-1",
      expectedVersion: 2,
      idempotencyKey: "idem-foreign",
      now
    });
    expect(harness.taskDomain.updateTask).not.toHaveBeenCalled();
    expect(harness.store.recordActionResult).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: "NOT_FOUND" })
    );
  });

  it("records mixed outcomes and returns only successfully changed domains", async () => {
    const taskItem = item();
    const habitItem = item({
      id: "item-2",
      position: 1,
      objectType: "HABIT",
      actionType: "CREATE",
      input: {
        title: "喝咖啡",
        notes: null,
        icon: "Coffee",
        color: "mint",
        frequency: "DAILY",
        interval: 1,
        weekDays: [],
        monthDays: [],
        startDate: "2026-07-10",
        endDate: null
      }
    });
    const harness = createHarness();
    harness.store.claimProposalForExecution.mockResolvedValue({
      proposal: proposal("EXECUTING", [taskItem, habitItem]),
      replay: false
    });
    harness.habitDomain.createHabit.mockRejectedValue(new Error("database unavailable"));
    harness.store.finishProposal.mockResolvedValue(proposal("PARTIAL_FAILED", [
      { ...taskItem, status: "SUCCEEDED" },
      { ...habitItem, status: "FAILED", errorCode: "ACTION_FAILED" }
    ]));

    const result = await harness.executor.confirm({
      userId: "user-1",
      proposalId: "proposal-1",
      expectedVersion: 2,
      idempotencyKey: "idem-mixed",
      now
    });

    expect(result.proposal.status).toBe("PARTIAL_FAILED");
    expect(result.changedDomains).toEqual(["tasks"]);
    expect(harness.store.recordActionResult).toHaveBeenCalledTimes(2);
  });

  it("returns stored results for an idempotent replay without dispatching", async () => {
    const harness = createHarness();
    harness.store.claimProposalForExecution.mockResolvedValue({
      proposal: proposal("SUCCEEDED", [item({ status: "SUCCEEDED" })]),
      replay: true
    });

    const result = await harness.executor.confirm({
      userId: "user-1",
      proposalId: "proposal-1",
      expectedVersion: 2,
      idempotencyKey: "idem-replay",
      now
    });

    expect(result.proposal.status).toBe("SUCCEEDED");
    expect(result.changedDomains).toEqual(["tasks"]);
    expect(harness.taskDomain.createTask).not.toHaveBeenCalled();
    expect(harness.store.finishProposal).not.toHaveBeenCalled();
  });

  it("cancels a check-in only when both habit and log snapshots are fresh", async () => {
    const date = "2026-07-10";
    const cancelItem = item({
      objectType: "HABIT_CHECKIN",
      actionType: "CANCEL_CHECK_IN",
      targetId: "habit-1",
      input: { date },
      targetSnapshot: {
        objectType: "HABIT_CHECKIN",
        id: "habit-1:2026-07-10",
        date,
        habitUpdatedAt: "2026-07-09T00:00:00.000Z",
        checkInUpdatedAt: "2026-07-10T01:00:00.000Z"
      }
    });
    const harness = createHarness();
    harness.store.claimProposalForExecution.mockResolvedValue({
      proposal: proposal("EXECUTING", [cancelItem]),
      replay: false
    });
    harness.habitDomain.getHabit.mockResolvedValue({
      id: "habit-1",
      updatedAt: "2026-07-09T00:00:00.000Z"
    });
    harness.habitDomain.getHabitDetail.mockResolvedValue({
      logs: [{ date, updatedAt: "2026-07-10T01:00:00.000Z" }]
    });
    harness.store.finishProposal.mockResolvedValue(proposal(
      "SUCCEEDED",
      [{ ...cancelItem, status: "SUCCEEDED" }]
    ));

    const result = await harness.executor.confirm({
      userId: "user-1",
      proposalId: "proposal-1",
      expectedVersion: 2,
      idempotencyKey: "idem-cancel",
      now
    });

    expect(harness.habitDomain.cancelHabitCheckIn).toHaveBeenCalledWith(
      "user-1",
      "habit-1",
      date
    );
    expect(result.changedDomains).toEqual(["habits"]);
  });

  it("resets and retries failed items only", async () => {
    const succeeded = item({ status: "SUCCEEDED" });
    const failed = item({ id: "item-2", position: 1, status: "FAILED" });
    const pendingRetry = { ...failed, status: "PENDING" as const };
    const harness = createHarness();
    harness.store.resetFailedItemsForRetry.mockResolvedValue(proposal(
      "PENDING_CONFIRMATION",
      [succeeded, pendingRetry],
      3
    ));
    harness.store.claimProposalForExecution.mockResolvedValue({
      proposal: proposal("EXECUTING", [succeeded, pendingRetry], 3),
      replay: false
    });
    harness.store.finishProposal.mockResolvedValue(proposal(
      "SUCCEEDED",
      [succeeded, { ...pendingRetry, status: "SUCCEEDED" }],
      3
    ));

    await harness.executor.retryFailed({
      userId: "user-1",
      proposalId: "proposal-1",
      idempotencyKey: "idem-retry",
      now
    });

    expect(harness.taskDomain.createTask).toHaveBeenCalledTimes(1);
    expect(harness.store.recordActionResult).toHaveBeenCalledTimes(1);
    expect(harness.store.recordActionResult).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: "item-2" })
    );
  });
});
