import type { FastifyInstance } from "fastify";
import { createTagRequestSchema, updateTagOrderRequestSchema, updateTagRequestSchema, type ApiTag } from "@todo/shared";
import { execute, id, queryOne, queryRows, type DbRow } from "../db.js";

type TagRow = DbRow & {
  id: string;
  userId: string;
  name: string;
  sortOrder: number | string;
};

type NextSortOrderRow = DbRow & {
  nextSortOrder: number | string;
};

function serializeTag(row: TagRow): ApiTag {
  return {
    id: row.id,
    name: row.name
  };
}

async function findUserTagByName(userId: string, name: string) {
  return queryOne<TagRow>("SELECT * FROM `Tag` WHERE `userId` = ? AND `name` = ?", [userId, name]);
}

export async function tagRoutes(app: FastifyInstance) {
  app.get("/tags", { preHandler: app.authenticate }, async (request) => {
    const rows = await queryRows<TagRow>(
      "SELECT * FROM `Tag` WHERE `userId` = ? ORDER BY `sortOrder` ASC, `createdAt` ASC, `name` ASC, `id` ASC",
      [request.user.id]
    );
    return { tags: rows.map(serializeTag) };
  });

  app.put("/tags/order", { preHandler: app.authenticate }, async (request, reply) => {
    const body = updateTagOrderRequestSchema.parse(request.body);
    const placeholders = body.orderedIds.map(() => "?").join(", ");
    const rows = await queryRows<DbRow & { id: string }>(
      `SELECT \`id\`
       FROM \`Tag\`
       WHERE \`userId\` = ? AND \`id\` IN (${placeholders})`,
      [request.user.id, ...body.orderedIds]
    );
    if (rows.length !== body.orderedIds.length) {
      return reply.code(404).send({ error: "Tag not found" });
    }

    await Promise.all(body.orderedIds.map((tagId, index) => execute(
      "UPDATE `Tag` SET `sortOrder` = ? WHERE `id` = ? AND `userId` = ?",
      [(index + 1) * 1000, tagId, request.user.id]
    )));

    return { ok: true };
  });

  app.post("/tags", { preHandler: app.authenticate }, async (request, reply) => {
    const body = createTagRequestSchema.parse(request.body);
    const duplicate = await findUserTagByName(request.user.id, body.name);
    if (duplicate) {
      return reply.code(409).send({ error: "Tag already exists" });
    }

    const tagId = id();
    const nextSortOrderRow = await queryOne<NextSortOrderRow>(
      "SELECT COALESCE(MAX(`sortOrder`), 0) + 1000 AS `nextSortOrder` FROM `Tag` WHERE `userId` = ?",
      [request.user.id]
    );
    const nextSortOrder = Number(nextSortOrderRow?.nextSortOrder ?? 1000);
    await execute("INSERT INTO `Tag` (`id`, `userId`, `name`, `sortOrder`) VALUES (?, ?, ?, ?)", [tagId, request.user.id, body.name, nextSortOrder]);
    const tag = await queryOne<TagRow>("SELECT * FROM `Tag` WHERE `id` = ? AND `userId` = ?", [tagId, request.user.id]);
    return reply.code(201).send({ tag: tag ? serializeTag(tag) : null });
  });

  app.patch("/tags/:id", { preHandler: app.authenticate }, async (request, reply) => {
    const tagId = (request.params as { id: string }).id;
    const body = updateTagRequestSchema.parse(request.body);
    const existing = await queryOne<TagRow>("SELECT * FROM `Tag` WHERE `id` = ? AND `userId` = ?", [tagId, request.user.id]);
    if (!existing) {
      return reply.code(404).send({ error: "Tag not found" });
    }

    const duplicate = await findUserTagByName(request.user.id, body.name);
    if (duplicate && duplicate.id !== tagId) {
      return reply.code(409).send({ error: "Tag already exists" });
    }

    await execute("UPDATE `Tag` SET `name` = ? WHERE `id` = ? AND `userId` = ?", [body.name, tagId, request.user.id]);
    const tag = await queryOne<TagRow>("SELECT * FROM `Tag` WHERE `id` = ? AND `userId` = ?", [tagId, request.user.id]);
    return { tag: tag ? serializeTag(tag) : null };
  });

  app.delete("/tags/:id", { preHandler: app.authenticate }, async (request, reply) => {
    const tagId = (request.params as { id: string }).id;
    const result = await execute("DELETE FROM `Tag` WHERE `id` = ? AND `userId` = ?", [tagId, request.user.id]);
    if (!result.affectedRows) {
      return reply.code(404).send({ error: "Tag not found" });
    }
    return reply.code(204).send();
  });
}
