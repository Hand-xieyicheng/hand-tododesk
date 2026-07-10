import {
  createHabitRequestSchema,
  habitCheckInRequestSchema,
  habitColorValues,
  habitFrequencyValues,
  habitWeekdayValues,
  toLocalDateKey,
  updateHabitRequestSchema,
  type ApiHabit,
  type ApiHabitDetail,
  type ApiHabitLog,
  type CreateHabitRequest,
  type HabitCheckInRequest,
  type HabitColor,
  type HabitFrequency,
  type HabitWeekday,
  type UpdateHabitRequest
} from "@todo/shared";
import { asDate, execute, id, queryOne, queryRows, type DbRow } from "../db.js";
import {
  buildHabitCalendarDays,
  calculateHabitStats,
  currentMonthKey,
  isHabitPlannedOn,
  type HabitCheckInInfo,
  type HabitSchedule
} from "./habits.js";

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

export class HabitDomainError extends Error {
  constructor(
    public readonly code: "NOT_FOUND" | "ARCHIVED" | "FUTURE_CHECK_IN" | "UNPLANNED_DATE",
    message: string
  ) {
    super(message);
    this.name = "HabitDomainError";
  }
}

function enumFromDb<TValue extends string>(
  values: readonly TValue[],
  value: string | null | undefined,
  fallback: TValue
) {
  return values.includes(value as TValue) ? value as TValue : fallback;
}

function parseJsonArray<TValue>(
  value: string | TValue[] | null | undefined,
  fallback: TValue[]
) {
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
    if (
      habitWeekdayValues.includes(value as HabitWeekday) &&
      !days.includes(value as HabitWeekday)
    ) {
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
  const frequency = enumFromDb(
    habitFrequencyValues,
    row.frequency,
    "DAILY"
  ) as HabitFrequency;
  return {
    frequency,
    interval: Number(row.interval ?? 1),
    weekDays: frequency === "WEEKLY"
      ? normalizeWeekDays(parseJsonArray<unknown>(row.weekDays, []))
      : [],
    monthDays: frequency === "MONTHLY"
      ? normalizeMonthDays(parseJsonArray<unknown>(row.monthDays, []))
      : [],
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

function serializeHabit(
  row: HabitRow,
  checkIns: HabitCheckInRow[],
  todayKey = toLocalDateKey(),
  month = currentMonthKey(todayKey)
): ApiHabit {
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

async function getHabitRow(userId: string, habitId: string) {
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

async function buildHabitDetail(
  row: HabitRow,
  userId: string,
  month: string,
  todayKey = toLocalDateKey()
): Promise<ApiHabitDetail> {
  const checkIns = await getHabitCheckIns(row.id, userId);
  const checkInMap = new Map(
    checkIns.map((checkIn) => [checkIn.date, checkInInfo(checkIn)])
  );
  const schedule = scheduleFromRow(row);
  const habit = serializeHabit(row, checkIns, todayKey, month);
  const stats = calculateHabitStats(
    schedule,
    new Set(checkIns.map((checkIn) => checkIn.date)),
    month,
    todayKey
  );
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
    throw new HabitDomainError("ARCHIVED", "Habit is archived");
  }
  if (date > todayKey) {
    throw new HabitDomainError("FUTURE_CHECK_IN", "Cannot check in future dates");
  }
  if (!isHabitPlannedOn(scheduleFromRow(row), date)) {
    throw new HabitDomainError("UNPLANNED_DATE", "Date is not planned for this habit");
  }
}

export async function listHabits(
  userId: string,
  includeArchived = false
): Promise<ApiHabit[]> {
  const archivedFilter = includeArchived ? "" : "AND `archivedAt` IS NULL";
  const rows = await queryRows<HabitRow>(
    `SELECT *
     FROM \`Habit\`
     WHERE \`userId\` = ? ${archivedFilter}
     ORDER BY CASE WHEN \`archivedAt\` IS NULL THEN 0 ELSE 1 END ASC, \`sortOrder\` ASC, \`createdAt\` ASC, \`id\` ASC`,
    [userId]
  );
  const checkIns = await queryRows<HabitCheckInRow>(
    "SELECT * FROM `HabitCheckIn` WHERE `userId` = ?",
    [userId]
  );
  const checkInsByHabit = new Map<string, HabitCheckInRow[]>();
  for (const checkIn of checkIns) {
    checkInsByHabit.set(
      checkIn.habitId,
      [...(checkInsByHabit.get(checkIn.habitId) ?? []), checkIn]
    );
  }
  return rows.map((row) => serializeHabit(
    row,
    checkInsByHabit.get(row.id) ?? []
  ));
}

export async function getHabit(
  userId: string,
  habitId: string
): Promise<ApiHabit | null> {
  const row = await getHabitRow(userId, habitId);
  if (!row) {
    return null;
  }
  const checkIns = await getHabitCheckIns(habitId, userId);
  return serializeHabit(row, checkIns);
}

export async function getHabitDetail(
  userId: string,
  habitId: string,
  month = currentMonthKey()
): Promise<ApiHabitDetail | null> {
  const row = await getHabitRow(userId, habitId);
  return row ? buildHabitDetail(row, userId, month) : null;
}

export async function createHabit(
  userId: string,
  input: CreateHabitRequest
): Promise<ApiHabit> {
  const body = normalizeHabitInput(createHabitRequestSchema.parse(input));
  const habitId = id();
  const nextSortOrderRow = await queryOne<NextSortOrderRow>(
    "SELECT COALESCE(MAX(`sortOrder`), 0) + 1000 AS `nextSortOrder` FROM `Habit` WHERE `userId` = ?",
    [userId]
  );
  const nextSortOrder = Number(nextSortOrderRow?.nextSortOrder ?? 1000);

  await execute(
    `INSERT INTO \`Habit\`
      (\`id\`, \`userId\`, \`title\`, \`notes\`, \`icon\`, \`color\`, \`frequency\`, \`interval\`, \`weekDays\`, \`monthDays\`, \`startDate\`, \`endDate\`, \`sortOrder\`, \`updatedAt\`)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))`,
    [
      habitId,
      userId,
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

  const habit = await getHabit(userId, habitId);
  if (!habit) {
    throw new HabitDomainError("NOT_FOUND", "Habit not found after creation");
  }
  return habit;
}

export async function updateHabit(
  userId: string,
  habitId: string,
  input: UpdateHabitRequest
): Promise<ApiHabit> {
  const body = updateHabitRequestSchema.parse(input);
  const existing = await getHabitRow(userId, habitId);
  if (!existing) {
    throw new HabitDomainError("NOT_FOUND", "Habit not found");
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
      userId
    ]
  );

  const habit = await getHabit(userId, habitId);
  if (!habit) {
    throw new HabitDomainError("NOT_FOUND", "Habit not found");
  }
  return habit;
}

export async function deleteHabit(userId: string, habitId: string): Promise<void> {
  const result = await execute(
    "DELETE FROM `Habit` WHERE `id` = ? AND `userId` = ?",
    [habitId, userId]
  );
  if (!result.affectedRows) {
    throw new HabitDomainError("NOT_FOUND", "Habit not found");
  }
}

export async function checkInHabit(
  userId: string,
  habitId: string,
  input: HabitCheckInRequest
): Promise<ApiHabitLog> {
  const body = habitCheckInRequestSchema.parse(input);
  const habit = await getHabitRow(userId, habitId);
  if (!habit) {
    throw new HabitDomainError("NOT_FOUND", "Habit not found");
  }
  assertCheckInAllowed(habit, body.date, toLocalDateKey());

  await execute(
    `INSERT INTO \`HabitCheckIn\` (\`id\`, \`habitId\`, \`userId\`, \`date\`, \`note\`, \`updatedAt\`)
     VALUES (?, ?, ?, ?, ?, NOW(3))
     ON DUPLICATE KEY UPDATE
      \`note\` = VALUES(\`note\`),
      \`updatedAt\` = NOW(3)`,
    [id(), habitId, userId, body.date, body.note?.trim() || null]
  );

  const checkIn = await queryOne<HabitCheckInRow>(
    "SELECT * FROM `HabitCheckIn` WHERE `habitId` = ? AND `userId` = ? AND `date` = ?",
    [habitId, userId, body.date]
  );
  if (!checkIn) {
    throw new HabitDomainError("NOT_FOUND", "Habit check-in not found after creation");
  }
  return serializeLog(checkIn);
}

export async function cancelHabitCheckIn(
  userId: string,
  habitId: string,
  date: string
): Promise<void> {
  const body = habitCheckInRequestSchema.pick({ date: true }).parse({ date });
  const habit = await getHabitRow(userId, habitId);
  if (!habit) {
    throw new HabitDomainError("NOT_FOUND", "Habit not found");
  }
  if (body.date > toLocalDateKey()) {
    throw new HabitDomainError("FUTURE_CHECK_IN", "Cannot cancel future dates");
  }

  await execute(
    "DELETE FROM `HabitCheckIn` WHERE `habitId` = ? AND `userId` = ? AND `date` = ?",
    [habitId, userId, body.date]
  );
}
