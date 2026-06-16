import type { FastifyInstance } from "fastify";
import type { ApiTag, ApiTask, RecurrenceRuleInput, TaskPriority, TaskStatus } from "@todo/shared";
import {
  calendarQuerySchema,
  createTaskRequestSchema,
  sortTasksForDisplay,
  taskPriorityValues,
  updateTaskRequestSchema
} from "@todo/shared";
import { asDate, execute, id, queryOne, queryRows, toMysqlDate, transaction, type DbRow } from "../db.js";
import { buildOccurrences, type ExpandableTask } from "../services/calendar.js";
import { normalizeTaskPriority } from "../services/task-priority.js";

type TaskRow = DbRow & {
  id: string;
  userId: string;
  title: string;
  notes: string | null;
  dueAt: Date | string | null;
  priority: string;
  status: TaskStatus;
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

type ExceptionRow = DbRow & {
  occurrenceDate: Date | string;
  status: "SKIPPED" | "COMPLETED" | "RESCHEDULED";
  rescheduledDate: Date | string | null;
};

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

function serializeRecurrence(rule: RecurrenceRow | null): RecurrenceRuleInput | null {
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

async function getRecurrence(taskId: string) {
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

async function serializeTask(row: TaskRow): Promise<ApiTask> {
  const [tags, recurrenceRule, pomodoro] = await Promise.all([
    getTags(row.id),
    getRecurrence(row.id),
    getPomodoroTotals(row.id)
  ]);

  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    dueAt: asDate(row.dueAt)?.toISOString() ?? null,
    priority: normalizeTaskPriority(row.priority),
    status: row.status,
    createdAt: asDate(row.createdAt)?.toISOString() ?? new Date().toISOString(),
    updatedAt: asDate(row.updatedAt)?.toISOString() ?? new Date().toISOString(),
    completedAt: asDate(row.completedAt)?.toISOString() ?? null,
    recurrenceRule: serializeRecurrence(recurrenceRule),
    tags,
    pomodoroCompletedCount: pomodoro.count,
    pomodoroCompletedMinutes: pomodoro.minutes
  };
}

async function syncTaskTags(taskId: string, userId: string, tagNames: string[]) {
  await execute("DELETE FROM `TaskTag` WHERE `taskId` = ?", [taskId]);

  for (const name of tagNames) {
    await execute(
      "INSERT INTO `Tag` (`id`, `userId`, `name`) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE `name` = VALUES(`name`)",
      [id(), userId, name]
    );
    const tag = await queryOne<DbRow & { id: string }>("SELECT `id` FROM `Tag` WHERE `userId` = ? AND `name` = ?", [userId, name]);
    if (tag) {
      await execute("INSERT IGNORE INTO `TaskTag` (`taskId`, `tagId`) VALUES (?, ?)", [taskId, tag.id]);
    }
  }
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

export async function taskRoutes(app: FastifyInstance) {
  app.get("/tasks", { preHandler: app.authenticate }, async (request) => {
    const rows = await queryRows<TaskRow>(
      "SELECT * FROM `Task` WHERE `userId` = ? AND `status` <> 'ARCHIVED' ORDER BY CASE WHEN `status` = 'COMPLETED' THEN 1 ELSE 0 END ASC, `createdAt` ASC, `id` ASC",
      [request.user.id]
    );
    return { tasks: sortTasksForDisplay(await Promise.all(rows.map(serializeTask))) };
  });

  app.get("/tasks/quadrants", { preHandler: app.authenticate }, async (request) => {
    const rows = await queryRows<TaskRow>(
      "SELECT * FROM `Task` WHERE `userId` = ? AND `status` <> 'ARCHIVED' ORDER BY CASE WHEN `status` = 'COMPLETED' THEN 1 ELSE 0 END ASC, `createdAt` ASC, `id` ASC",
      [request.user.id]
    );
    const tasks = sortTasksForDisplay(await Promise.all(rows.map(serializeTask)));
    const quadrants = Object.fromEntries(taskPriorityValues.map((priority) => [priority, [] as ApiTask[]])) as Record<TaskPriority, ApiTask[]>;

    for (const task of tasks) {
      quadrants[task.priority].push(task);
    }

    return { quadrants };
  });

  app.post("/tasks", { preHandler: app.authenticate }, async (request, reply) => {
    const body = createTaskRequestSchema.parse(request.body);
    const taskId = id();

    await transaction(async (connection) => {
      await connection.execute(
        `INSERT INTO \`Task\`
          (\`id\`, \`userId\`, \`title\`, \`notes\`, \`dueAt\`, \`priority\`, \`status\`, \`completedAt\`, \`updatedAt\`)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(3))`,
        [
          taskId,
          request.user.id,
          body.title,
          body.notes ?? null,
          toMysqlDate(body.dueAt ? new Date(body.dueAt) : null),
          body.priority,
          body.status,
          body.status === "COMPLETED" ? toMysqlDate(new Date()) : null
        ]
      );
    });

    await upsertRecurrence(taskId, body.recurrenceRule ?? null);
    await syncTaskTags(taskId, request.user.id, body.tagNames);
    const task = await queryOne<TaskRow>("SELECT * FROM `Task` WHERE `id` = ?", [taskId]);
    return reply.code(201).send({ task: task ? await serializeTask(task) : null });
  });

  app.patch("/tasks/:id", { preHandler: app.authenticate }, async (request, reply) => {
    const taskId = (request.params as { id: string }).id;
    const body = updateTaskRequestSchema.parse(request.body);
    const existing = await queryOne<TaskRow>("SELECT * FROM `Task` WHERE `id` = ? AND `userId` = ?", [taskId, request.user.id]);
    if (!existing) {
      return reply.code(404).send({ error: "Task not found" });
    }

    await execute(
      `UPDATE \`Task\` SET
        \`title\` = COALESCE(?, \`title\`),
        \`notes\` = ?,
        \`dueAt\` = ?,
        \`priority\` = COALESCE(?, \`priority\`),
        \`status\` = COALESCE(?, \`status\`),
        \`completedAt\` = ?,
        \`updatedAt\` = NOW(3)
       WHERE \`id\` = ? AND \`userId\` = ?`,
      [
        body.title ?? null,
        body.notes === undefined ? existing.notes : body.notes,
        body.dueAt === undefined ? existing.dueAt : toMysqlDate(body.dueAt ? new Date(body.dueAt) : null),
        body.priority ?? null,
        body.status ?? null,
        body.status === undefined ? existing.completedAt : body.status === "COMPLETED" ? toMysqlDate(new Date()) : null,
        taskId,
        request.user.id
      ]
    );

    if (body.recurrenceRule !== undefined) {
      await upsertRecurrence(taskId, body.recurrenceRule);
    }

    if (body.tagNames !== undefined) {
      await syncTaskTags(taskId, request.user.id, body.tagNames);
    }

    const task = await queryOne<TaskRow>("SELECT * FROM `Task` WHERE `id` = ?", [taskId]);
    return { task: task ? await serializeTask(task) : null };
  });

  app.delete("/tasks/:id", { preHandler: app.authenticate }, async (request, reply) => {
    const taskId = (request.params as { id: string }).id;
    const result = await execute("DELETE FROM `Task` WHERE `id` = ? AND `userId` = ?", [taskId, request.user.id]);
    if (!result.affectedRows) {
      return reply.code(404).send({ error: "Task not found" });
    }
    return reply.code(204).send();
  });

  app.get("/calendar", { preHandler: app.authenticate }, async (request) => {
    const query = calendarQuerySchema.parse(request.query);
    const from = new Date(query.from);
    const to = new Date(query.to);
    const rows = await queryRows<TaskRow>(
      `SELECT t.* FROM \`Task\` t
       LEFT JOIN \`RecurrenceRule\` rr ON rr.taskId = t.id
       WHERE t.userId = ? AND t.status <> 'ARCHIVED'
         AND ((t.dueAt BETWEEN ? AND ?) OR rr.id IS NOT NULL)`,
      [request.user.id, toMysqlDate(from), toMysqlDate(to)]
    );

    const expandableTasks: Array<ExpandableTask & { source: ApiTask }> = [];
    for (const row of rows) {
      const [recurrence, exceptions, source] = await Promise.all([
        getRecurrence(row.id),
        queryRows<ExceptionRow>(
          `SELECT * FROM \`TaskException\` WHERE \`taskId\` = ?
           AND ((\`occurrenceDate\` BETWEEN ? AND ?) OR (\`rescheduledDate\` BETWEEN ? AND ?))`,
          [row.id, toMysqlDate(from), toMysqlDate(to), toMysqlDate(from), toMysqlDate(to)]
        ),
        serializeTask(row)
      ]);

      expandableTasks.push({
        id: row.id,
        title: row.title,
        dueAt: asDate(row.dueAt),
        priority: normalizeTaskPriority(row.priority),
        status: row.status,
        recurrenceRule: serializeRecurrence(recurrence),
        exceptions: exceptions.map((item) => ({
          occurrenceDate: asDate(item.occurrenceDate) ?? new Date(),
          status: item.status,
          rescheduledDate: asDate(item.rescheduledDate)
        })),
        source
      });
    }

    return {
      view: query.view,
      occurrences: buildOccurrences(expandableTasks, from, to, (task) => task.source)
    };
  });

  app.post("/tasks/:id/occurrences/:date/complete", { preHandler: app.authenticate }, async (request, reply) => {
    const { id: taskId, date } = request.params as { id: string; date: string };
    const task = await queryOne<TaskRow>("SELECT * FROM `Task` WHERE `id` = ? AND `userId` = ?", [taskId, request.user.id]);
    if (!task) {
      return reply.code(404).send({ error: "Task not found" });
    }

    const recurrence = await getRecurrence(taskId);
    if (!recurrence) {
      await execute("UPDATE `Task` SET `status` = 'COMPLETED', `completedAt` = NOW(3), `updatedAt` = NOW(3) WHERE `id` = ?", [taskId]);
      return { ok: true };
    }

    await execute(
      `INSERT INTO \`TaskException\` (\`id\`, \`taskId\`, \`occurrenceDate\`, \`status\`)
       VALUES (?, ?, ?, 'COMPLETED')
       ON DUPLICATE KEY UPDATE \`status\` = 'COMPLETED'`,
      [id(), taskId, toMysqlDate(new Date(date))]
    );

    return { ok: true };
  });
}
