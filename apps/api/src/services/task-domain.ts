import type {
  ApiTag,
  ApiTask,
  CreateTaskRequest,
  RecurrenceRuleInput,
  TaskStatus,
  UpdateTaskRequest
} from "@todo/shared";
import {
  createTaskRequestSchema,
  sortTasksForDisplay,
  updateTaskRequestSchema
} from "@todo/shared";
import {
  asDate,
  execute,
  id,
  queryOne,
  queryRows,
  toMysqlDate,
  transaction,
  type DbRow
} from "../db.js";
import { normalizeTaskPriority } from "./task-priority.js";

export type TaskRow = DbRow & {
  id: string;
  userId: string;
  title: string;
  notes: string | null;
  startAt: Date | string | null;
  dueAt: Date | string | null;
  priority: string;
  status: TaskStatus;
  sortOrder: number | string | null;
  completedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type RecurrenceRow = DbRow & {
  taskId: string;
  frequency: RecurrenceRuleInput["frequency"];
  interval: number;
  until: Date | string | null;
  count: number | null;
  byWeekday: string | string[] | null;
};

const taskDisplayOrderSql = "CASE WHEN `status` = 'COMPLETED' THEN 1 ELSE 0 END ASC, CASE WHEN `sortOrder` IS NULL THEN 1 ELSE 0 END ASC, `sortOrder` ASC, `createdAt` ASC, `id` ASC";

export class TaskDomainError extends Error {
  constructor(
    public readonly code: "NOT_FOUND" | "TAG_NOT_FOUND" | "INVALID_TIME_RANGE",
    message: string
  ) {
    super(message);
    this.name = "TaskDomainError";
  }
}

function parseWeekdays(value: RecurrenceRow["byWeekday"]) {
  if (!value) {
    return null;
  }
  if (Array.isArray(value)) {
    return value as RecurrenceRuleInput["byWeekday"];
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as RecurrenceRuleInput["byWeekday"] : null;
  } catch {
    return null;
  }
}

export function serializeTaskRecurrence(rule: RecurrenceRow | null): RecurrenceRuleInput | null {
  if (!rule) {
    return null;
  }

  return {
    frequency: rule.frequency,
    interval: rule.interval,
    until: asDate(rule.until)?.toISOString() ?? null,
    count: rule.count,
    byWeekday: parseWeekdays(rule.byWeekday)
  };
}

async function getTags(taskId: string): Promise<ApiTag[]> {
  const rows = await queryRows<DbRow & { id: string; name: string }>(
    "SELECT t.id, t.name FROM `TaskTag` tt INNER JOIN `Tag` t ON t.id = tt.tagId WHERE tt.taskId = ? ORDER BY t.name",
    [taskId]
  );
  return rows.map((tag) => ({ id: tag.id, name: tag.name }));
}

export async function getTaskRecurrence(taskId: string) {
  return queryOne<RecurrenceRow>("SELECT * FROM `RecurrenceRule` WHERE `taskId` = ?", [taskId]);
}

async function getPomodoroTotals(taskId: string) {
  const row = await queryOne<DbRow & { completedCount: number; completedMinutes: number }>(
    "SELECT COUNT(*) AS completedCount, COALESCE(SUM(COALESCE(`actualMinutes`, `durationMinutes`)), 0) AS completedMinutes FROM `PomodoroSession` WHERE `taskId` = ? AND `status` = 'COMPLETED'",
    [taskId]
  );
  return {
    count: Number(row?.completedCount ?? 0),
    minutes: Number(row?.completedMinutes ?? 0)
  };
}

export async function serializeTaskRow(row: TaskRow): Promise<ApiTask> {
  const [tags, recurrenceRule, pomodoro] = await Promise.all([
    getTags(row.id),
    getTaskRecurrence(row.id),
    getPomodoroTotals(row.id)
  ]);

  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    startAt: asDate(row.startAt)?.toISOString() ?? null,
    dueAt: asDate(row.dueAt)?.toISOString() ?? null,
    priority: normalizeTaskPriority(row.priority),
    status: row.status,
    sortOrder: row.sortOrder === null || row.sortOrder === undefined ? null : Number(row.sortOrder),
    createdAt: asDate(row.createdAt)?.toISOString() ?? new Date().toISOString(),
    updatedAt: asDate(row.updatedAt)?.toISOString() ?? new Date().toISOString(),
    completedAt: asDate(row.completedAt)?.toISOString() ?? null,
    recurrenceRule: serializeTaskRecurrence(recurrenceRule),
    tags,
    pomodoroCompletedCount: pomodoro.count,
    pomodoroCompletedMinutes: pomodoro.minutes
  };
}

async function tagBelongsToUser(tagId: string, userId: string) {
  const tag = await queryOne<DbRow & { id: string }>(
    "SELECT `id` FROM `Tag` WHERE `id` = ? AND `userId` = ?",
    [tagId, userId]
  );
  return Boolean(tag);
}

async function upsertRecurrence(taskId: string, recurrenceRule: RecurrenceRuleInput | null) {
  if (!recurrenceRule) {
    await execute("DELETE FROM `RecurrenceRule` WHERE `taskId` = ?", [taskId]);
    return;
  }

  await execute(
    `INSERT INTO \`RecurrenceRule\`
      (\`id\`, \`taskId\`, \`frequency\`, \`interval\`, \`until\`, \`count\`, \`byWeekday\`, \`updatedAt\`)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW(3))
     ON DUPLICATE KEY UPDATE
      \`frequency\` = VALUES(\`frequency\`),
      \`interval\` = VALUES(\`interval\`),
      \`until\` = VALUES(\`until\`),
      \`count\` = VALUES(\`count\`),
      \`byWeekday\` = VALUES(\`byWeekday\`),
      \`updatedAt\` = NOW(3)`,
    [
      id(),
      taskId,
      recurrenceRule.frequency,
      recurrenceRule.interval,
      toMysqlDate(recurrenceRule.until ? new Date(recurrenceRule.until) : null),
      recurrenceRule.count,
      recurrenceRule.byWeekday ? JSON.stringify(recurrenceRule.byWeekday) : null
    ]
  );
}

function selectedTaskDate(input: string | null | undefined, existing: Date | string | null) {
  if (input === undefined) {
    return asDate(existing);
  }
  return input ? new Date(input) : null;
}

function taskTimeRangeIsValid(startAt: Date | null, dueAt: Date | null) {
  return !startAt || !dueAt || startAt.getTime() <= dueAt.getTime();
}

export async function listTasks(userId: string): Promise<ApiTask[]> {
  const rows = await queryRows<TaskRow>(
    `SELECT * FROM \`Task\` WHERE \`userId\` = ? AND \`status\` <> 'ARCHIVED' ORDER BY ${taskDisplayOrderSql}`,
    [userId]
  );
  return sortTasksForDisplay(await Promise.all(rows.map(serializeTaskRow)));
}

export async function getTask(userId: string, taskId: string): Promise<ApiTask | null> {
  const row = await queryOne<TaskRow>(
    "SELECT * FROM `Task` WHERE `id` = ? AND `userId` = ?",
    [taskId, userId]
  );
  return row ? serializeTaskRow(row) : null;
}

export async function createTask(userId: string, input: CreateTaskRequest): Promise<ApiTask> {
  const body = createTaskRequestSchema.parse(input);
  const taskId = id();
  const tagId = body.tagId ?? null;
  if (tagId && !(await tagBelongsToUser(tagId, userId))) {
    throw new TaskDomainError("TAG_NOT_FOUND", "Tag not found");
  }

  await transaction(async (connection) => {
    await connection.execute(
      `INSERT INTO \`Task\`
        (\`id\`, \`userId\`, \`title\`, \`notes\`, \`startAt\`, \`dueAt\`, \`priority\`, \`status\`, \`completedAt\`, \`updatedAt\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))`,
      [
        taskId,
        userId,
        body.title,
        body.notes ?? null,
        toMysqlDate(body.startAt ? new Date(body.startAt) : null),
        toMysqlDate(body.dueAt ? new Date(body.dueAt) : null),
        body.priority,
        body.status,
        body.status === "COMPLETED" ? toMysqlDate(new Date()) : null
      ]
    );
    if (tagId) {
      await connection.execute(
        "INSERT INTO `TaskTag` (`taskId`, `tagId`) VALUES (?, ?)",
        [taskId, tagId]
      );
    }
  });

  await upsertRecurrence(taskId, body.recurrenceRule ?? null);
  const task = await getTask(userId, taskId);
  if (!task) {
    throw new TaskDomainError("NOT_FOUND", "Task not found after creation");
  }
  return task;
}

export async function updateTask(
  userId: string,
  taskId: string,
  input: UpdateTaskRequest
): Promise<ApiTask> {
  const body = updateTaskRequestSchema.parse(input);
  const existing = await queryOne<TaskRow>(
    "SELECT * FROM `Task` WHERE `id` = ? AND `userId` = ?",
    [taskId, userId]
  );
  if (!existing) {
    throw new TaskDomainError("NOT_FOUND", "Task not found");
  }

  const tagId = body.tagId ?? null;
  if (body.tagId !== undefined && tagId && !(await tagBelongsToUser(tagId, userId))) {
    throw new TaskDomainError("TAG_NOT_FOUND", "Tag not found");
  }

  const nextStartAt = selectedTaskDate(body.startAt, existing.startAt);
  const nextDueAt = selectedTaskDate(body.dueAt, existing.dueAt);
  if (!taskTimeRangeIsValid(nextStartAt, nextDueAt)) {
    throw new TaskDomainError("INVALID_TIME_RANGE", "Start time must not be later than due time");
  }

  await transaction(async (connection) => {
    await connection.execute(
      `UPDATE \`Task\` SET
        \`title\` = COALESCE(?, \`title\`),
        \`notes\` = ?,
        \`startAt\` = ?,
        \`dueAt\` = ?,
        \`priority\` = COALESCE(?, \`priority\`),
        \`status\` = COALESCE(?, \`status\`),
        \`completedAt\` = ?,
        \`updatedAt\` = NOW(3)
       WHERE \`id\` = ? AND \`userId\` = ?`,
      [
        body.title ?? null,
        body.notes === undefined ? existing.notes : body.notes,
        body.startAt === undefined ? existing.startAt : toMysqlDate(body.startAt ? new Date(body.startAt) : null),
        body.dueAt === undefined ? existing.dueAt : toMysqlDate(body.dueAt ? new Date(body.dueAt) : null),
        body.priority ?? null,
        body.status ?? null,
        body.status === undefined ? existing.completedAt : body.status === "COMPLETED" ? toMysqlDate(new Date()) : null,
        taskId,
        userId
      ]
    );

    if (body.tagId !== undefined) {
      await connection.execute("DELETE FROM `TaskTag` WHERE `taskId` = ?", [taskId]);
      if (tagId) {
        await connection.execute(
          "INSERT INTO `TaskTag` (`taskId`, `tagId`) VALUES (?, ?)",
          [taskId, tagId]
        );
      }
    }
  });

  if (body.recurrenceRule !== undefined) {
    await upsertRecurrence(taskId, body.recurrenceRule);
  }

  const task = await getTask(userId, taskId);
  if (!task) {
    throw new TaskDomainError("NOT_FOUND", "Task not found");
  }
  return task;
}

export async function deleteTask(userId: string, taskId: string): Promise<void> {
  const result = await execute(
    "DELETE FROM `Task` WHERE `id` = ? AND `userId` = ?",
    [taskId, userId]
  );
  if (!result.affectedRows) {
    throw new TaskDomainError("NOT_FOUND", "Task not found");
  }
}

export interface TaskDomainService {
  listTasks(userId: string): Promise<ApiTask[]>;
  getTask(userId: string, taskId: string): Promise<ApiTask | null>;
  createTask(userId: string, input: CreateTaskRequest): Promise<ApiTask>;
  updateTask(userId: string, taskId: string, input: UpdateTaskRequest): Promise<ApiTask>;
  deleteTask(userId: string, taskId: string): Promise<void>;
}

export const taskDomainService: TaskDomainService = {
  listTasks,
  getTask,
  createTask,
  updateTask,
  deleteTask
};
