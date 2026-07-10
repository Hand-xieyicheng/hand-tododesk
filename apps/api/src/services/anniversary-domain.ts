import {
  anniversaryCalendarTypeValues,
  anniversaryCardStyleValues,
  anniversaryCategoryValues,
  anniversaryDirectionValues,
  anniversaryRepeatValues,
  anniversarySolarTermValues,
  calculateAnniversaryDisplay,
  createAnniversaryRequestSchema,
  updateAnniversaryRequestSchema,
  type AnniversaryCalendarType,
  type AnniversaryCardStyle,
  type AnniversaryCategory,
  type AnniversaryDirection,
  type AnniversaryRepeat,
  type AnniversarySolarTerm,
  type ApiAnniversaryEvent,
  type CreateAnniversaryRequest,
  type UpdateAnniversaryRequest
} from "@todo/shared";
import { asDate, execute, id, queryOne, queryRows, type DbRow } from "../db.js";

type AnniversaryRow = DbRow & {
  id: string;
  userId: string;
  title: string;
  notes: string | null;
  category: string;
  date: string;
  repeat: string;
  direction: string;
  cardStyle: string;
  calendarType: string;
  lunarMonth: number | null;
  lunarDay: number | null;
  solarTerm: string | null;
  sortOrder: number;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type NextSortOrderRow = DbRow & {
  nextSortOrder: number | string;
};

export class AnniversaryDomainError extends Error {
  constructor(
    public readonly code: "NOT_FOUND",
    message: string
  ) {
    super(message);
    this.name = "AnniversaryDomainError";
  }
}

function enumFromDb<TValue extends string>(
  values: readonly TValue[],
  value: string | null | undefined,
  fallback: TValue
) {
  return values.includes(value as TValue) ? value as TValue : fallback;
}

function normalizeAnniversaryInput(input: CreateAnniversaryRequest): CreateAnniversaryRequest {
  const calendarType = input.calendarType;
  return {
    ...input,
    notes: input.notes?.trim() || null,
    lunarMonth: calendarType === "LUNAR" ? input.lunarMonth ?? null : null,
    lunarDay: calendarType === "LUNAR" ? input.lunarDay ?? null : null,
    solarTerm: calendarType === "SOLAR_TERM" ? input.solarTerm ?? null : null
  };
}

function serializeAnniversary(row: AnniversaryRow): ApiAnniversaryEvent {
  const category = enumFromDb(
    anniversaryCategoryValues,
    row.category,
    "ANNIVERSARY"
  ) as AnniversaryCategory;
  const repeat = enumFromDb(
    anniversaryRepeatValues,
    row.repeat,
    "NONE"
  ) as AnniversaryRepeat;
  const direction = enumFromDb(
    anniversaryDirectionValues,
    row.direction,
    "AUTO"
  ) as AnniversaryDirection;
  const cardStyle = enumFromDb(
    anniversaryCardStyleValues,
    row.cardStyle,
    "lavender"
  ) as AnniversaryCardStyle;
  const calendarType = enumFromDb(
    anniversaryCalendarTypeValues,
    row.calendarType,
    "SOLAR"
  ) as AnniversaryCalendarType;
  const solarTerm = row.solarTerm
    ? enumFromDb(
      anniversarySolarTermValues,
      row.solarTerm,
      "QINGMING"
    ) as AnniversarySolarTerm
    : null;
  const display = calculateAnniversaryDisplay({
    category,
    date: row.date,
    repeat,
    direction,
    calendarType,
    lunarMonth: row.lunarMonth,
    lunarDay: row.lunarDay,
    solarTerm
  });

  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    category,
    date: row.date,
    repeat,
    direction,
    cardStyle,
    calendarType,
    lunarMonth: row.lunarMonth === null ? null : Number(row.lunarMonth),
    lunarDay: row.lunarDay === null ? null : Number(row.lunarDay),
    solarTerm,
    sortOrder: Number(row.sortOrder ?? 0),
    createdAt: asDate(row.createdAt)?.toISOString() ?? new Date().toISOString(),
    updatedAt: asDate(row.updatedAt)?.toISOString() ?? new Date().toISOString(),
    ...display
  };
}

async function getAnniversaryRow(userId: string, eventId: string) {
  return queryOne<AnniversaryRow>(
    "SELECT * FROM `AnniversaryEvent` WHERE `id` = ? AND `userId` = ?",
    [eventId, userId]
  );
}

function sortAnniversaries(events: ApiAnniversaryEvent[]) {
  return [...events].sort((left, right) => {
    const sortOrderRank = left.sortOrder - right.sortOrder;
    if (sortOrderRank !== 0) {
      return sortOrderRank;
    }

    const distanceRank = Math.abs(left.daysDelta) - Math.abs(right.daysDelta);
    if (distanceRank !== 0) {
      return distanceRank;
    }

    const dateRank = left.displayDate.localeCompare(right.displayDate);
    if (dateRank !== 0) {
      return dateRank;
    }

    return left.title.localeCompare(right.title, "zh-CN");
  });
}

export async function listAnniversaries(userId: string): Promise<ApiAnniversaryEvent[]> {
  const rows = await queryRows<AnniversaryRow>(
    `SELECT *
     FROM \`AnniversaryEvent\`
     WHERE \`userId\` = ?
     ORDER BY \`sortOrder\` ASC, \`date\` ASC, \`createdAt\` ASC, \`id\` ASC`,
    [userId]
  );
  return sortAnniversaries(rows.map(serializeAnniversary));
}

export async function getAnniversary(
  userId: string,
  eventId: string
): Promise<ApiAnniversaryEvent | null> {
  const row = await getAnniversaryRow(userId, eventId);
  return row ? serializeAnniversary(row) : null;
}

export async function createAnniversary(
  userId: string,
  input: CreateAnniversaryRequest
): Promise<ApiAnniversaryEvent> {
  const body = normalizeAnniversaryInput(createAnniversaryRequestSchema.parse(input));
  const eventId = id();
  const nextSortOrderRow = await queryOne<NextSortOrderRow>(
    "SELECT COALESCE(MAX(`sortOrder`), 0) + 1000 AS `nextSortOrder` FROM `AnniversaryEvent` WHERE `userId` = ?",
    [userId]
  );
  const nextSortOrder = Number(nextSortOrderRow?.nextSortOrder ?? 1000);

  await execute(
    `INSERT INTO \`AnniversaryEvent\`
      (\`id\`, \`userId\`, \`title\`, \`notes\`, \`category\`, \`date\`, \`repeat\`, \`direction\`, \`cardStyle\`, \`calendarType\`, \`lunarMonth\`, \`lunarDay\`, \`solarTerm\`, \`sortOrder\`, \`updatedAt\`)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))`,
    [
      eventId,
      userId,
      body.title,
      body.notes ?? null,
      body.category,
      body.date,
      body.repeat,
      body.direction,
      body.cardStyle,
      body.calendarType,
      body.lunarMonth ?? null,
      body.lunarDay ?? null,
      body.solarTerm ?? null,
      nextSortOrder
    ]
  );

  const anniversary = await getAnniversary(userId, eventId);
  if (!anniversary) {
    throw new AnniversaryDomainError("NOT_FOUND", "Anniversary not found after creation");
  }
  return anniversary;
}

export async function updateAnniversary(
  userId: string,
  eventId: string,
  input: UpdateAnniversaryRequest
): Promise<ApiAnniversaryEvent> {
  const body = updateAnniversaryRequestSchema.parse(input);
  const existing = await getAnniversaryRow(userId, eventId);
  if (!existing) {
    throw new AnniversaryDomainError("NOT_FOUND", "Anniversary not found");
  }

  const merged = normalizeAnniversaryInput(createAnniversaryRequestSchema.parse({
    title: body.title ?? existing.title,
    notes: body.notes === undefined ? existing.notes : body.notes,
    category: body.category ?? existing.category,
    date: body.date ?? existing.date,
    repeat: body.repeat ?? existing.repeat,
    direction: body.direction ?? existing.direction,
    cardStyle: body.cardStyle ?? existing.cardStyle,
    calendarType: body.calendarType ?? existing.calendarType,
    lunarMonth: body.lunarMonth === undefined ? existing.lunarMonth : body.lunarMonth,
    lunarDay: body.lunarDay === undefined ? existing.lunarDay : body.lunarDay,
    solarTerm: body.solarTerm === undefined ? existing.solarTerm : body.solarTerm
  }));

  await execute(
    `UPDATE \`AnniversaryEvent\` SET
      \`title\` = ?,
      \`notes\` = ?,
      \`category\` = ?,
      \`date\` = ?,
      \`repeat\` = ?,
      \`direction\` = ?,
      \`cardStyle\` = ?,
      \`calendarType\` = ?,
      \`lunarMonth\` = ?,
      \`lunarDay\` = ?,
      \`solarTerm\` = ?,
      \`updatedAt\` = NOW(3)
     WHERE \`id\` = ? AND \`userId\` = ?`,
    [
      merged.title,
      merged.notes ?? null,
      merged.category,
      merged.date,
      merged.repeat,
      merged.direction,
      merged.cardStyle,
      merged.calendarType,
      merged.lunarMonth ?? null,
      merged.lunarDay ?? null,
      merged.solarTerm ?? null,
      eventId,
      userId
    ]
  );

  const anniversary = await getAnniversary(userId, eventId);
  if (!anniversary) {
    throw new AnniversaryDomainError("NOT_FOUND", "Anniversary not found");
  }
  return anniversary;
}

export async function deleteAnniversary(userId: string, eventId: string): Promise<void> {
  const result = await execute(
    "DELETE FROM `AnniversaryEvent` WHERE `id` = ? AND `userId` = ?",
    [eventId, userId]
  );
  if (!result.affectedRows) {
    throw new AnniversaryDomainError("NOT_FOUND", "Anniversary not found");
  }
}
