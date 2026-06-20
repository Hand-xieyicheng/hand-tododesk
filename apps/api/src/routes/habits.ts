import type { FastifyInstance } from "fastify";
import {
  createHabitRequestSchema,
  habitCheckInRequestSchema,
  habitColorValues,
  habitDetailQuerySchema,
  habitFrequencyValues,
  habitListQuerySchema,
  habitWeekdayValues,
  toLocalDateKey,
  updateHabitOrderRequestSchema,
  updateHabitRequestSchema,
  type ApiHabit,
  type ApiHabitDetail,
  type ApiHabitLog,
  type CreateHabitRequest,
  type HabitColor,
  type HabitFrequency,
  type HabitWeekday
} from "@todo/shared";
import { asDate, execute, id, queryOne, queryRows, type DbRow } from "../db.js";
import {
  buildHabitCalendarDays,
  calculateHabitStats,
  currentMonthKey,
  isHabitPlannedOn,
  type HabitCheckInInfo,
  type HabitSchedule
} from "../services/habits.js";

type HabitRow = DbRow & {
  id: string;
  userId: string;
  title: string;
  notes: string | null;
  icon: string;
  color: string;
  frequency: string;
  interval: number | string;
  weekDays: string | string[] | null;
  monthDays: string | number[] | null;
  startDate: string;
  endDate: string | null;
  sortOrder: number | string;
  archivedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type HabitCheckInRow = DbRow & {
  id: string;
  habitId: string;
  userId: string;
  date: string;
  note: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type NextSortOrderRow = DbRow & {
  nextSortOrder: number | string;
};

function enumFromDb<TValue extends string>(values: readonly TValue[], value: string | null | undefined, fallback: TValue) {
  return values.includes(value as TValue) ? value as TValue : fallback;
}

function parseJsonArray<TValue>(value: string | TValue[] | null | undefined, fallback: TValue[]) {
  if (!value) {
    return fallback;
  }
  if (Array.isArray(value)) {
    return value;
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as TValue[] : fallback;
  } catch {
    return fallback;
  }
}

function normalizeWeekDays(values: readonly unknown[]) {
  const days: HabitWeekday[] = [];
  for (const value of values) {
    if (habitWeekdayValues.includes(value as HabitWeekday) && !days.includes(value as HabitWeekday)) {
      days.push(value as HabitWeekday);
    }
  }
  return days;
}

function normalizeMonthDays(values: readonly unknown[]) {
  return [...new Set(values
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value >= 1 && value <= 31))]
    .sort((left, right) => left - right);
}

function normalizeHabitInput(input: CreateHabitRequest): CreateHabitRequest {
  return {
    ...input,
    notes: input.notes?.trim() || null,
    interval: input.interval || 1,
    weekDays: input.frequency === "WEEKLY" ? normalizeWeekDays(input.weekDays) : [],
    monthDays: input.frequency === "MONTHLY" ? normalizeMonthDays(input.monthDays) : [],
    endDate: input.endDate || null
  };
}

function scheduleFromRow(row: HabitRow): HabitSchedule {
  const frequency = enumFromDb(habitFrequencyValues, row.frequency, "DAILY") as HabitFrequency;
  return {
    frequency,
    interval: Number(row.interval ?? 1),
    weekDays: frequency === "WEEKLY" ? normalizeWeekDays(parseJsonArray<unknown>(row.weekDays, [])) : [],
    monthDays: frequency === "MONTHLY" ? normalizeMonthDays(parseJsonArray<unknown>(row.monthDays, [])) : [],
    startDate: row.startDate,
    endDate: row.endDate
  };
}

function checkInInfo(row: HabitCheckInRow): HabitCheckInInfo {
  return {
    id: row.id,
    date: row.date,
    note: row.note
  };
}

function serializeLog(row: HabitCheckInRow): ApiHabitLog {
  return {
    id: row.id,
    date: row.date,
    note: row.note,
    createdAt: asDate(row.createdAt)?.toISOString() ?? new Date().toISOString(),
    updatedAt: asDate(row.updatedAt)?.toISOString() ?? new Date().toISOString()
  };
}

function serializeHabit(row: HabitRow, checkIns: HabitCheckInRow[], todayKey = toLocalDateKey(), month = currentMonthKey(todayKey)): ApiHabit {
  const schedule = scheduleFromRow(row);
  const checkInDateKeys = new Set(checkIns.map((checkIn) => checkIn.date));
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    icon: row.icon || "Smile",
    color: enumFromDb(habitColorValues, row.color, "mint") as HabitColor,
    frequency: schedule.frequency,
    interval: schedule.interval,
    weekDays: schedule.weekDays,
    monthDays: schedule.monthDays,
    startDate: schedule.startDate,
    endDate: schedule.endDate,
    sortOrder: Number(row.sortOrder ?? 0),
    archivedAt: asDate(row.archivedAt)?.toISOString() ?? null,
    createdAt: asDate(row.createdAt)?.toISOString() ?? new Date().toISOString(),
    updatedAt: asDate(row.updatedAt)?.toISOString() ?? new Date().toISOString(),
    todayPlanned: isHabitPlannedOn(schedule, todayKey),
    todayChecked: checkInDateKeys.has(todayKey),
    stats: calculateHabitStats(schedule, checkInDateKeys, month, todayKey)
  };
}

async function getHabit(habitId: string, userId: string) {
  return queryOne<HabitRow>(
    "SELECT * FROM `Habit` WHERE `id` = ? AND `userId` = ?",
    [habitId, userId]
  );
}

async function getHabitCheckIns(habitId: string, userId: string) {
  return queryRows<HabitCheckInRow>(
    "SELECT * FROM `HabitCheckIn` WHERE `habitId` = ? AND `userId` = ? ORDER BY `date` ASC",
    [habitId, userId]
  );
}

async function buildHabitDetail(row: HabitRow, userId: string, month: string, todayKey = toLocalDateKey()): Promise<ApiHabitDetail> {
  const checkIns = await getHabitCheckIns(row.id, userId);
  const checkInMap = new Map(checkIns.map((checkIn) => [checkIn.date, checkInInfo(checkIn)]));
  const schedule = scheduleFromRow(row);
  const habit = serializeHabit(row, checkIns, todayKey, month);
  const stats = calculateHabitStats(schedule, new Set(checkIns.map((checkIn) => checkIn.date)), month, todayKey);
  return {
    habit,
    month,
    stats,
    calendarDays: buildHabitCalendarDays(schedule, checkInMap, month, todayKey),
    logs: checkIns
      .filter((checkIn) => checkIn.date.startsWith(month))
      .sort((left, right) => right.date.localeCompare(left.date))
      .map(serializeLog)
  };
}

function assertCheckInAllowed(row: HabitRow, date: string, todayKey: string) {
  if (row.archivedAt) {
    return "Habit is archived";
  }
  if (date > todayKey) {
    return "Cannot check in future dates";
  }
  if (!isHabitPlannedOn(scheduleFromRow(row), date)) {
    return "Date is not planned for this habit";
  }
  return "";
}

export async function habitRoutes(app: FastifyInstance) {
  app.get("/habits", { preHandler: app.authenticate }, async (request) => {
    const query = habitListQuerySchema.parse(request.query);
    const rows = await queryRows<HabitRow>(
      `SELECT *
       FROM \`Habit\`
       WHERE \`userId\` = ? ${query.includeArchived === "true" ? "" : "AND `archivedAt` IS NULL"}
       ORDER BY CASE WHEN \`archivedAt\` IS NULL THEN 0 ELSE 1 END ASC, \`sortOrder\` ASC, \`createdAt\` ASC, \`id\` ASC`,
      [request.user.id]
    );
    const checkIns = await queryRows<HabitCheckInRow>(
      "SELECT * FROM `HabitCheckIn` WHERE `userId` = ?",
      [request.user.id]
    );
    const checkInsByHabit = new Map<string, HabitCheckInRow[]>();
    for (const checkIn of checkIns) {
      checkInsByHabit.set(checkIn.habitId, [...(checkInsByHabit.get(checkIn.habitId) ?? []), checkIn]);
    }

    return {
      habits: rows.map((row) => serializeHabit(row, checkInsByHabit.get(row.id) ?? []))
    };
  });

  app.put("/habits/order", { preHandler: app.authenticate }, async (request, reply) => {
    const body = updateHabitOrderRequestSchema.parse(request.body);
    const placeholders = body.orderedIds.map(() => "?").join(", ");
    const rows = await queryRows<DbRow & { id: string }>(
      `SELECT \`id\`
       FROM \`Habit\`
       WHERE \`userId\` = ? AND \`id\` IN (${placeholders})`,
      [request.user.id, ...body.orderedIds]
    );
    if (rows.length !== body.orderedIds.length) {
      return reply.code(404).send({ error: "Habit not found" });
    }

    await Promise.all(body.orderedIds.map((habitId, index) => execute(
      "UPDATE `Habit` SET `sortOrder` = ?, `updatedAt` = NOW(3) WHERE `id` = ? AND `userId` = ?",
      [(index + 1) * 1000, habitId, request.user.id]
    )));

    return { ok: true };
  });

  app.post("/habits", { preHandler: app.authenticate }, async (request, reply) => {
    const body = normalizeHabitInput(createHabitRequestSchema.parse(request.body));
    const habitId = id();
    const nextSortOrderRow = await queryOne<NextSortOrderRow>(
      "SELECT COALESCE(MAX(`sortOrder`), 0) + 1000 AS `nextSortOrder` FROM `Habit` WHERE `userId` = ?",
      [request.user.id]
    );
    const nextSortOrder = Number(nextSortOrderRow?.nextSortOrder ?? 1000);

    await execute(
      `INSERT INTO \`Habit\`
        (\`id\`, \`userId\`, \`title\`, \`notes\`, \`icon\`, \`color\`, \`frequency\`, \`interval\`, \`weekDays\`, \`monthDays\`, \`startDate\`, \`endDate\`, \`sortOrder\`, \`updatedAt\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))`,
      [
        habitId,
        request.user.id,
        body.title,
        body.notes ?? null,
        body.icon,
        body.color,
        body.frequency,
        body.interval,
        JSON.stringify(body.weekDays),
        JSON.stringify(body.monthDays),
        body.startDate,
        body.endDate ?? null,
        nextSortOrder
      ]
    );

    const habit = await getHabit(habitId, request.user.id);
    return reply.code(201).send({ habit: habit ? serializeHabit(habit, []) : null });
  });

  app.get("/habits/:id/detail", { preHandler: app.authenticate }, async (request, reply) => {
    const habitId = (request.params as { id: string }).id;
    const query = habitDetailQuerySchema.parse(request.query);
    const habit = await getHabit(habitId, request.user.id);
    if (!habit) {
      return reply.code(404).send({ error: "Habit not found" });
    }

    return buildHabitDetail(habit, request.user.id, query.month ?? currentMonthKey());
  });

  app.patch("/habits/:id", { preHandler: app.authenticate }, async (request, reply) => {
    const habitId = (request.params as { id: string }).id;
    const body = updateHabitRequestSchema.parse(request.body);
    const existing = await getHabit(habitId, request.user.id);
    if (!existing) {
      return reply.code(404).send({ error: "Habit not found" });
    }

    const existingSchedule = scheduleFromRow(existing);
    const merged = normalizeHabitInput(createHabitRequestSchema.parse({
      title: body.title ?? existing.title,
      notes: body.notes === undefined ? existing.notes : body.notes,
      icon: body.icon ?? existing.icon,
      color: body.color ?? enumFromDb(habitColorValues, existing.color, "mint"),
      frequency: body.frequency ?? existingSchedule.frequency,
      interval: body.interval ?? existingSchedule.interval,
      weekDays: body.weekDays ?? existingSchedule.weekDays,
      monthDays: body.monthDays ?? existingSchedule.monthDays,
      startDate: body.startDate ?? existingSchedule.startDate,
      endDate: body.endDate === undefined ? existingSchedule.endDate : body.endDate
    }));
    const archivedAt = body.archived === undefined
      ? existing.archivedAt
      : body.archived ? new Date() : null;

    await execute(
      `UPDATE \`Habit\` SET
        \`title\` = ?,
        \`notes\` = ?,
        \`icon\` = ?,
        \`color\` = ?,
        \`frequency\` = ?,
        \`interval\` = ?,
        \`weekDays\` = ?,
        \`monthDays\` = ?,
        \`startDate\` = ?,
        \`endDate\` = ?,
        \`archivedAt\` = ?,
        \`updatedAt\` = NOW(3)
       WHERE \`id\` = ? AND \`userId\` = ?`,
      [
        merged.title,
        merged.notes ?? null,
        merged.icon,
        merged.color,
        merged.frequency,
        merged.interval,
        JSON.stringify(merged.weekDays),
        JSON.stringify(merged.monthDays),
        merged.startDate,
        merged.endDate ?? null,
        archivedAt,
        habitId,
        request.user.id
      ]
    );

    const habit = await getHabit(habitId, request.user.id);
    const checkIns = habit ? await getHabitCheckIns(habit.id, request.user.id) : [];
    return { habit: habit ? serializeHabit(habit, checkIns) : null };
  });

  app.delete("/habits/:id", { preHandler: app.authenticate }, async (request, reply) => {
    const habitId = (request.params as { id: string }).id;
    const result = await execute("DELETE FROM `Habit` WHERE `id` = ? AND `userId` = ?", [habitId, request.user.id]);
    if (!result.affectedRows) {
      return reply.code(404).send({ error: "Habit not found" });
    }
    return reply.code(204).send();
  });

  app.post("/habits/:id/check-ins", { preHandler: app.authenticate }, async (request, reply) => {
    const habitId = (request.params as { id: string }).id;
    const body = habitCheckInRequestSchema.parse(request.body);
    const habit = await getHabit(habitId, request.user.id);
    if (!habit) {
      return reply.code(404).send({ error: "Habit not found" });
    }
    const validationError = assertCheckInAllowed(habit, body.date, toLocalDateKey());
    if (validationError) {
      return reply.code(400).send({ error: validationError });
    }

    await execute(
      `INSERT INTO \`HabitCheckIn\` (\`id\`, \`habitId\`, \`userId\`, \`date\`, \`note\`, \`updatedAt\`)
       VALUES (?, ?, ?, ?, ?, NOW(3))
       ON DUPLICATE KEY UPDATE
        \`note\` = VALUES(\`note\`),
        \`updatedAt\` = NOW(3)`,
      [id(), habitId, request.user.id, body.date, body.note?.trim() || null]
    );

    const checkIn = await queryOne<HabitCheckInRow>(
      "SELECT * FROM `HabitCheckIn` WHERE `habitId` = ? AND `userId` = ? AND `date` = ?",
      [habitId, request.user.id, body.date]
    );
    return reply.code(201).send({ checkIn: checkIn ? serializeLog(checkIn) : null });
  });

  app.delete("/habits/:id/check-ins/:date", { preHandler: app.authenticate }, async (request, reply) => {
    const { id: habitId, date } = request.params as { id: string; date: string };
    const body = habitCheckInRequestSchema.pick({ date: true }).parse({ date });
    const habit = await getHabit(habitId, request.user.id);
    if (!habit) {
      return reply.code(404).send({ error: "Habit not found" });
    }
    if (body.date > toLocalDateKey()) {
      return reply.code(400).send({ error: "Cannot cancel future dates" });
    }

    await execute(
      "DELETE FROM `HabitCheckIn` WHERE `habitId` = ? AND `userId` = ? AND `date` = ?",
      [habitId, request.user.id, body.date]
    );
    return reply.code(204).send();
  });
}
