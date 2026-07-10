import type { FastifyInstance, FastifyReply } from "fastify";
import type {
  AnniversaryCalendarType,
  AnniversaryCardStyle,
  AnniversaryCategory,
  AnniversaryDirection,
  AnniversaryRepeat,
  AnniversarySolarTerm,
  AnniversaryTimingInput,
  ApiTask,
  CalendarAnniversary,
  CalendarHabitCheckIn,
  CreateTaskRequest,
  HabitColor,
  TaskPriority,
  UpdateTaskRequest
} from "@todo/shared";
import {
  anniversaryCalendarTypeValues,
  anniversaryCardStyleValues,
  anniversaryCategoryValues,
  anniversaryDirectionValues,
  anniversaryRepeatValues,
  anniversarySolarTermValues,
  calculateAnniversaryOccurrenceDisplay,
  calendarQuerySchema,
  expandAnniversaryOccurrenceDates,
  habitColorValues,
  taskPriorityValues,
  toLocalDateKey,
  updateTaskOrderRequestSchema
} from "@todo/shared";
import { asDate, execute, id, queryOne, queryRows, toMysqlDate, transaction, type DbRow } from "../db.js";
import { buildOccurrences, type ExpandableTask } from "../services/calendar.js";
import { normalizeTaskPriority } from "../services/task-priority.js";
import {
  createTask,
  deleteTask,
  getTaskRecurrence,
  listTasks,
  serializeTaskRecurrence,
  serializeTaskRow,
  TaskDomainError,
  updateTask,
  type TaskRow
} from "../services/task-domain.js";

type ExceptionRow = DbRow & {
  occurrenceDate: Date | string;
  status: "SKIPPED" | "COMPLETED" | "RESCHEDULED";
  rescheduledDate: Date | string | null;
};

type CalendarHabitCheckInRow = DbRow & {
  checkInId: string;
  habitId: string;
  date: string;
  title: string;
  icon: string;
  color: string;
  sortOrder: number | string;
};

type CalendarAnniversaryRow = DbRow & {
  id: string;
  userId: string;
  title: string;
  category: string;
  date: string;
  repeat: string;
  direction: string;
  cardStyle: string;
  calendarType: string;
  lunarMonth: number | null;
  lunarDay: number | null;
  solarTerm: string | null;
  sortOrder: number | string;
};

type NormalizedCalendarAnniversary = {
  category: AnniversaryCategory;
  cardStyle: AnniversaryCardStyle;
  timing: AnniversaryTimingInput;
};

function enumFromDb<TValue extends string>(values: readonly TValue[], value: string | null | undefined, fallback: TValue) {
  return values.includes(value as TValue) ? value as TValue : fallback;
}

function normalizeHabitColor(value: string | null | undefined): HabitColor {
  return habitColorValues.includes(value as HabitColor) ? value as HabitColor : "mint";
}

function serializeCalendarHabitCheckIn(row: CalendarHabitCheckInRow): CalendarHabitCheckIn {
  return {
    id: row.checkInId,
    habitId: row.habitId,
    date: row.date,
    title: row.title,
    icon: row.icon || "Smile",
    color: normalizeHabitColor(row.color),
    sortOrder: Number(row.sortOrder ?? 0)
  };
}

function normalizeCalendarAnniversary(row: CalendarAnniversaryRow): NormalizedCalendarAnniversary {
  const category = enumFromDb(anniversaryCategoryValues, row.category, "ANNIVERSARY") as AnniversaryCategory;
  const repeat = enumFromDb(anniversaryRepeatValues, row.repeat, "NONE") as AnniversaryRepeat;
  const direction = enumFromDb(anniversaryDirectionValues, row.direction, "AUTO") as AnniversaryDirection;
  const cardStyle = enumFromDb(anniversaryCardStyleValues, row.cardStyle, "lavender") as AnniversaryCardStyle;
  const calendarType = enumFromDb(anniversaryCalendarTypeValues, row.calendarType, "SOLAR") as AnniversaryCalendarType;
  const solarTerm = row.solarTerm
    ? enumFromDb(anniversarySolarTermValues, row.solarTerm, "QINGMING") as AnniversarySolarTerm
    : null;
  const timing = {
    category,
    date: row.date,
    repeat,
    direction,
    calendarType,
    lunarMonth: row.lunarMonth,
    lunarDay: row.lunarDay,
    solarTerm
  };

  return { category, cardStyle, timing };
}

function serializeCalendarAnniversary(row: CalendarAnniversaryRow, date: string, normalized: NormalizedCalendarAnniversary): CalendarAnniversary {
  const display = calculateAnniversaryOccurrenceDisplay(normalized.timing, date);

  return {
    id: row.id,
    title: row.title,
    date,
    category: normalized.category,
    cardStyle: normalized.cardStyle,
    displayDirection: display.displayDirection,
    displayValue: display.displayValue,
    displaySubtext: display.displaySubtext,
    daysDelta: display.daysDelta,
    sortOrder: Number(row.sortOrder ?? 0)
  };
}

function sortCalendarAnniversaries(events: CalendarAnniversary[]) {
  return [...events].sort((left, right) => {
    const dateRank = left.date.localeCompare(right.date);
    if (dateRank !== 0) {
      return dateRank;
    }
    const sortOrderRank = left.sortOrder - right.sortOrder;
    if (sortOrderRank !== 0) {
      return sortOrderRank;
    }
    return left.title.localeCompare(right.title, "zh-CN");
  });
}

function sendTaskDomainError(reply: FastifyReply, error: unknown) {
  if (!(error instanceof TaskDomainError)) {
    throw error;
  }
  const statusCode = error.code === "NOT_FOUND" ? 404 : 400;
  return reply.code(statusCode).send({ error: error.message });
}

export async function taskRoutes(app: FastifyInstance) {
  app.get("/tasks", { preHandler: app.authenticate }, async (request) => {
    return { tasks: await listTasks(request.user.id) };
  });

  app.get("/tasks/quadrants", { preHandler: app.authenticate }, async (request) => {
    const tasks = await listTasks(request.user.id);
    const quadrants = Object.fromEntries(taskPriorityValues.map((priority) => [priority, [] as ApiTask[]])) as Record<TaskPriority, ApiTask[]>;

    for (const task of tasks) {
      quadrants[task.priority].push(task);
    }

    return { quadrants };
  });

  app.post("/tasks", { preHandler: app.authenticate }, async (request, reply) => {
    try {
      const task = await createTask(request.user.id, request.body as CreateTaskRequest);
      return reply.code(201).send({ task });
    } catch (error) {
      return sendTaskDomainError(reply, error);
    }
  });

  app.put("/tasks/order", { preHandler: app.authenticate }, async (request, reply) => {
    const body = updateTaskOrderRequestSchema.parse(request.body);
    const placeholders = body.orderedIds.map(() => "?").join(", ");
    const rows = await queryRows<DbRow & { id: string }>(
      `SELECT \`id\`
       FROM \`Task\`
       WHERE \`userId\` = ? AND \`status\` <> 'ARCHIVED' AND \`id\` IN (${placeholders})`,
      [request.user.id, ...body.orderedIds]
    );
    if (rows.length !== body.orderedIds.length) {
      return reply.code(404).send({ error: "Task not found" });
    }

    await transaction(async (connection) => {
      await Promise.all(body.orderedIds.map((taskId, index) => connection.execute(
        "UPDATE `Task` SET `sortOrder` = ?, `updatedAt` = NOW(3) WHERE `id` = ? AND `userId` = ?",
        [(index + 1) * 1000, taskId, request.user.id]
      )));
    });

    return { ok: true };
  });

  app.patch("/tasks/:id", { preHandler: app.authenticate }, async (request, reply) => {
    const taskId = (request.params as { id: string }).id;
    try {
      const task = await updateTask(
        request.user.id,
        taskId,
        request.body as UpdateTaskRequest
      );
      return { task };
    } catch (error) {
      return sendTaskDomainError(reply, error);
    }
  });

  app.delete("/tasks/:id", { preHandler: app.authenticate }, async (request, reply) => {
    const taskId = (request.params as { id: string }).id;
    try {
      await deleteTask(request.user.id, taskId);
      return reply.code(204).send();
    } catch (error) {
      return sendTaskDomainError(reply, error);
    }
  });

  app.get("/calendar", { preHandler: app.authenticate }, async (request) => {
    const query = calendarQuerySchema.parse(request.query);
    const from = new Date(query.from);
    const to = new Date(query.to);
    const fromKey = toLocalDateKey(from);
    const toKey = toLocalDateKey(to);
    const [rows, habitCheckInRows, anniversaryRows] = await Promise.all([
      queryRows<TaskRow>(
        `SELECT t.* FROM \`Task\` t
         LEFT JOIN \`RecurrenceRule\` rr ON rr.taskId = t.id
         WHERE t.userId = ? AND t.status <> 'ARCHIVED'
           AND ((t.dueAt BETWEEN ? AND ?) OR rr.id IS NOT NULL)`,
        [request.user.id, toMysqlDate(from), toMysqlDate(to)]
      ),
      queryRows<CalendarHabitCheckInRow>(
        `SELECT
          hc.\`id\` AS \`checkInId\`,
          hc.\`habitId\`,
          hc.\`date\`,
          h.\`title\`,
          h.\`icon\`,
          h.\`color\`,
          h.\`sortOrder\`
         FROM \`HabitCheckIn\` hc
         INNER JOIN \`Habit\` h ON h.\`id\` = hc.\`habitId\` AND h.\`userId\` = hc.\`userId\`
         WHERE hc.\`userId\` = ? AND hc.\`date\` >= ? AND hc.\`date\` < ?
         ORDER BY hc.\`date\` ASC,
          CASE WHEN h.\`archivedAt\` IS NULL THEN 0 ELSE 1 END ASC,
          h.\`sortOrder\` ASC,
          h.\`createdAt\` ASC,
          h.\`id\` ASC`,
        [request.user.id, fromKey, toKey]
      ),
      queryRows<CalendarAnniversaryRow>(
        `SELECT *
         FROM \`AnniversaryEvent\`
         WHERE \`userId\` = ?
         ORDER BY \`sortOrder\` ASC, \`date\` ASC, \`createdAt\` ASC, \`id\` ASC`,
        [request.user.id]
      )
    ]);

    const expandableTasks: Array<ExpandableTask & { source: ApiTask }> = [];
    for (const row of rows) {
      const [recurrence, exceptions, source] = await Promise.all([
        getTaskRecurrence(row.id),
        queryRows<ExceptionRow>(
          `SELECT * FROM \`TaskException\` WHERE \`taskId\` = ?
           AND ((\`occurrenceDate\` BETWEEN ? AND ?) OR (\`rescheduledDate\` BETWEEN ? AND ?))`,
          [row.id, toMysqlDate(from), toMysqlDate(to), toMysqlDate(from), toMysqlDate(to)]
        ),
        serializeTaskRow(row)
      ]);

      expandableTasks.push({
        id: row.id,
        title: row.title,
        dueAt: asDate(row.dueAt),
        priority: normalizeTaskPriority(row.priority),
        status: row.status,
        recurrenceRule: serializeTaskRecurrence(recurrence),
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
      occurrences: buildOccurrences(expandableTasks, from, to, (task) => task.source),
      habitCheckIns: habitCheckInRows
        .filter((row) => row.date >= fromKey && row.date < toKey)
        .map(serializeCalendarHabitCheckIn),
      anniversaries: sortCalendarAnniversaries(anniversaryRows.flatMap((row) => {
        const normalized = normalizeCalendarAnniversary(row);
        return expandAnniversaryOccurrenceDates(normalized.timing, fromKey, toKey)
          .map((date) => serializeCalendarAnniversary(row, date, normalized));
      }))
    };
  });

  app.post("/tasks/:id/occurrences/:date/complete", { preHandler: app.authenticate }, async (request, reply) => {
    const { id: taskId, date } = request.params as { id: string; date: string };
    const task = await queryOne<TaskRow>("SELECT * FROM `Task` WHERE `id` = ? AND `userId` = ?", [taskId, request.user.id]);
    if (!task) {
      return reply.code(404).send({ error: "Task not found" });
    }

    const recurrence = await getTaskRecurrence(taskId);
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
