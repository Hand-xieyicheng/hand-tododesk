import type { FastifyInstance } from "fastify";
import {
  anniversaryCalendarTypeValues,
  anniversaryCardStyleValues,
  anniversaryCategoryValues,
  anniversaryDirectionValues,
  anniversaryRepeatValues,
  anniversarySolarTermValues,
  calculateAnniversaryDisplay,
  createAnniversaryRequestSchema,
  updateAnniversaryOrderRequestSchema,
  updateAnniversaryRequestSchema,
  type AnniversaryCalendarType,
  type AnniversaryCardStyle,
  type AnniversaryCategory,
  type AnniversaryDirection,
  type AnniversaryRepeat,
  type AnniversarySolarTerm,
  type ApiAnniversaryEvent,
  type CreateAnniversaryRequest
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

function enumFromDb<TValue extends string>(values: readonly TValue[], value: string | null | undefined, fallback: TValue) {
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
  const category = enumFromDb(anniversaryCategoryValues, row.category, "ANNIVERSARY") as AnniversaryCategory;
  const repeat = enumFromDb(anniversaryRepeatValues, row.repeat, "NONE") as AnniversaryRepeat;
  const direction = enumFromDb(anniversaryDirectionValues, row.direction, "AUTO") as AnniversaryDirection;
  const cardStyle = enumFromDb(anniversaryCardStyleValues, row.cardStyle, "lavender") as AnniversaryCardStyle;
  const calendarType = enumFromDb(anniversaryCalendarTypeValues, row.calendarType, "SOLAR") as AnniversaryCalendarType;
  const solarTerm = row.solarTerm
    ? enumFromDb(anniversarySolarTermValues, row.solarTerm, "QINGMING") as AnniversarySolarTerm
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

async function getAnniversary(eventId: string, userId: string) {
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

export async function anniversaryRoutes(app: FastifyInstance) {
  app.get("/anniversaries", { preHandler: app.authenticate }, async (request) => {
    const rows = await queryRows<AnniversaryRow>(
      `SELECT *
       FROM \`AnniversaryEvent\`
       WHERE \`userId\` = ?
       ORDER BY \`sortOrder\` ASC, \`date\` ASC, \`createdAt\` ASC, \`id\` ASC`,
      [request.user.id]
    );
    return { anniversaries: sortAnniversaries(rows.map(serializeAnniversary)) };
  });

  app.put("/anniversaries/order", { preHandler: app.authenticate }, async (request, reply) => {
    const body = updateAnniversaryOrderRequestSchema.parse(request.body);
    const placeholders = body.orderedIds.map(() => "?").join(", ");
    const rows = await queryRows<DbRow & { id: string }>(
      `SELECT \`id\`
       FROM \`AnniversaryEvent\`
       WHERE \`userId\` = ? AND \`id\` IN (${placeholders})`,
      [request.user.id, ...body.orderedIds]
    );
    if (rows.length !== body.orderedIds.length) {
      return reply.code(404).send({ error: "Anniversary not found" });
    }

    await Promise.all(body.orderedIds.map((eventId, index) => execute(
      "UPDATE `AnniversaryEvent` SET `sortOrder` = ?, `updatedAt` = NOW(3) WHERE `id` = ? AND `userId` = ?",
      [(index + 1) * 1000, eventId, request.user.id]
    )));

    return { ok: true };
  });

  app.post("/anniversaries", { preHandler: app.authenticate }, async (request, reply) => {
    const body = normalizeAnniversaryInput(createAnniversaryRequestSchema.parse(request.body));
    const eventId = id();
    const nextSortOrderRow = await queryOne<NextSortOrderRow>(
      "SELECT COALESCE(MAX(`sortOrder`), 0) + 1000 AS `nextSortOrder` FROM `AnniversaryEvent` WHERE `userId` = ?",
      [request.user.id]
    );
    const nextSortOrder = Number(nextSortOrderRow?.nextSortOrder ?? 1000);

    await execute(
      `INSERT INTO \`AnniversaryEvent\`
        (\`id\`, \`userId\`, \`title\`, \`notes\`, \`category\`, \`date\`, \`repeat\`, \`direction\`, \`cardStyle\`, \`calendarType\`, \`lunarMonth\`, \`lunarDay\`, \`solarTerm\`, \`sortOrder\`, \`updatedAt\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))`,
      [
        eventId,
        request.user.id,
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

    const anniversary = await getAnniversary(eventId, request.user.id);
    return reply.code(201).send({ anniversary: anniversary ? serializeAnniversary(anniversary) : null });
  });

  app.patch("/anniversaries/:id", { preHandler: app.authenticate }, async (request, reply) => {
    const eventId = (request.params as { id: string }).id;
    const body = updateAnniversaryRequestSchema.parse(request.body);
    const existing = await getAnniversary(eventId, request.user.id);
    if (!existing) {
      return reply.code(404).send({ error: "Anniversary not found" });
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
        request.user.id
      ]
    );

    const anniversary = await getAnniversary(eventId, request.user.id);
    return { anniversary: anniversary ? serializeAnniversary(anniversary) : null };
  });

  app.delete("/anniversaries/:id", { preHandler: app.authenticate }, async (request, reply) => {
    const eventId = (request.params as { id: string }).id;
    const result = await execute("DELETE FROM `AnniversaryEvent` WHERE `id` = ? AND `userId` = ?", [eventId, request.user.id]);
    if (!result.affectedRows) {
      return reply.code(404).send({ error: "Anniversary not found" });
    }

    return reply.code(204).send();
  });
}
