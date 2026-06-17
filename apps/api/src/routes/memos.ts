import fs from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import sanitizeHtml from "sanitize-html";
import type { ApiMemo, ApiMemoAsset, ApiMemoListItem } from "@todo/shared";
import { createMemoRequestSchema, memoListQuerySchema, updateMemoRequestSchema } from "@todo/shared";
import { asDate, execute, id, queryOne, queryRows, toMysqlDate, type DbRow } from "../db.js";
import {
  MEMO_ASSET_MAX_BYTES,
  createMemoAssetFilename,
  ensureMemoAssetDirectory,
  memoAssetDirectory,
  memoAssetExtensionForMime,
  memoAssetUrl,
  readMemoImageDimensions,
  removeMemoAssetFile
} from "../services/memo-assets.js";

type MemoRow = DbRow & {
  id: string;
  userId: string;
  title: string;
  contentHtml: string;
  excerpt: string | null;
  isPinned: boolean | number;
  archivedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type MemoAssetRow = DbRow & {
  id: string;
  memoId: string;
  userId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  path: string;
  createdAt: Date | string;
};

function normalizeMemoTitle(title: string | null | undefined) {
  const normalized = title?.trim();
  return normalized || "未命名备忘录";
}

function sanitizeMemoHtml(html: string) {
  return sanitizeHtml(html, {
    allowedTags: [
      "a",
      "b",
      "blockquote",
      "br",
      "code",
      "div",
      "em",
      "figcaption",
      "figure",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "hr",
      "i",
      "img",
      "li",
      "ol",
      "p",
      "pre",
      "s",
      "span",
      "strong",
      "sub",
      "sup",
      "table",
      "tbody",
      "td",
      "th",
      "thead",
      "tr",
      "u",
      "ul"
    ],
    allowedAttributes: {
      a: ["href", "rel", "target", "title"],
      img: ["alt", "height", "src", "title", "width"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan"]
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: {
      img: ["http", "https"]
    },
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noreferrer", target: "_blank" })
    }
  }).trim();
}

function buildMemoExcerpt(html: string) {
  const excerpt = sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, " ")
    .trim();

  return excerpt ? excerpt.slice(0, 500) : null;
}

function serializeAsset(row: MemoAssetRow): ApiMemoAsset {
  return {
    id: row.id,
    memoId: row.memoId,
    filename: row.filename,
    mimeType: row.mimeType,
    sizeBytes: Number(row.sizeBytes),
    width: row.width === null ? null : Number(row.width),
    height: row.height === null ? null : Number(row.height),
    url: memoAssetUrl(row.path),
    createdAt: asDate(row.createdAt)?.toISOString() ?? new Date().toISOString()
  };
}

function serializeMemoListItem(row: MemoRow): ApiMemoListItem {
  return {
    id: row.id,
    title: row.title,
    excerpt: row.excerpt,
    isPinned: Boolean(row.isPinned),
    archivedAt: asDate(row.archivedAt)?.toISOString() ?? null,
    createdAt: asDate(row.createdAt)?.toISOString() ?? new Date().toISOString(),
    updatedAt: asDate(row.updatedAt)?.toISOString() ?? new Date().toISOString()
  };
}

async function serializeMemo(row: MemoRow): Promise<ApiMemo> {
  const assets = await queryRows<MemoAssetRow>(
    "SELECT * FROM `MemoAsset` WHERE `memoId` = ? ORDER BY `createdAt` ASC, `id` ASC",
    [row.id]
  );

  return {
    ...serializeMemoListItem(row),
    contentHtml: row.contentHtml,
    assets: assets.map(serializeAsset)
  };
}

async function getMemo(memoId: string, userId: string) {
  return queryOne<MemoRow>(
    `SELECT m.*
     FROM \`Memo\` m
     WHERE m.\`id\` = ? AND m.\`userId\` = ?`,
    [memoId, userId]
  );
}

function safeUploadFilename(filename: string | undefined, extension: string) {
  const fallback = `image.${extension}`;
  const basename = path.basename(filename || fallback).replace(/[^\w.\-\u4e00-\u9fa5]/g, "_");
  return (basename || fallback).slice(0, 180);
}

export async function memoRoutes(app: FastifyInstance) {
  app.get("/memos", { preHandler: app.authenticate }, async (request) => {
    const query = memoListQuerySchema.parse(request.query);
    const filters = ["m.`userId` = ?", query.archived === "true" ? "m.`archivedAt` IS NOT NULL" : "m.`archivedAt` IS NULL"];
    const values: unknown[] = [request.user.id];

    if (query.query) {
      filters.push("(m.`title` LIKE ? OR m.`contentHtml` LIKE ?)");
      const pattern = `%${query.query}%`;
      values.push(pattern, pattern);
    }

    const rows = await queryRows<MemoRow>(
      `SELECT m.*
       FROM \`Memo\` m
       WHERE ${filters.join(" AND ")}
       ORDER BY m.\`isPinned\` DESC, m.\`updatedAt\` DESC, m.\`id\` ASC`,
      values
    );

    return { memos: rows.map(serializeMemoListItem) };
  });

  app.post("/memos", { preHandler: app.authenticate }, async (request, reply) => {
    const body = createMemoRequestSchema.parse(request.body);
    const memoId = id();
    const contentHtml = sanitizeMemoHtml(body.contentHtml ?? "");

    await execute(
      `INSERT INTO \`Memo\`
        (\`id\`, \`userId\`, \`title\`, \`contentHtml\`, \`excerpt\`, \`isPinned\`, \`updatedAt\`)
       VALUES (?, ?, ?, ?, ?, ?, NOW(3))`,
      [
        memoId,
        request.user.id,
        normalizeMemoTitle(body.title),
        contentHtml,
        buildMemoExcerpt(contentHtml),
        body.isPinned ?? false
      ]
    );

    const memo = await getMemo(memoId, request.user.id);
    return reply.code(201).send({ memo: memo ? await serializeMemo(memo) : null });
  });

  app.get("/memos/:id", { preHandler: app.authenticate }, async (request, reply) => {
    const memoId = (request.params as { id: string }).id;
    const memo = await getMemo(memoId, request.user.id);
    if (!memo) {
      return reply.code(404).send({ error: "Memo not found" });
    }

    return { memo: await serializeMemo(memo) };
  });

  app.patch("/memos/:id", { preHandler: app.authenticate }, async (request, reply) => {
    const memoId = (request.params as { id: string }).id;
    const body = updateMemoRequestSchema.parse(request.body);
    const existing = await getMemo(memoId, request.user.id);
    if (!existing) {
      return reply.code(404).send({ error: "Memo not found" });
    }

    const contentHtml = body.contentHtml === undefined ? existing.contentHtml : sanitizeMemoHtml(body.contentHtml);
    const archivedAt = body.archived === undefined
      ? asDate(existing.archivedAt)
      : body.archived ? new Date() : null;

    await execute(
      `UPDATE \`Memo\` SET
        \`title\` = ?,
        \`contentHtml\` = ?,
        \`excerpt\` = ?,
        \`isPinned\` = ?,
        \`archivedAt\` = ?,
        \`updatedAt\` = NOW(3)
       WHERE \`id\` = ? AND \`userId\` = ?`,
      [
        body.title === undefined ? existing.title : normalizeMemoTitle(body.title),
        contentHtml,
        buildMemoExcerpt(contentHtml),
        body.isPinned ?? Boolean(existing.isPinned),
        toMysqlDate(archivedAt),
        memoId,
        request.user.id
      ]
    );

    const memo = await getMemo(memoId, request.user.id);
    return { memo: memo ? await serializeMemo(memo) : null };
  });

  app.delete("/memos/:id", { preHandler: app.authenticate }, async (request, reply) => {
    const memoId = (request.params as { id: string }).id;
    const existing = await getMemo(memoId, request.user.id);
    if (!existing) {
      return reply.code(404).send({ error: "Memo not found" });
    }

    const assets = await queryRows<MemoAssetRow>("SELECT * FROM `MemoAsset` WHERE `memoId` = ?", [memoId]);
    const result = await execute("DELETE FROM `Memo` WHERE `id` = ? AND `userId` = ?", [memoId, request.user.id]);
    if (!result.affectedRows) {
      return reply.code(404).send({ error: "Memo not found" });
    }

    await Promise.all(assets.map((asset) => removeMemoAssetFile(asset.path)));
    return reply.code(204).send();
  });

  app.post("/memos/:id/assets", { preHandler: app.authenticate }, async (request, reply) => {
    const memoId = (request.params as { id: string }).id;
    const memo = await getMemo(memoId, request.user.id);
    if (!memo) {
      return reply.code(404).send({ error: "Memo not found" });
    }

    const file = await request.file();
    if (!file) {
      return reply.code(400).send({ error: "Image file is required" });
    }

    const extension = memoAssetExtensionForMime(file.mimetype);
    if (!extension) {
      return reply.code(400).send({ error: "Image must be PNG, JPEG, WebP, or GIF" });
    }

    let buffer: Buffer;
    try {
      buffer = await file.toBuffer();
    } catch {
      return reply.code(413).send({ error: "Image must be 10MB or smaller" });
    }

    if (buffer.length > MEMO_ASSET_MAX_BYTES || file.file.truncated) {
      return reply.code(413).send({ error: "Image must be 10MB or smaller" });
    }

    let dimensions: { width: number | null; height: number | null };
    try {
      dimensions = readMemoImageDimensions(buffer, file.mimetype);
    } catch {
      return reply.code(400).send({ error: "Image is invalid" });
    }

    await ensureMemoAssetDirectory();
    const assetId = id();
    const storageName = createMemoAssetFilename(request.user.id, memoId, extension);
    const storagePath = path.join(memoAssetDirectory, storageName);
    await fs.writeFile(storagePath, buffer, { flag: "wx" });

    try {
      await execute(
        `INSERT INTO \`MemoAsset\`
          (\`id\`, \`memoId\`, \`userId\`, \`filename\`, \`mimeType\`, \`sizeBytes\`, \`width\`, \`height\`, \`path\`)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          assetId,
          memoId,
          request.user.id,
          safeUploadFilename(file.filename, extension),
          file.mimetype,
          buffer.length,
          dimensions.width,
          dimensions.height,
          storageName
        ]
      );
    } catch (error) {
      await removeMemoAssetFile(storageName);
      throw error;
    }

    const asset = await queryOne<MemoAssetRow>("SELECT * FROM `MemoAsset` WHERE `id` = ?", [assetId]);
    return reply.code(201).send({ asset: asset ? serializeAsset(asset) : null });
  });
}
