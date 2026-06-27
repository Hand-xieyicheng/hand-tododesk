import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply } from "fastify";
import sanitizeHtml from "sanitize-html";
import {
  createPrintShareRequestSchema,
  printMemoSourceSchema,
  printShareConfigSchema,
  printTasksSourceSchema,
  sortTasksForDisplay,
  type PrintMemoSource,
  type PrintShareConfig,
  type PrintTasksSource
} from "@todo/shared";
import { config } from "../config.js";
import { asDate, execute, id, queryOne, queryRows, toMysqlDate, type DbRow } from "../db.js";

type PrintShareRow = DbRow & {
  id: string;
  userId: string;
  tokenHash: string;
  sourceType: string;
  sourceJson: unknown;
  configJson: unknown;
  expiresAt: Date | string;
  revokedAt: Date | string | null;
  lastAccessedAt: Date | string | null;
};

type TaskRow = DbRow & {
  id: string;
  userId: string;
  title: string;
  notes: string | null;
  status: string;
  sortOrder: number | string | null;
  createdAt: Date | string;
};

type TagRow = DbRow & {
  taskId: string;
  id: string;
  name: string;
};

type MemoRow = DbRow & {
  id: string;
  userId: string;
  title: string;
  contentHtml: string;
};

type PrintableTask = {
  id: string;
  title: string;
  notes: string | null;
  status: string;
  sortOrder: number | null;
  createdAt: string;
  tags: Array<{ id: string; name: string }>;
};

const allTagsFilterValue = "__all__";
const untaggedTagsFilterValue = "__untagged__";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function parseStoredJson(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }
  return JSON.parse(value);
}

function escapeHtml(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function unavailable(reply: FastifyReply) {
  return reply
    .code(410)
    .type("text/html; charset=utf-8")
    .send(`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>链接不可用</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #1f2937; background: #f8fafc; }
    main { width: min(320px, calc(100vw - 32px)); text-align: center; }
    h1 { margin: 0 0 8px; font-size: 20px; font-weight: 700; }
    p { margin: 0; font-size: 14px; line-height: 1.7; color: #64748b; }
  </style>
</head>
<body>
  <main>
    <h1>链接不可用</h1>
    <p>这个打印链接已失效或不存在。</p>
  </main>
</body>
</html>`);
}

function fontSizePx(configValue: PrintShareConfig) {
  if (configValue.fontSizeMode === "custom" && configValue.customFontSizePx) {
    return configValue.customFontSizePx;
  }
  if (configValue.fontSizeMode === "small") {
    return 12;
  }
  if (configValue.fontSizeMode === "large") {
    return 16;
  }
  return 14;
}

function marginMm(configValue: PrintShareConfig) {
  if (configValue.marginMode === "narrow") {
    return 2;
  }
  if (configValue.marginMode === "wide") {
    return 6;
  }
  return 4;
}

function htmlShell(title: string, configValue: PrintShareConfig, body: string) {
  const pageWidth = configValue.paperWidthMm;
  const maxHeight = configValue.maxHeightMm ? `max-height: ${configValue.maxHeightMm}mm;` : "";
  const templateClassName = `print-template-${configValue.templateId}`;
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      --paper-width: ${pageWidth}mm;
      --paper-margin: ${marginMm(configValue)}mm;
      --font-size: ${fontSizePx(configValue)}px;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: #f3f4f6; color: #111827; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: var(--font-size); line-height: 1.45; }
    main { width: var(--paper-width); ${maxHeight} min-height: 40mm; margin: 0 auto; padding: var(--paper-margin); background: #fff; }
    h1 { margin: 0 0 8px; font-size: 1.2em; line-height: 1.25; }
    ul { margin: 0; padding: 0; list-style: none; }
    li { display: grid; grid-template-columns: 14px 1fr; gap: 6px; padding: 5px 0; border-bottom: 1px dashed #d1d5db; break-inside: avoid; }
    li:last-child { border-bottom: 0; }
    .box { width: 12px; height: 12px; margin-top: 3px; border: 1px solid #111827; }
    .task-title { font-weight: 600; word-break: break-word; }
    .task-notes { margin-top: 2px; color: #4b5563; white-space: pre-wrap; word-break: break-word; }
    .tags { margin-top: 3px; color: #6b7280; font-size: 0.86em; }
    .memo-content { word-break: break-word; }
    .memo-content img { max-width: 100%; height: auto; }
    .empty { margin: 0; color: #6b7280; }
    .print-template-memo li { display: block; }
    .print-template-memo .box { display: none; }
    .print-template-memo .task-title { font-weight: 500; }
    .print-template-compact { line-height: 1.25; }
    .print-template-compact h1 { margin-bottom: 5px; font-size: 1.05em; }
    .print-template-compact li { grid-template-columns: 10px 1fr; gap: 4px; padding: 2px 0; }
    .print-template-compact .box { width: 9px; height: 9px; margin-top: 2px; }
    .print-template-compact .task-notes,
    .print-template-compact .tags { margin-top: 1px; font-size: 0.78em; }
    .print-template-decorated { border: 1px solid #111827; }
    .print-template-decorated h1 { margin-bottom: 10px; padding-bottom: 5px; text-align: center; border-bottom: 1px solid #111827; }
    .print-template-decorated h1::before,
    .print-template-decorated h1::after { content: "·"; padding: 0 4px; }
    @page { size: ${pageWidth}mm auto; margin: 0; }
    @media print {
      body { background: #fff; }
      main { width: ${pageWidth}mm; margin: 0; box-shadow: none; }
    }
  </style>
</head>
<body>
  <main class="${templateClassName}">${body}</main>
</body>
</html>`;
}

function parseConfig(share: PrintShareRow) {
  const result = printShareConfigSchema.safeParse(parseStoredJson(share.configJson));
  return result.success ? result.data : null;
}

function parseTasksSource(share: PrintShareRow) {
  const result = printTasksSourceSchema.safeParse(parseStoredJson(share.sourceJson));
  return result.success ? result.data : null;
}

function parseMemoSource(share: PrintShareRow) {
  const result = printMemoSourceSchema.safeParse(parseStoredJson(share.sourceJson));
  return result.success ? result.data : null;
}

function taskMatchesSource(task: PrintableTask, source: PrintTasksSource) {
  if (!source.showCompletedTasks && task.status === "COMPLETED") {
    return false;
  }
  if (source.tagFilter === allTagsFilterValue) {
    return true;
  }
  if (source.tagFilter === untaggedTagsFilterValue) {
    return task.tags.length === 0;
  }
  return task.tags.some((tag) => tag.id === source.tagFilter);
}

async function getTaskTags(userId: string, taskIds: string[]) {
  if (taskIds.length === 0) {
    return new Map<string, Array<{ id: string; name: string }>>();
  }

  const placeholders = taskIds.map(() => "?").join(", ");
  const rows = await queryRows<TagRow>(
    `SELECT tt.\`taskId\`, t.\`id\`, t.\`name\`
     FROM \`TaskTag\` tt
     INNER JOIN \`Tag\` t ON t.\`id\` = tt.\`tagId\`
     WHERE t.\`userId\` = ? AND tt.\`taskId\` IN (${placeholders})
     ORDER BY t.\`name\` ASC, t.\`id\` ASC`,
    [userId, ...taskIds]
  );

  const tagsByTaskId = new Map<string, Array<{ id: string; name: string }>>();
  for (const row of rows) {
    const tags = tagsByTaskId.get(row.taskId) ?? [];
    tags.push({ id: row.id, name: row.name });
    tagsByTaskId.set(row.taskId, tags);
  }
  return tagsByTaskId;
}

function serializeTask(row: TaskRow, tags: Array<{ id: string; name: string }>): PrintableTask {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    status: row.status,
    sortOrder: row.sortOrder === null || row.sortOrder === undefined ? null : Number(row.sortOrder),
    createdAt: asDate(row.createdAt)?.toISOString() ?? new Date(0).toISOString(),
    tags
  };
}

function renderTaskList(tasks: PrintableTask[], configValue: PrintShareConfig) {
  const items = tasks.map((task) => {
    const notes = task.notes ? `<div class="task-notes">${escapeHtml(task.notes)}</div>` : "";
    const tags = task.tags.length > 0
      ? `<div class="tags">${task.tags.map((tag) => `#${escapeHtml(tag.name)}`).join(" ")}</div>`
      : "";
    return `<li><span class="box"></span><div><div class="task-title">${escapeHtml(task.title)}</div>${notes}${tags}</div></li>`;
  }).join("");
  return htmlShell("任务打印", configValue, `<h1>任务清单</h1>${items ? `<ul>${items}</ul>` : `<p class="empty">暂无任务</p>`}`);
}

function sanitizeMemoContent(html: string) {
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
    allowedSchemes: ["http", "https"],
    allowedSchemesByTag: {
      img: ["http", "https"]
    },
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noreferrer", target: "_blank" })
    }
  }).trim();
}

function renderMemo(memo: MemoRow, configValue: PrintShareConfig) {
  const content = sanitizeMemoContent(memo.contentHtml);
  return htmlShell(
    memo.title,
    configValue,
    `<h1>${escapeHtml(memo.title)}</h1><div class="memo-content">${content || "<p class=\"empty\">暂无内容</p>"}</div>`
  );
}

async function renderTasksShare(share: PrintShareRow, source: PrintTasksSource, configValue: PrintShareConfig) {
  const rows = await queryRows<TaskRow>(
    `SELECT \`id\`, \`userId\`, \`title\`, \`notes\`, \`status\`, \`sortOrder\`, \`createdAt\`
     FROM \`Task\`
     WHERE \`userId\` = ? AND \`status\` <> 'ARCHIVED'`,
    [share.userId]
  );
  const tagsByTaskId = await getTaskTags(share.userId, rows.map((row) => row.id));
  const tasks = sortTasksForDisplay(
    rows
      .map((row) => serializeTask(row, tagsByTaskId.get(row.id) ?? []))
      .filter((task) => taskMatchesSource(task, source))
  );

  return renderTaskList(tasks, configValue);
}

async function getSharedMemo(share: PrintShareRow, source: PrintMemoSource) {
  return queryOne<MemoRow>(
    "SELECT `id`, `userId`, `title`, `contentHtml` FROM `Memo` WHERE `id` = ? AND `userId` = ?",
    [source.memoId, share.userId]
  );
}

function publicPrintUrl(token: string) {
  return new URL(`/print/${token}`, config.API_PUBLIC_URL).toString();
}

export async function printShareRoutes(app: FastifyInstance) {
  app.post("/print-shares", { preHandler: app.authenticate }, async (request, reply) => {
    const body = createPrintShareRequestSchema.parse(request.body);

    await execute("DELETE FROM `PrintShare` WHERE `userId` = ? AND `expiresAt` < NOW(3)", [request.user.id]);

    if (body.sourceType === "memo") {
      const memo = await queryOne<DbRow & { id: string }>(
        "SELECT `id` FROM `Memo` WHERE `id` = ? AND `userId` = ?",
        [body.source.memoId, request.user.id]
      );
      if (!memo) {
        return reply.code(404).send({ error: "Memo not found" });
      }
    }

    const token = randomBytes(32).toString("base64url");
    const shareId = id();
    const expiresAt = new Date(Date.now() + body.config.expiresInHours * 60 * 60 * 1000);

    await execute(
      `INSERT INTO \`PrintShare\`
        (\`id\`, \`userId\`, \`tokenHash\`, \`sourceType\`, \`sourceJson\`, \`configJson\`, \`expiresAt\`, \`updatedAt\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(3))`,
      [
        shareId,
        request.user.id,
        hashToken(token),
        body.sourceType,
        JSON.stringify(body.source),
        JSON.stringify(body.config),
        toMysqlDate(expiresAt)
      ]
    );

    return reply.code(201).send({
      printShare: {
        id: shareId,
        url: publicPrintUrl(token),
        expiresAt: expiresAt.toISOString()
      }
    });
  });

  app.delete("/print-shares/:id", { preHandler: app.authenticate }, async (request) => {
    const shareId = (request.params as { id: string }).id;
    await execute(
      "UPDATE `PrintShare` SET `revokedAt` = NOW(3), `updatedAt` = NOW(3) WHERE `id` = ? AND `userId` = ?",
      [shareId, request.user.id]
    );
    return { ok: true };
  });

  app.get("/print/:token", async (request, reply) => {
    const token = (request.params as { token: string }).token;
    const share = await queryOne<PrintShareRow>("SELECT * FROM `PrintShare` WHERE `tokenHash` = ?", [hashToken(token)]);
    const expiresAt = share ? asDate(share.expiresAt) : null;
    if (!share || !expiresAt || expiresAt.getTime() <= Date.now() || share.revokedAt) {
      return unavailable(reply);
    }

    let configValue: PrintShareConfig | null;
    try {
      configValue = parseConfig(share);
    } catch {
      return unavailable(reply);
    }
    if (!configValue) {
      return unavailable(reply);
    }

    if (share.sourceType === "tasks") {
      let source: PrintTasksSource | null;
      try {
        source = parseTasksSource(share);
      } catch {
        return unavailable(reply);
      }
      if (!source) {
        return unavailable(reply);
      }
      const html = await renderTasksShare(share, source, configValue);
      await execute("UPDATE `PrintShare` SET `lastAccessedAt` = NOW(3), `updatedAt` = NOW(3) WHERE `id` = ?", [share.id]);
      return reply.type("text/html; charset=utf-8").send(html);
    }

    if (share.sourceType === "memo") {
      let source: PrintMemoSource | null;
      try {
        source = parseMemoSource(share);
      } catch {
        return unavailable(reply);
      }
      if (!source) {
        return unavailable(reply);
      }
      const memo = await getSharedMemo(share, source);
      if (!memo) {
        return unavailable(reply);
      }
      await execute("UPDATE `PrintShare` SET `lastAccessedAt` = NOW(3), `updatedAt` = NOW(3) WHERE `id` = ?", [share.id]);
      return reply.type("text/html; charset=utf-8").send(renderMemo(memo, configValue));
    }

    return unavailable(reply);
  });
}
