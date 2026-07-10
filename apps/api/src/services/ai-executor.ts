import { z } from "zod";
import {
  createAnniversaryRequestSchema,
  createHabitRequestSchema,
  createTaskRequestSchema,
  habitCheckInRequestSchema,
  updateAnniversaryRequestSchema,
  updateHabitRequestSchema,
  updateTaskRequestSchema,
  type AiChangedDomain,
  type ApiAiActionItem,
  type ApiAiProposal
} from "@todo/shared";
import {
  createAnniversary,
  deleteAnniversary,
  getAnniversary,
  updateAnniversary
} from "./anniversary-domain.js";
import {
  cancelHabitCheckIn,
  checkInHabit,
  createHabit,
  deleteHabit,
  getHabit,
  getHabitDetail,
  updateHabit
} from "./habit-domain.js";
import { AiStoreConflictError, aiStore, type AiStore } from "./ai-store.js";
import {
  createTask,
  deleteTask,
  getTask,
  updateTask
} from "./task-domain.js";

interface TaskCommandDomain {
  getTask: typeof getTask;
  createTask: typeof createTask;
  updateTask: typeof updateTask;
  deleteTask: typeof deleteTask;
}

interface AnniversaryCommandDomain {
  getAnniversary: typeof getAnniversary;
  createAnniversary: typeof createAnniversary;
  updateAnniversary: typeof updateAnniversary;
  deleteAnniversary: typeof deleteAnniversary;
}

interface HabitCommandDomain {
  getHabit: typeof getHabit;
  getHabitDetail: typeof getHabitDetail;
  createHabit: typeof createHabit;
  updateHabit: typeof updateHabit;
  deleteHabit: typeof deleteHabit;
  checkInHabit: typeof checkInHabit;
  cancelHabitCheckIn: typeof cancelHabitCheckIn;
}

export interface AiActionExecutorOptions {
  store: AiStore;
  taskDomain: TaskCommandDomain;
  anniversaryDomain: AnniversaryCommandDomain;
  habitDomain: HabitCommandDomain;
}

export interface ConfirmAiActionsInput {
  userId: string;
  proposalId: string;
  expectedVersion: number;
  idempotencyKey: string;
  now: Date;
}

export interface RetryFailedAiActionsInput {
  userId: string;
  proposalId: string;
  expectedVersion?: number;
  idempotencyKey: string;
  now: Date;
}

export interface AiActionExecutionResult {
  proposal: ApiAiProposal;
  changedDomains: AiChangedDomain[];
}

export class AiExecutionError extends Error {
  constructor(
    public readonly code:
      | "UNSUPPORTED_ACTION"
      | "MISSING_TARGET"
      | "INVALID_SNAPSHOT"
      | "NOT_FOUND"
      | "STALE_TARGET",
    message: string
  ) {
    super(message);
    this.name = "AiExecutionError";
  }
}

function requireTargetId(item: ApiAiActionItem) {
  if (!item.targetId) {
    throw new AiExecutionError("MISSING_TARGET", "Action target is missing");
  }
  return item.targetId;
}

function snapshotString(item: ApiAiActionItem, key: string) {
  const value = item.targetSnapshot?.[key];
  if (typeof value !== "string" || !value) {
    throw new AiExecutionError("INVALID_SNAPSHOT", "Action target snapshot is invalid");
  }
  return value;
}

function assertMatchingTimestamp(current: string, snapshot: string) {
  if (current !== snapshot) {
    throw new AiExecutionError("STALE_TARGET", "Action target changed before confirmation");
  }
}

function asResult(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function changedDomainForItem(item: ApiAiActionItem): AiChangedDomain {
  if (item.objectType === "TASK") {
    return "tasks";
  }
  if (item.objectType === "ANNIVERSARY") {
    return "anniversaries";
  }
  return "habits";
}

function changedDomainsFromStoredProposal(proposal: ApiAiProposal) {
  const domains = new Set<AiChangedDomain>();
  for (const item of proposal.items) {
    if (item.status === "SUCCEEDED") {
      domains.add(changedDomainForItem(item));
    }
  }
  return [...domains];
}

function errorCode(error: unknown) {
  if (error instanceof AiExecutionError) {
    return error.code;
  }
  if (error instanceof z.ZodError) {
    return "INVALID_INPUT";
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    /^[A-Z][A-Z0-9_]{1,63}$/.test(error.code)
  ) {
    return error.code;
  }
  return "ACTION_FAILED";
}

function safeErrorMessage(error: unknown) {
  if (error instanceof AiExecutionError || error instanceof z.ZodError) {
    return error.message.slice(0, 1000);
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message.slice(0, 1000);
  }
  return "Action could not be completed";
}

export class AiActionExecutor {
  constructor(private readonly options: AiActionExecutorOptions) {}

  private async assertFreshTaskTarget(userId: string, item: ApiAiActionItem) {
    const current = await this.options.taskDomain.getTask(userId, requireTargetId(item));
    if (!current) {
      throw new AiExecutionError("NOT_FOUND", "Task not found");
    }
    assertMatchingTimestamp(current.updatedAt, snapshotString(item, "updatedAt"));
  }

  private async assertFreshAnniversaryTarget(userId: string, item: ApiAiActionItem) {
    const current = await this.options.anniversaryDomain.getAnniversary(
      userId,
      requireTargetId(item)
    );
    if (!current) {
      throw new AiExecutionError("NOT_FOUND", "Anniversary not found");
    }
    assertMatchingTimestamp(current.updatedAt, snapshotString(item, "updatedAt"));
  }

  private async assertFreshHabitTarget(userId: string, item: ApiAiActionItem) {
    const current = await this.options.habitDomain.getHabit(userId, requireTargetId(item));
    if (!current) {
      throw new AiExecutionError("NOT_FOUND", "Habit not found");
    }
    const snapshot = item.targetSnapshot?.habitUpdatedAt ?? item.targetSnapshot?.updatedAt;
    if (typeof snapshot !== "string") {
      throw new AiExecutionError("INVALID_SNAPSHOT", "Habit snapshot is invalid");
    }
    assertMatchingTimestamp(current.updatedAt, snapshot);
  }

  private async assertFreshCheckInTarget(
    userId: string,
    item: ApiAiActionItem,
    date: string
  ) {
    const habitId = requireTargetId(item);
    const currentHabit = await this.options.habitDomain.getHabit(userId, habitId);
    if (!currentHabit) {
      throw new AiExecutionError("NOT_FOUND", "Habit not found");
    }
    const detail = await this.options.habitDomain.getHabitDetail(
      userId,
      habitId,
      date.slice(0, 7)
    );
    const currentCheckIn = detail?.logs.find((log) => log.date === date);
    if (!currentCheckIn) {
      throw new AiExecutionError("NOT_FOUND", "Habit check-in not found");
    }
    assertMatchingTimestamp(
      currentHabit.updatedAt,
      snapshotString(item, "habitUpdatedAt")
    );
    assertMatchingTimestamp(
      currentCheckIn.updatedAt,
      snapshotString(item, "checkInUpdatedAt")
    );
    const snapshotDate = snapshotString(item, "date");
    if (snapshotDate !== date) {
      throw new AiExecutionError("STALE_TARGET", "Habit check-in date changed");
    }
  }

  private async executeAction(userId: string, item: ApiAiActionItem) {
    if (item.objectType === "TASK" && item.actionType === "CREATE") {
      return asResult(await this.options.taskDomain.createTask(
        userId,
        createTaskRequestSchema.parse(item.input)
      ));
    }
    if (item.objectType === "TASK" && item.actionType === "UPDATE") {
      await this.assertFreshTaskTarget(userId, item);
      return asResult(await this.options.taskDomain.updateTask(
        userId,
        requireTargetId(item),
        updateTaskRequestSchema.parse(item.input)
      ));
    }
    if (item.objectType === "TASK" && item.actionType === "DELETE") {
      await this.assertFreshTaskTarget(userId, item);
      const targetId = requireTargetId(item);
      await this.options.taskDomain.deleteTask(userId, targetId);
      return { id: targetId, deleted: true };
    }
    if (item.objectType === "ANNIVERSARY" && item.actionType === "CREATE") {
      return asResult(await this.options.anniversaryDomain.createAnniversary(
        userId,
        createAnniversaryRequestSchema.parse(item.input)
      ));
    }
    if (item.objectType === "ANNIVERSARY" && item.actionType === "UPDATE") {
      await this.assertFreshAnniversaryTarget(userId, item);
      return asResult(await this.options.anniversaryDomain.updateAnniversary(
        userId,
        requireTargetId(item),
        updateAnniversaryRequestSchema.parse(item.input)
      ));
    }
    if (item.objectType === "ANNIVERSARY" && item.actionType === "DELETE") {
      await this.assertFreshAnniversaryTarget(userId, item);
      const targetId = requireTargetId(item);
      await this.options.anniversaryDomain.deleteAnniversary(userId, targetId);
      return { id: targetId, deleted: true };
    }
    if (item.objectType === "HABIT" && item.actionType === "CREATE") {
      return asResult(await this.options.habitDomain.createHabit(
        userId,
        createHabitRequestSchema.parse(item.input)
      ));
    }
    if (item.objectType === "HABIT" && item.actionType === "UPDATE") {
      await this.assertFreshHabitTarget(userId, item);
      return asResult(await this.options.habitDomain.updateHabit(
        userId,
        requireTargetId(item),
        updateHabitRequestSchema.parse(item.input)
      ));
    }
    if (item.objectType === "HABIT" && item.actionType === "DELETE") {
      await this.assertFreshHabitTarget(userId, item);
      const targetId = requireTargetId(item);
      await this.options.habitDomain.deleteHabit(userId, targetId);
      return { id: targetId, deleted: true };
    }
    if (item.objectType === "HABIT" && item.actionType === "ARCHIVE") {
      await this.assertFreshHabitTarget(userId, item);
      return asResult(await this.options.habitDomain.updateHabit(
        userId,
        requireTargetId(item),
        { archived: true }
      ));
    }
    if (item.objectType === "HABIT" && item.actionType === "RESTORE") {
      await this.assertFreshHabitTarget(userId, item);
      return asResult(await this.options.habitDomain.updateHabit(
        userId,
        requireTargetId(item),
        { archived: false }
      ));
    }
    if (item.objectType === "HABIT_CHECKIN" && item.actionType === "CHECK_IN") {
      await this.assertFreshHabitTarget(userId, item);
      return asResult(await this.options.habitDomain.checkInHabit(
        userId,
        requireTargetId(item),
        habitCheckInRequestSchema.parse(item.input)
      ));
    }
    if (
      item.objectType === "HABIT_CHECKIN" &&
      item.actionType === "CANCEL_CHECK_IN"
    ) {
      const input = z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
      }).parse(item.input);
      await this.assertFreshCheckInTarget(userId, item, input.date);
      const habitId = requireTargetId(item);
      await this.options.habitDomain.cancelHabitCheckIn(userId, habitId, input.date);
      return { habitId, date: input.date, deleted: true };
    }
    throw new AiExecutionError(
      "UNSUPPORTED_ACTION",
      [item.objectType, item.actionType].join(":")
    );
  }

  async confirm(input: ConfirmAiActionsInput): Promise<AiActionExecutionResult> {
    const claimed = await this.options.store.claimProposalForExecution({
      userId: input.userId,
      proposalId: input.proposalId,
      expectedVersion: input.expectedVersion,
      idempotencyKey: input.idempotencyKey,
      now: input.now
    });
    if (claimed.replay) {
      return {
        proposal: claimed.proposal,
        changedDomains: changedDomainsFromStoredProposal(claimed.proposal)
      };
    }

    const changedDomains = new Set<AiChangedDomain>();
    for (const item of claimed.proposal.items.filter((candidate) => (
      candidate.status === "PENDING"
    ))) {
      try {
        const result = await this.executeAction(input.userId, item);
        await this.options.store.recordActionResult({
          proposalId: input.proposalId,
          itemId: item.id,
          status: "SUCCEEDED",
          result
        });
        changedDomains.add(changedDomainForItem(item));
      } catch (error) {
        await this.options.store.recordActionResult({
          proposalId: input.proposalId,
          itemId: item.id,
          status: "FAILED",
          errorCode: errorCode(error),
          errorMessage: safeErrorMessage(error)
        });
      }
    }

    const finalProposal = await this.options.store.finishProposal(
      input.userId,
      input.proposalId
    );
    return {
      proposal: finalProposal,
      changedDomains: [...changedDomains]
    };
  }

  async retryFailed(
    input: RetryFailedAiActionsInput
  ): Promise<AiActionExecutionResult> {
    if (input.expectedVersion !== undefined) {
      const current = await this.options.store.getProposal(
        input.userId,
        input.proposalId
      );
      if (!current) {
        throw new AiStoreConflictError("NOT_FOUND", "AI proposal not found");
      }
      if (current.version !== input.expectedVersion) {
        throw new AiStoreConflictError(
          "VERSION_CONFLICT",
          "AI proposal version changed"
        );
      }
    }
    const reset = await this.options.store.resetFailedItemsForRetry(
      input.userId,
      input.proposalId
    );
    return this.confirm({
      userId: input.userId,
      proposalId: input.proposalId,
      idempotencyKey: input.idempotencyKey,
      now: input.now,
      expectedVersion: reset.version
    });
  }
}

export const aiActionExecutor = new AiActionExecutor({
  store: aiStore,
  taskDomain: { getTask, createTask, updateTask, deleteTask },
  anniversaryDomain: {
    getAnniversary,
    createAnniversary,
    updateAnniversary,
    deleteAnniversary
  },
  habitDomain: {
    getHabit,
    getHabitDetail,
    createHabit,
    updateHabit,
    deleteHabit,
    checkInHabit,
    cancelHabitCheckIn
  }
});
