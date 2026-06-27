# Gugu Printer Print Share Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add opt-in todo/memo print buttons that generate temporary public print links for Gugu/MiaoMiao-style label printer apps.

**Architecture:** The desktop app creates authenticated `PrintShare` records through the API. The API stores a hashed token, source reference, print config, and expiration, then serves a public `/print/:token` HTML page that validates the token and renders current todo or memo content for thermal printer paper widths. Profile preference state controls whether print entry points are visible.

**Tech Stack:** TypeScript, React, Fastify, MySQL direct SQL helpers, Prisma schema/migrations, Zod, Vitest, animal-island-ui, lucide-react.

---

## File Structure

- Modify `packages/shared/src/index.ts`: add print template/config/source schemas, request/response types, and `printButtonEnabled` preference.
- Modify `packages/shared/src/index.test.ts`: cover print config validation and print preference parsing.
- Modify `apps/api/prisma/schema.prisma`: add `PrintShare` model, `User.printShares`, and `UserThemePreference.printButtonEnabled`.
- Create `apps/api/prisma/migrations/000022_print_shares/migration.sql`: add table and preference column. Keep `000022` because `000021_floating_card_view_mode` exists in this worktree.
- Modify `apps/api/src/db.ts`: add incremental schema repair for `PrintShare` and `printButtonEnabled`.
- Modify `apps/api/src/routes/preferences.ts`: persist and serialize `printButtonEnabled`.
- Modify `apps/api/src/routes/preferences.test.ts`: cover default and saved print preference.
- Create `apps/api/src/routes/print-shares.ts`: authenticated create/revoke routes and public print HTML route.
- Create `apps/api/src/routes/print-shares.test.ts`: cover cleanup, token behavior, public HTML, and authorization boundaries.
- Modify `apps/api/src/app.ts`: register print share routes.
- Modify `apps/desktop/src/api/client.ts`: add `createPrintShare()` and `revokePrintShare()`.
- Create `apps/desktop/src/components/PrintShareDialog.tsx`: shared modal for print template/config and generated URL.
- Create `apps/desktop/src/components/PrintShareDialog.test.tsx`: cover configuration and generated link UI.
- Modify `apps/desktop/src/App.tsx`: apply print preference, profile handler, task print entry, and pass memo prop.
- Modify `apps/desktop/src/App.test.tsx`: cover hidden/default and visible task print entry.
- Modify `apps/desktop/src/components/FloatingCard.tsx`: update local default theme preference shape for the new field.
- Modify `apps/desktop/src/components/MemoFloatingCard.tsx`: update local default theme preference shape for the new field.
- Modify `apps/desktop/src/components/ProfileCenter.tsx`: add profile toggle for print button.
- Modify `apps/desktop/src/components/ProfileCenter.test.tsx`: cover print setting render/callback.
- Modify `apps/desktop/src/components/MemoPanel.tsx`: add opt-in memo print topbar button and save-before-print flow.
- Modify `apps/desktop/src/components/MemoPanel.test.tsx`: cover memo print button and save-before-dialog.
- Modify `apps/desktop/src/styles.css`: add modal and print control styling.

Before execution, run `git status --short` and do not stage unrelated existing changes or `.superpowers/`.

## Task 1: Shared Print Contracts

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/src/index.test.ts`

- [ ] **Step 1: Write failing shared contract tests**

Add these imports to `packages/shared/src/index.test.ts`:

```ts
  createPrintShareRequestSchema,
  printFontSizeModeValues,
  printMarginModeValues,
  printPaperWidthModeValues,
  printTemplateIdValues,
```

Add this test inside `describe("profile schemas", ...)` after the existing appearance preference assertions:

```ts
    expect(updateThemePreferenceRequestSchema.parse({ printButtonEnabled: true })).toEqual({ printButtonEnabled: true });
    expect(updateThemePreferenceRequestSchema.parse({ printButtonEnabled: false })).toEqual({ printButtonEnabled: false });
```

Add this new describe block after `describe("profile schemas", ...)`:

```ts
describe("print share schemas", () => {
  it("accepts supported print templates and printer dimensions", () => {
    expect(printTemplateIdValues).toEqual(["checklist", "memo", "compact", "decorated"]);
    expect(printPaperWidthModeValues).toEqual(["preset", "custom"]);
    expect(printFontSizeModeValues).toEqual(["small", "normal", "large", "custom"]);
    expect(printMarginModeValues).toEqual(["narrow", "normal", "wide"]);

    expect(createPrintShareRequestSchema.parse({
      sourceType: "tasks",
      source: {
        tagFilter: "__all__",
        showCompletedTasks: false,
        viewMode: "kanban"
      },
      config: {
        templateId: "checklist",
        paperWidthMode: "preset",
        paperWidthMm: 58,
        fontSizeMode: "normal",
        marginMode: "normal",
        expiresInHours: 24
      }
    })).toMatchObject({
      sourceType: "tasks",
      source: {
        tagFilter: "__all__",
        showCompletedTasks: false,
        viewMode: "kanban"
      },
      config: {
        templateId: "checklist",
        paperWidthMm: 58,
        expiresInHours: 24
      }
    });

    expect(createPrintShareRequestSchema.parse({
      sourceType: "memo",
      source: { memoId: "memo-1" },
      config: {
        templateId: "decorated",
        paperWidthMode: "custom",
        paperWidthMm: 62,
        maxHeightMm: 160,
        fontSizeMode: "custom",
        customFontSizePx: 15,
        marginMode: "wide",
        expiresInHours: 168
      }
    }).config).toMatchObject({
      paperWidthMode: "custom",
      paperWidthMm: 62,
      customFontSizePx: 15
    });
  });

  it("rejects invalid print share requests", () => {
    expect(createPrintShareRequestSchema.safeParse({
      sourceType: "tasks",
      source: {
        tagFilter: "__all__",
        showCompletedTasks: true,
        viewMode: "board"
      },
      config: {
        templateId: "checklist",
        paperWidthMode: "preset",
        paperWidthMm: 58,
        fontSizeMode: "normal",
        marginMode: "normal",
        expiresInHours: 24
      }
    }).success).toBe(false);

    expect(createPrintShareRequestSchema.safeParse({
      sourceType: "memo",
      source: { memoId: "memo-1" },
      config: {
        templateId: "memo",
        paperWidthMode: "custom",
        paperWidthMm: 20,
        fontSizeMode: "custom",
        marginMode: "normal",
        expiresInHours: 999
      }
    }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the shared tests and verify failure**

Run:

```bash
npm run test -w @todo/shared -- packages/shared/src/index.test.ts
```

Expected: FAIL because `createPrintShareRequestSchema` and print value exports do not exist yet.

- [ ] **Step 3: Implement shared schemas and types**

In `packages/shared/src/index.ts`, add constants near the other value arrays:

```ts
export const printTemplateIdValues = ["checklist", "memo", "compact", "decorated"] as const;
export const printPaperWidthModeValues = ["preset", "custom"] as const;
export const printFontSizeModeValues = ["small", "normal", "large", "custom"] as const;
export const printMarginModeValues = ["narrow", "normal", "wide"] as const;
export const printSourceTypeValues = ["tasks", "memo"] as const;
```

Add schemas after `updateTaskOrderRequestSchema`:

```ts
export const printShareConfigSchema = z.object({
  templateId: z.enum(printTemplateIdValues),
  paperWidthMode: z.enum(printPaperWidthModeValues),
  paperWidthMm: z.number().int().min(40).max(120),
  maxHeightMm: z.number().int().min(40).max(1000).optional().nullable(),
  fontSizeMode: z.enum(printFontSizeModeValues),
  customFontSizePx: z.number().int().min(8).max(28).optional().nullable(),
  marginMode: z.enum(printMarginModeValues),
  expiresInHours: z.number().int().min(1).max(168).default(24)
}).superRefine((value, ctx) => {
  if (value.fontSizeMode === "custom" && !value.customFontSizePx) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Custom font size is required",
      path: ["customFontSizePx"]
    });
  }
});

export const printTasksSourceSchema = z.object({
  tagFilter: z.string().trim().min(1).max(120),
  showCompletedTasks: z.boolean(),
  viewMode: z.enum(taskViewModeValues)
});

export const printMemoSourceSchema = z.object({
  memoId: z.string().trim().min(1).max(191)
});

export const createPrintShareRequestSchema = z.discriminatedUnion("sourceType", [
  z.object({
    sourceType: z.literal("tasks"),
    source: printTasksSourceSchema,
    config: printShareConfigSchema
  }),
  z.object({
    sourceType: z.literal("memo"),
    source: printMemoSourceSchema,
    config: printShareConfigSchema
  })
]);
```

Add `printButtonEnabled: z.boolean().optional()` to `updateThemePreferenceRequestSchema`, and add it to the `.refine()` predicate:

```ts
    value.printButtonEnabled !== undefined ||
```

Add inferred types near the other exported request types:

```ts
export type CreatePrintShareRequest = z.infer<typeof createPrintShareRequestSchema>;
export type PrintShareConfig = z.infer<typeof printShareConfigSchema>;
export type PrintTasksSource = z.infer<typeof printTasksSourceSchema>;
export type PrintMemoSource = z.infer<typeof printMemoSourceSchema>;
export type PrintTemplateId = (typeof printTemplateIdValues)[number];
```

Add `printButtonEnabled` to `ApiThemePreference`:

```ts
  printButtonEnabled: boolean;
```

Add response interfaces near `ApiThemePreference`:

```ts
export interface ApiPrintShare {
  id: string;
  url: string;
  expiresAt: string;
}

export interface ApiPrintShareResponse {
  printShare: ApiPrintShare;
}
```

- [ ] **Step 4: Run shared tests and build**

Run:

```bash
npm run test -w @todo/shared -- packages/shared/src/index.test.ts
npm run build -w @todo/shared
```

Expected: PASS.

- [ ] **Step 5: Commit shared contracts**

```bash
git add packages/shared/src/index.ts packages/shared/src/index.test.ts
git commit -m "feat: add print share contracts"
```

## Task 2: Database and Preference Persistence

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/000022_print_shares/migration.sql`
- Modify: `apps/api/src/db.ts`
- Modify: `apps/api/src/routes/preferences.ts`
- Modify: `apps/api/src/routes/preferences.test.ts`

- [ ] **Step 1: Write failing preference route tests**

In `apps/api/src/routes/preferences.test.ts`, add `printButtonEnabled: 0` to `currentPreference`.

In the default preference test, assert:

```ts
      printButtonEnabled: false
```

In each expected `db.execute` argument list for preference saves, insert `false` before `"system"` until implementation updates the SQL shape.

Add a dedicated test near the other preference save tests:

```ts
  it("saves print button visibility preference", async () => {
    db.queryOne.mockResolvedValue(currentPreference);

    const response = await injectPreference("PUT", { printButtonEnabled: true });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      printButtonEnabled: true
    });
    expect(db.execute).toHaveBeenLastCalledWith(expect.stringContaining("printButtonEnabled"), [
      "user-1",
      "peach",
      "app-teal",
      true,
      "sea",
      true,
      "list",
      "full",
      "warm-paper",
      "list",
      "hide",
      "default",
      "tasks,memos,anniversaries,habits,calendar,pomodoro",
      false,
      true,
      "system"
    ]);
  });
```

- [ ] **Step 2: Run preference tests and verify failure**

Run:

```bash
npm run test -w @todo/api -- apps/api/src/routes/preferences.test.ts
```

Expected: FAIL because the API does not return or persist `printButtonEnabled`.

- [ ] **Step 3: Add Prisma model and migration**

In `apps/api/prisma/schema.prisma`, add `printShares PrintShare[]` to `model User`, add `printButtonEnabled Boolean @default(false)` to `model UserThemePreference`, and add:

```prisma
model PrintShare {
  id             String   @id @default(cuid())
  userId         String
  tokenHash      String   @unique
  sourceType     String
  sourceJson     Json
  configJson     Json
  expiresAt      DateTime
  revokedAt      DateTime?
  lastAccessedAt DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  user           User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, expiresAt])
  @@index([expiresAt])
}
```

Create `apps/api/prisma/migrations/000022_print_shares/migration.sql`:

```sql
ALTER TABLE `UserThemePreference`
  ADD COLUMN `printButtonEnabled` BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE `PrintShare` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `tokenHash` VARCHAR(191) NOT NULL,
  `sourceType` VARCHAR(32) NOT NULL,
  `sourceJson` JSON NOT NULL,
  `configJson` JSON NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `revokedAt` DATETIME(3) NULL,
  `lastAccessedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `PrintShare_tokenHash_key` (`tokenHash`),
  INDEX `PrintShare_userId_expiresAt_idx` (`userId`, `expiresAt`),
  INDEX `PrintShare_expiresAt_idx` (`expiresAt`),
  CONSTRAINT `PrintShare_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

- [ ] **Step 4: Add incremental schema repair**

In `apps/api/src/db.ts`, add a helper before `ensureIncrementalSchema()`:

```ts
async function ensurePrintShareSchema() {
  await execute(
    `CREATE TABLE IF NOT EXISTS \`PrintShare\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`userId\` VARCHAR(191) NOT NULL,
      \`tokenHash\` VARCHAR(191) NOT NULL,
      \`sourceType\` VARCHAR(32) NOT NULL,
      \`sourceJson\` JSON NOT NULL,
      \`configJson\` JSON NOT NULL,
      \`expiresAt\` DATETIME(3) NOT NULL,
      \`revokedAt\` DATETIME(3) NULL,
      \`lastAccessedAt\` DATETIME(3) NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL,
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`PrintShare_tokenHash_key\` (\`tokenHash\`),
      INDEX \`PrintShare_userId_expiresAt_idx\` (\`userId\`, \`expiresAt\`),
      INDEX \`PrintShare_expiresAt_idx\` (\`expiresAt\`),
      CONSTRAINT \`PrintShare_userId_fkey\` FOREIGN KEY (\`userId\`) REFERENCES \`User\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
}
```

Then inside `ensureIncrementalSchema()` add:

```ts
  await ensureColumn("UserThemePreference", "printButtonEnabled", "ALTER TABLE `UserThemePreference` ADD COLUMN `printButtonEnabled` BOOLEAN NOT NULL DEFAULT FALSE");
  await ensurePrintShareSchema();
```

- [ ] **Step 5: Persist print preference**

In `apps/api/src/routes/preferences.ts`:

Add `printButtonEnabled` to `ThemePreferenceRow`.

Add:

```ts
const defaultPrintButtonEnabled = false;
```

Update `ensureThemePreference()`, both SELECTs, the PUT value calculation, INSERT column list, VALUES list, update list, parameters, and returned object to include `printButtonEnabled`.

The returned GET object must include:

```ts
      printButtonEnabled: booleanFromDb(preference?.printButtonEnabled, defaultPrintButtonEnabled),
```

The PUT calculation must include:

```ts
    const printButtonEnabled = body.printButtonEnabled ?? booleanFromDb(current?.printButtonEnabled, defaultPrintButtonEnabled);
```

- [ ] **Step 6: Run tests and Prisma generate**

Run:

```bash
npm run test -w @todo/api -- apps/api/src/routes/preferences.test.ts
npm run prisma:generate -w @todo/api
```

Expected: PASS.

- [ ] **Step 7: Commit persistence changes**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/000022_print_shares/migration.sql apps/api/src/db.ts apps/api/src/routes/preferences.ts apps/api/src/routes/preferences.test.ts
git commit -m "feat: persist print share preferences"
```

## Task 3: Print Share API and Public HTML Route

**Files:**
- Create: `apps/api/src/routes/print-shares.ts`
- Create: `apps/api/src/routes/print-shares.test.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Write failing API route tests**

Create `apps/api/src/routes/print-shares.test.ts` with this structure:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InjectOptions, Response } from "light-my-request";
import { buildApp } from "../app.js";
import { signAccessToken } from "../services/tokens.js";

const db = vi.hoisted(() => ({
  execute: vi.fn(),
  queryOne: vi.fn(),
  queryRows: vi.fn()
}));

vi.mock("../db.js", () => ({
  asDate: (value: unknown) => value instanceof Date ? value : value ? new Date(String(value)) : null,
  execute: db.execute,
  id: vi.fn(() => "print-share-1"),
  queryOne: db.queryOne,
  queryRows: db.queryRows,
  toMysqlDate: (date: Date | null | undefined) => date ? date.toISOString().slice(0, 19).replace("T", " ") : null,
  transaction: (callback: (connection: { execute: typeof db.execute }) => Promise<unknown>) => callback({ execute: db.execute })
}));

vi.mock("node:crypto", async () => {
  const actual = await vi.importActual<typeof import("node:crypto")>("node:crypto");
  return {
    ...actual,
    randomBytes: vi.fn(() => Buffer.from("0123456789abcdef0123456789abcdef"))
  };
});

const token = signAccessToken({ sub: "user-1", email: "todo@example.com" });

const validShare = {
  id: "share-1",
  userId: "user-1",
  tokenHash: "hash",
  sourceType: "tasks",
  sourceJson: JSON.stringify({ tagFilter: "__all__", showCompletedTasks: false, viewMode: "list" }),
  configJson: JSON.stringify({ templateId: "checklist", paperWidthMode: "preset", paperWidthMm: 58, fontSizeMode: "normal", marginMode: "normal", expiresInHours: 24 }),
  expiresAt: new Date("2099-01-01T00:00:00.000Z"),
  revokedAt: null
};

async function inject(method: InjectOptions["method"], url: string, payload?: InjectOptions["payload"], authed = true): Promise<Response> {
  const app = await buildApp();
  const response = await app.inject({
    method,
    url,
    headers: authed ? { authorization: `Bearer ${token}` } : undefined,
    payload
  } satisfies InjectOptions);
  await app.close();
  return response;
}

describe("print share routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.API_PUBLIC_URL = "http://localhost:4020";
    db.execute.mockResolvedValue({ affectedRows: 1 });
    db.queryRows.mockResolvedValue([]);
  });

  it("creates a task print link and clears only the current user's expired links first", async () => {
    db.queryOne.mockResolvedValue(null);

    const response = await inject("POST", "/print-shares", {
      sourceType: "tasks",
      source: { tagFilter: "__all__", showCompletedTasks: false, viewMode: "list" },
      config: { templateId: "checklist", paperWidthMode: "preset", paperWidthMm: 58, fontSizeMode: "normal", marginMode: "normal", expiresInHours: 24 }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().printShare).toMatchObject({
      id: "print-share-1",
      url: expect.stringMatching(/^http:\/\/localhost:4020\/print\//)
    });
    expect(db.execute).toHaveBeenNthCalledWith(1, expect.stringContaining("DELETE FROM `PrintShare`"), ["user-1"]);
    expect(db.execute).toHaveBeenNthCalledWith(2, expect.stringContaining("INSERT INTO `PrintShare`"), expect.arrayContaining(["print-share-1", "user-1", "tasks"]));
  });

  it("rejects memo print links for memos outside the user account", async () => {
    db.queryOne.mockResolvedValue(null);

    const response = await inject("POST", "/print-shares", {
      sourceType: "memo",
      source: { memoId: "missing-memo" },
      config: { templateId: "memo", paperWidthMode: "preset", paperWidthMm: 58, fontSizeMode: "normal", marginMode: "normal", expiresInHours: 24 }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: "Memo not found" });
  });

  it("serves public printable HTML for a valid token without authentication", async () => {
    db.queryOne.mockResolvedValueOnce(validShare);
    db.queryRows.mockResolvedValueOnce([
      {
        id: "task-1",
        title: "准备周报",
        notes: "整理风险",
        dueAt: null,
        priority: "IMPORTANT_NOT_URGENT",
        status: "TODO",
        sortOrder: null,
        completedAt: null,
        createdAt: new Date("2026-06-01T00:00:00.000Z"),
        updatedAt: new Date("2026-06-01T00:00:00.000Z")
      }
    ]).mockResolvedValueOnce([{ id: "tag-1", taskId: "task-1", name: "工作" }]);

    const response = await inject("GET", "/print/public-token", undefined, false);

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.body).toContain("准备周报");
    expect(response.body).toContain("@media print");
    expect(response.body).not.toContain("todo@example.com");
  });

  it("returns a generic print error page for expired or revoked tokens", async () => {
    db.queryOne.mockResolvedValue({ ...validShare, expiresAt: new Date("2000-01-01T00:00:00.000Z") });

    const response = await inject("GET", "/print/expired-token", undefined, false);

    expect(response.statusCode).toBe(410);
    expect(response.body).toContain("链接不可用");
    expect(response.body).not.toContain("user-1");
  });

  it("revokes only the authenticated user's own print share", async () => {
    const response = await inject("DELETE", "/print-shares/share-1");

    expect(response.statusCode).toBe(200);
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining("UPDATE `PrintShare` SET `revokedAt` = NOW(3)"), ["share-1", "user-1"]);
  });
});
```

- [ ] **Step 2: Run API tests and verify failure**

Run:

```bash
npm run test -w @todo/api -- apps/api/src/routes/print-shares.test.ts
```

Expected: FAIL because `/print-shares` and `/print/:token` are not registered.

- [ ] **Step 3: Implement route helpers**

Create `apps/api/src/routes/print-shares.ts` with these top-level helpers:

```ts
import crypto from "node:crypto";
import type { FastifyInstance, FastifyReply } from "fastify";
import sanitizeHtml from "sanitize-html";
import {
  createPrintShareRequestSchema,
  printShareConfigSchema,
  printMemoSourceSchema,
  printTasksSourceSchema,
  sortTasksForDisplay,
  type ApiTask,
  type PrintShareConfig,
  type PrintTasksSource
} from "@todo/shared";
import { asDate, execute, id, queryOne, queryRows, type DbRow } from "../db.js";
import { config } from "../config.js";
import { normalizeTaskPriority } from "../services/task-priority.js";

type PrintShareRow = DbRow & {
  id: string;
  userId: string;
  tokenHash: string;
  sourceType: string;
  sourceJson: string | object;
  configJson: string | object;
  expiresAt: Date | string;
  revokedAt: Date | string | null;
};

type PrintTaskRow = DbRow & {
  id: string;
  title: string;
  notes: string | null;
  dueAt: Date | string | null;
  priority: string;
  status: ApiTask["status"];
  sortOrder: number | string | null;
  completedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type PrintMemoRow = DbRow & {
  id: string;
  title: string;
  contentHtml: string;
  updatedAt: Date | string;
};

function generatePrintToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function hashPrintToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function parseJson<T>(value: string | object, schema: { parse(input: unknown): T }) {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  return schema.parse(parsed);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
```

- [ ] **Step 4: Implement rendering and data loaders**

Add these functions in the same file:

```ts
function renderPrintErrorPage() {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>链接不可用</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:24px;color:#222}.box{max-width:360px;margin:auto;padding:20px;border:1px solid #ddd;border-radius:8px}</style></head><body><main class="box"><h1>链接不可用</h1><p>这个打印链接不存在、已过期或已被撤销。</p></main></body></html>`;
}

function renderPrintDocument(title: string, bodyHtml: string, printConfig: PrintShareConfig) {
  const fontSize = printConfig.fontSizeMode === "small" ? 12 : printConfig.fontSizeMode === "large" ? 16 : printConfig.customFontSizePx ?? 14;
  const margin = printConfig.marginMode === "narrow" ? 3 : printConfig.marginMode === "wide" ? 8 : 5;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>
body{margin:0;background:#fff;color:#111;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.print-page{box-sizing:border-box;width:${printConfig.paperWidthMm}mm;max-width:100%;padding:${margin}mm;font-size:${fontSize}px;line-height:1.45}
h1{font-size:1.25em;margin:0 0 .65em}
.print-meta{font-size:.82em;color:#555;margin-bottom:.7em}
.task-row{break-inside:avoid;display:block;padding:.35em 0;border-bottom:1px dashed #bbb}
.task-title{font-weight:700}.task-meta{font-size:.85em;color:#555;margin-top:.2em}.memo-content img{max-width:100%;height:auto}.memo-content table{width:100%;border-collapse:collapse}.memo-content td,.memo-content th{border:1px solid #999;padding:2px}
@media print{body{background:#fff}.print-page{width:${printConfig.paperWidthMm}mm}.screen-only{display:none!important}}
</style></head><body><main class="print-page">${bodyHtml}</main></body></html>`;
}

function sanitizePrintMemoHtml(html: string) {
  return sanitizeHtml(html, {
    allowedTags: ["b", "br", "code", "div", "em", "h1", "h2", "h3", "h4", "hr", "i", "li", "ol", "p", "pre", "s", "span", "strong", "table", "tbody", "td", "th", "thead", "tr", "u", "ul"],
    allowedAttributes: { td: ["colspan", "rowspan"], th: ["colspan", "rowspan"] }
  });
}

async function loadPrintTasks(userId: string, source: PrintTasksSource) {
  const rows = await queryRows<PrintTaskRow>(
    "SELECT * FROM `Task` WHERE `userId` = ? AND `status` <> 'ARCHIVED' ORDER BY CASE WHEN `status` = 'COMPLETED' THEN 1 ELSE 0 END ASC, CASE WHEN `sortOrder` IS NULL THEN 1 ELSE 0 END ASC, `sortOrder` ASC, `createdAt` ASC, `id` ASC",
    [userId]
  );
  const tagRows = await queryRows<DbRow & { taskId: string; id: string; name: string }>(
    "SELECT tt.`taskId`, t.`id`, t.`name` FROM `TaskTag` tt INNER JOIN `Tag` t ON t.`id` = tt.`tagId` WHERE t.`userId` = ? ORDER BY t.`name`",
    [userId]
  );
  const tagsByTaskId = new Map<string, Array<{ id: string; name: string }>>();
  for (const tag of tagRows) {
    tagsByTaskId.set(tag.taskId, [...(tagsByTaskId.get(tag.taskId) ?? []), { id: tag.id, name: tag.name }]);
  }
  const tasks = rows.map<ApiTask>((row) => ({
    id: row.id,
    title: row.title,
    notes: row.notes,
    dueAt: asDate(row.dueAt)?.toISOString() ?? null,
    priority: normalizeTaskPriority(row.priority),
    status: row.status,
    sortOrder: row.sortOrder === null || row.sortOrder === undefined ? null : Number(row.sortOrder),
    createdAt: asDate(row.createdAt)?.toISOString() ?? new Date().toISOString(),
    updatedAt: asDate(row.updatedAt)?.toISOString() ?? new Date().toISOString(),
    completedAt: asDate(row.completedAt)?.toISOString() ?? null,
    recurrenceRule: null,
    tags: tagsByTaskId.get(row.id) ?? [],
    pomodoroCompletedCount: 0,
    pomodoroCompletedMinutes: 0
  }));
  const visible = source.showCompletedTasks ? tasks : tasks.filter((task) => task.status !== "COMPLETED");
  const filtered = source.tagFilter === "__all__"
    ? visible
    : source.tagFilter === "__untagged__"
      ? visible.filter((task) => task.tags.length === 0)
      : visible.filter((task) => task.tags.some((tag) => tag.id === source.tagFilter));
  return sortTasksForDisplay(filtered);
}
```

- [ ] **Step 5: Implement Fastify routes**

Add `printShareRoutes`:

```ts
export async function printShareRoutes(app: FastifyInstance) {
  app.post("/print-shares", { preHandler: app.authenticate }, async (request, reply) => {
    const body = createPrintShareRequestSchema.parse(request.body);
    await execute("DELETE FROM `PrintShare` WHERE `userId` = ? AND `expiresAt` < NOW(3)", [request.user.id]);

    if (body.sourceType === "memo") {
      const memo = await queryOne<DbRow & { id: string }>("SELECT `id` FROM `Memo` WHERE `id` = ? AND `userId` = ?", [body.source.memoId, request.user.id]);
      if (!memo) {
        return reply.code(404).send({ error: "Memo not found" });
      }
    }

    const token = generatePrintToken();
    const tokenHash = hashPrintToken(token);
    const printShareId = id();
    const expiresAt = new Date(Date.now() + body.config.expiresInHours * 60 * 60 * 1000);
    await execute(
      `INSERT INTO \`PrintShare\` (\`id\`, \`userId\`, \`tokenHash\`, \`sourceType\`, \`sourceJson\`, \`configJson\`, \`expiresAt\`, \`updatedAt\`)
       VALUES (?, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), ?, NOW(3))`,
      [printShareId, request.user.id, tokenHash, body.sourceType, JSON.stringify(body.source), JSON.stringify(body.config), expiresAt]
    );

    return reply.code(201).send({
      printShare: {
        id: printShareId,
        url: new URL(`/print/${encodeURIComponent(token)}`, config.API_PUBLIC_URL).toString(),
        expiresAt: expiresAt.toISOString()
      }
    });
  });

  app.delete("/print-shares/:id", { preHandler: app.authenticate }, async (request) => {
    const printShareId = (request.params as { id: string }).id;
    await execute("UPDATE `PrintShare` SET `revokedAt` = NOW(3), `updatedAt` = NOW(3) WHERE `id` = ? AND `userId` = ?", [printShareId, request.user.id]);
    return { ok: true };
  });

  app.get("/print/:token", async (request, reply: FastifyReply) => {
    const token = (request.params as { token: string }).token;
    const share = await queryOne<PrintShareRow>("SELECT * FROM `PrintShare` WHERE `tokenHash` = ?", [hashPrintToken(token)]);
    const expiresAt = asDate(share?.expiresAt);
    if (!share || !expiresAt || expiresAt.getTime() < Date.now() || share.revokedAt) {
      return reply.code(410).type("text/html; charset=utf-8").send(renderPrintErrorPage());
    }

    const printConfig = parseJson(share.configJson, printShareConfigSchema);
    let html = "";
    if (share.sourceType === "tasks") {
      const source = parseJson(share.sourceJson, printTasksSourceSchema);
      const tasks = await loadPrintTasks(share.userId, source);
      html = `<h1>待办事项</h1><div class="print-meta">${tasks.length} 项</div>${tasks.map((task) => `<article class="task-row"><span aria-hidden="true">${task.status === "COMPLETED" ? "☑" : "☐"}</span> <span class="task-title">${escapeHtml(task.title)}</span><div class="task-meta">${task.tags.map((tag) => `#${escapeHtml(tag.name)}`).join(" ")}</div></article>`).join("")}`;
    } else {
      const source = parseJson(share.sourceJson, printMemoSourceSchema);
      const memo = await queryOne<PrintMemoRow>("SELECT `id`, `title`, `contentHtml`, `updatedAt` FROM `Memo` WHERE `id` = ? AND `userId` = ?", [source.memoId, share.userId]);
      if (!memo) {
        return reply.code(410).type("text/html; charset=utf-8").send(renderPrintErrorPage());
      }
      html = `<h1>${escapeHtml(memo.title)}</h1><section class="memo-content">${sanitizePrintMemoHtml(memo.contentHtml)}</section>`;
    }
    await execute("UPDATE `PrintShare` SET `lastAccessedAt` = NOW(3) WHERE `id` = ?", [share.id]);
    return reply.type("text/html; charset=utf-8").send(renderPrintDocument(share.sourceType === "memo" ? "备忘录打印" : "待办打印", html, printConfig));
  });
}
```

- [ ] **Step 6: Register route**

In `apps/api/src/app.ts`, import and register:

```ts
import { printShareRoutes } from "./routes/print-shares.js";
```

Register after auth routes and before preference routes:

```ts
  await app.register(printShareRoutes);
```

- [ ] **Step 7: Run API tests**

Run:

```bash
npm run test -w @todo/api -- apps/api/src/routes/print-shares.test.ts
npm run typecheck -w @todo/api
```

Expected: PASS.

- [ ] **Step 8: Commit API routes**

```bash
git add apps/api/src/routes/print-shares.ts apps/api/src/routes/print-shares.test.ts apps/api/src/app.ts
git commit -m "feat: add print share api"
```

## Task 4: Desktop API Client and Shared Dialog

**Files:**
- Modify: `apps/desktop/src/api/client.ts`
- Create: `apps/desktop/src/components/PrintShareDialog.tsx`
- Create: `apps/desktop/src/components/PrintShareDialog.test.tsx`
- Modify: `apps/desktop/src/styles.css`

- [ ] **Step 1: Write failing dialog tests**

Create `apps/desktop/src/components/PrintShareDialog.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PrintShareDialog } from "./PrintShareDialog";
import { api } from "../api/client";

vi.mock("animal-island-ui", () => ({
  Button: ({ children, disabled, htmlType, loading, onClick, type }: any) => <button disabled={disabled} type={htmlType ?? "button"} data-loading={loading ? "true" : undefined} data-type={type} onClick={onClick}>{children}</button>,
  Input: ({ onChange, value, ...props }: any) => <input {...props} value={value} onChange={onChange} />,
  Modal: ({ children, onClose, open, title }: any) => open ? <div role="dialog" aria-label={title}><button type="button" aria-label="关闭" onClick={onClose}>关闭</button>{children}</div> : null,
  Radio: ({ onChange, options, value }: any) => <div>{options.map((option: any) => <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => onChange(option.value)}>{option.label}</button>)}</div>,
  Select: ({ onChange, options, value }: any) => <select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option: any) => <option key={option.value ?? option.key} value={option.value ?? option.key}>{option.label}</option>)}</select>
}));

vi.mock("../api/client", () => ({
  api: {
    createPrintShare: vi.fn()
  }
}));

describe("PrintShareDialog", () => {
  it("creates a print share and displays the generated link", async () => {
    vi.mocked(api.createPrintShare).mockResolvedValue({
      printShare: {
        id: "share-1",
        url: "http://localhost:4020/print/token",
        expiresAt: "2026-06-28T00:00:00.000Z"
      }
    });

    render(
      <PrintShareDialog
        open
        sourceType="tasks"
        source={{ tagFilter: "__all__", showCompletedTasks: false, viewMode: "list" }}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "生成链接" }));

    await waitFor(() => expect(api.createPrintShare).toHaveBeenCalledWith(expect.objectContaining({
      sourceType: "tasks",
      source: { tagFilter: "__all__", showCompletedTasks: false, viewMode: "list" },
      config: expect.objectContaining({
        templateId: "checklist",
        paperWidthMm: 58,
        expiresInHours: 24
      })
    })));
    expect(await screen.findByDisplayValue("http://localhost:4020/print/token")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "复制链接" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run dialog test and verify failure**

Run:

```bash
npm run test -w @todo/desktop -- apps/desktop/src/components/PrintShareDialog.test.tsx
```

Expected: FAIL because the component and client method do not exist.

- [ ] **Step 3: Add API client methods**

In `apps/desktop/src/api/client.ts`, import shared types:

```ts
  createPrintShareRequestSchema,
  type ApiPrintShareResponse,
  type CreatePrintShareRequest,
```

Add methods before `getThemePreference()`:

```ts
  async createPrintShare(input: CreatePrintShareRequest) {
    return request<ApiPrintShareResponse>("/print-shares", {
      method: "POST",
      body: JSON.stringify(createPrintShareRequestSchema.parse(input))
    });
  },
  async revokePrintShare(id: string) {
    return request<{ ok: true }>(`/print-shares/${encodeURIComponent(id)}`, {
      method: "DELETE"
    });
  },
```

- [ ] **Step 4: Implement shared dialog**

Create `apps/desktop/src/components/PrintShareDialog.tsx`:

```tsx
import { useMemo, useState } from "react";
import { Button, Input, Modal, Select } from "animal-island-ui";
import type { CreatePrintShareRequest, PrintMemoSource, PrintTasksSource } from "@todo/shared";
import { api } from "../api/client";

type PrintShareDialogProps =
  | { open: boolean; sourceType: "tasks"; source: PrintTasksSource; onClose(): void }
  | { open: boolean; sourceType: "memo"; source: PrintMemoSource; onClose(): void };

const templateOptions = [
  { value: "checklist", label: "清单模板" },
  { value: "memo", label: "便签模板" },
  { value: "compact", label: "省纸模板" },
  { value: "decorated", label: "装饰模板" }
];

const paperOptions = [
  { value: "57", label: "57mm" },
  { value: "58", label: "58mm" },
  { value: "76", label: "76mm" },
  { value: "80", label: "80mm" },
  { value: "custom", label: "自定义" }
];

export function PrintShareDialog(props: PrintShareDialogProps) {
  const [templateId, setTemplateId] = useState<"checklist" | "memo" | "compact" | "decorated">(props.sourceType === "memo" ? "memo" : "checklist");
  const [paperWidthChoice, setPaperWidthChoice] = useState("58");
  const [customPaperWidth, setCustomPaperWidth] = useState("58");
  const [fontSizeMode, setFontSizeMode] = useState<"small" | "normal" | "large" | "custom">("normal");
  const [customFontSize, setCustomFontSize] = useState("14");
  const [marginMode, setMarginMode] = useState<"narrow" | "normal" | "wide">("normal");
  const [expiresInHours, setExpiresInHours] = useState(24);
  const [generatedUrl, setGeneratedUrl] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const paperWidthMm = useMemo(() => Number(paperWidthChoice === "custom" ? customPaperWidth : paperWidthChoice), [customPaperWidth, paperWidthChoice]);

  async function createLink() {
    setBusy(true);
    setMessage("");
    try {
      const config = {
        templateId,
        paperWidthMode: paperWidthChoice === "custom" ? "custom" as const : "preset" as const,
        paperWidthMm,
        fontSizeMode,
        customFontSizePx: fontSizeMode === "custom" ? Number(customFontSize) : null,
        marginMode,
        expiresInHours
      };
      const input: CreatePrintShareRequest = props.sourceType === "tasks"
        ? { sourceType: "tasks", source: props.source, config }
        : { sourceType: "memo", source: props.source, config };
      const response = await api.createPrintShare(input);
      setGeneratedUrl(response.printShare.url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "生成打印链接失败");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    await navigator.clipboard?.writeText(generatedUrl);
  }

  return (
    <Modal open={props.open} title="便签打印" onClose={props.onClose}>
      <div className="print-share-dialog">
        <section className="print-share-config">
          <label>模板<Select value={templateId} options={templateOptions} onChange={setTemplateId} /></label>
          <label>纸张<Select value={paperWidthChoice} options={paperOptions} onChange={setPaperWidthChoice} /></label>
          {paperWidthChoice === "custom" ? <Input aria-label="自定义纸张宽度" value={customPaperWidth} onChange={(event: any) => setCustomPaperWidth(event.target.value)} /> : null}
          <label>字号<Select value={fontSizeMode} options={[{ value: "small", label: "小" }, { value: "normal", label: "标准" }, { value: "large", label: "大" }, { value: "custom", label: "自定义" }]} onChange={setFontSizeMode} /></label>
          {fontSizeMode === "custom" ? <Input aria-label="自定义字号" value={customFontSize} onChange={(event: any) => setCustomFontSize(event.target.value)} /> : null}
          <label>边距<Select value={marginMode} options={[{ value: "narrow", label: "窄" }, { value: "normal", label: "标准" }, { value: "wide", label: "宽" }]} onChange={setMarginMode} /></label>
          <label>有效期<Select value={String(expiresInHours)} options={[{ value: "1", label: "1 小时" }, { value: "24", label: "24 小时" }, { value: "168", label: "7 天" }]} onChange={(value: string) => setExpiresInHours(Number(value))} /></label>
          <Button loading={busy} type="primary" onClick={() => void createLink()}>生成链接</Button>
        </section>
        <section className="print-share-result">
          <Input aria-label="打印链接" readOnly value={generatedUrl} placeholder="生成后显示链接" />
          <Button disabled={!generatedUrl} onClick={() => void copyLink()}>复制链接</Button>
          {message ? <div className="inline-alert">{message}</div> : null}
        </section>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 5: Add minimal styles**

In `apps/desktop/src/styles.css`, add:

```css
.print-share-dialog {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(220px, 0.9fr);
  gap: 16px;
}

.print-share-config,
.print-share-result {
  display: grid;
  gap: 12px;
  align-content: start;
}

.print-share-config label {
  display: grid;
  gap: 6px;
  font-size: 13px;
}
```

- [ ] **Step 6: Run desktop component test**

Run:

```bash
npm run test -w @todo/desktop -- apps/desktop/src/components/PrintShareDialog.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit dialog/client**

```bash
git add apps/desktop/src/api/client.ts apps/desktop/src/components/PrintShareDialog.tsx apps/desktop/src/components/PrintShareDialog.test.tsx apps/desktop/src/styles.css
git commit -m "feat: add print share dialog"
```

## Task 5: Profile Preference and Task Print Entry

**Files:**
- Modify: `apps/desktop/src/App.tsx`
- Modify: `apps/desktop/src/App.test.tsx`
- Modify: `apps/desktop/src/components/FloatingCard.tsx`
- Modify: `apps/desktop/src/components/MemoFloatingCard.tsx`
- Modify: `apps/desktop/src/components/ProfileCenter.tsx`
- Modify: `apps/desktop/src/components/ProfileCenter.test.tsx`

- [ ] **Step 1: Write failing desktop preference tests**

In `apps/desktop/src/components/ProfileCenter.test.tsx`, add `printButtonEnabled={false}` and `onPrintButtonEnabledChanged={vi.fn()}` to `renderProfile()`.

Add:

```tsx
  it("shows print button visibility settings", () => {
    const onPrintButtonEnabledChanged = vi.fn();
    renderProfile(createUpdater("idle"), { onPrintButtonEnabledChanged });

    expect(screen.getByText("便签打印")).toBeInTheDocument();
    fireEvent.click(screen.getByText(/显示打印按钮/));
    expect(onPrintButtonEnabledChanged).toHaveBeenCalledWith(true);
  });
```

Update imports to include `fireEvent`.

In `apps/desktop/src/App.test.tsx`, add `printButtonEnabled: false` to `mockThemePreference`, add `createPrintShare: vi.fn()` to the API mock, and add tests:

```tsx
  it("hides task print entry by default", async () => {
    render(<MemoryRouter initialEntries={["/tasks"]}><App /></MemoryRouter>);
    await waitFor(() => expect(localStorage.getItem("tododesk.theme")).toBe(mockThemePreference.themeId));
    expect(screen.queryByRole("button", { name: "便签打印" })).not.toBeInTheDocument();
  });

  it("shows task print entry when enabled", async () => {
    vi.mocked(api.getThemePreference).mockResolvedValue({ ...mockThemePreference, printButtonEnabled: true });
    render(<MemoryRouter initialEntries={["/tasks"]}><App /></MemoryRouter>);
    expect(await screen.findByRole("button", { name: "便签打印" })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npm run test -w @todo/desktop -- apps/desktop/src/components/ProfileCenter.test.tsx apps/desktop/src/App.test.tsx
```

Expected: FAIL because props and task entry do not exist.

- [ ] **Step 3: Add ProfileCenter props and UI**

In `ProfileCenterProps`, add:

```ts
  printButtonEnabled: boolean;
  onPrintButtonEnabledChanged(enabled: boolean): void;
```

Destructure both props in `ProfileCenter`.

Inside the system configuration card, add:

```tsx
          <div className="system-config-row">
            <span>便签打印</span>
            <Radio
              options={[
                { label: "隐藏打印按钮", value: "off" },
                { label: "显示打印按钮", value: "on" }
              ]}
              value={printButtonEnabled ? "on" : "off"}
              onChange={(value) => onPrintButtonEnabledChanged(value === "on")}
            />
          </div>
```

- [ ] **Step 4: Add App state and task topbar print button**

In `apps/desktop/src/App.tsx`, import `Printer` and `PrintShareDialog`.

Add state:

```ts
  const [printButtonEnabled, setPrintButtonEnabled] = useState(false);
  const [taskPrintDialogOpen, setTaskPrintDialogOpen] = useState(false);
```

Add `printButtonEnabled: false` to every local `defaultThemePreference` object in these files:

```ts
// apps/desktop/src/App.tsx
// apps/desktop/src/components/FloatingCard.tsx
// apps/desktop/src/components/MemoFloatingCard.tsx
  printButtonEnabled: false
```

In `applyThemePreference()`:

```ts
    setPrintButtonEnabled(preference.printButtonEnabled);
```

Add handler:

```ts
  function handlePrintButtonEnabledChanged(next: boolean) {
    const previous = printButtonEnabled;
    setPrintButtonEnabled(next);
    void api.setThemePreference({ printButtonEnabled: next })
      .then(publishThemePreference)
      .catch((error) => {
        setPrintButtonEnabled(previous);
        setMessage(error instanceof Error ? error.message : "便签打印配置保存失败");
      });
  }
```

In task topbar actions before the 新增 button:

```tsx
                {printButtonEnabled ? (
                  <Button aria-label="便签打印" className="ghost-button" icon={<Printer size={14} />} size="small" type="default" onClick={() => setTaskPrintDialogOpen(true)}>
                    打印
                  </Button>
                ) : null}
```

Render the task dialog near the route block:

```tsx
        {printButtonEnabled ? (
          <PrintShareDialog
            open={taskPrintDialogOpen}
            sourceType="tasks"
            source={{
              tagFilter: taskTagFilter,
              showCompletedTasks,
              viewMode: effectiveTaskViewMode
            }}
            onClose={() => setTaskPrintDialogOpen(false)}
          />
        ) : null}
```

Pass `printButtonEnabled` and `onPrintButtonEnabledChanged` into `ProfileCenter`.

- [ ] **Step 5: Run tests**

Run:

```bash
npm run test -w @todo/desktop -- apps/desktop/src/components/ProfileCenter.test.tsx apps/desktop/src/App.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit profile/task entry**

```bash
git add apps/desktop/src/App.tsx apps/desktop/src/App.test.tsx apps/desktop/src/components/FloatingCard.tsx apps/desktop/src/components/MemoFloatingCard.tsx apps/desktop/src/components/ProfileCenter.tsx apps/desktop/src/components/ProfileCenter.test.tsx
git commit -m "feat: add print preference and task entry"
```

## Task 6: Memo Print Entry and Save-Before-Print

**Files:**
- Modify: `apps/desktop/src/App.tsx`
- Modify: `apps/desktop/src/components/MemoPanel.tsx`
- Modify: `apps/desktop/src/components/MemoPanel.test.tsx`

- [ ] **Step 1: Write failing MemoPanel tests**

In `apps/desktop/src/components/MemoPanel.test.tsx`, add `createPrintShare: vi.fn()` to `apiMock` only if the dialog is not mocked. Prefer mocking the dialog:

```ts
vi.mock("./PrintShareDialog", () => ({
  PrintShareDialog: ({ open, source }: any) => open ? <div role="dialog" aria-label="便签打印">memo:{source.memoId}</div> : null
}));
```

Update the existing topbar test to render `<MemoPanel printButtonEnabled />` and expect three buttons:

```ts
    await waitFor(() => expect(topbar.querySelectorAll("button")).toHaveLength(3));
    expect(topbarButtons.map((button) => button.textContent || button.getAttribute("aria-label"))).toEqual(["当前", "便签打印", "新建"]);
```

Add:

```tsx
  it("saves the selected memo before opening print dialog", async () => {
    apiMock.updateMemo.mockImplementation(async (_id: string, input: any) => ({
      memo: { ...memoDetail, ...input, excerpt: "更新摘要", updatedAt: "2026-06-17T08:01:00.000Z" }
    }));

    render(<MemoPanel printButtonEnabled />);

    const editor = await screen.findByRole("textbox", { name: "备忘录正文" });
    await waitFor(() => expect(apiMock.memo).toHaveBeenCalledWith("memo-1"));

    editor.innerHTML = "<p>打印前保存</p>";
    fireEvent.input(editor);
    fireEvent.click(screen.getByRole("button", { name: "便签打印" }));

    await waitFor(() => expect(apiMock.updateMemo).toHaveBeenCalledWith("memo-1", expect.objectContaining({
      contentHtml: "<p>打印前保存</p>"
    })));
    expect(await screen.findByRole("dialog", { name: "便签打印" })).toHaveTextContent("memo:memo-1");
  });
```

- [ ] **Step 2: Run MemoPanel tests and verify failure**

Run:

```bash
npm run test -w @todo/desktop -- apps/desktop/src/components/MemoPanel.test.tsx
```

Expected: FAIL because `printButtonEnabled` prop and print action do not exist.

- [ ] **Step 3: Implement MemoPanel print props and action**

In `MemoPanel.tsx`, import `Printer` and `PrintShareDialog`.

Change signature:

```ts
interface MemoPanelProps {
  printButtonEnabled?: boolean;
}

export function MemoPanel({ printButtonEnabled = false }: MemoPanelProps) {
```

Add state:

```ts
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
```

Add handler near `openMemoFloatingCard()`:

```ts
  async function openMemoPrintDialog() {
    if (!selectedMemo || !(await saveCurrentMemo())) {
      return;
    }
    setPrintDialogOpen(true);
  }
```

In `memoTopbarActions`, place between 当前 and 新建:

```tsx
      {printButtonEnabled ? (
        <Button
          aria-label="便签打印"
          className="memo-topbar-button"
          disabled={!selectedMemo}
          icon={<Printer size={15} />}
          size="small"
          type="default"
          onClick={() => void openMemoPrintDialog()}
        />
      ) : null}
```

Render after main panel markup:

```tsx
      {selectedMemo ? (
        <PrintShareDialog
          open={printDialogOpen}
          sourceType="memo"
          source={{ memoId: selectedMemo.id }}
          onClose={() => setPrintDialogOpen(false)}
        />
      ) : null}
```

- [ ] **Step 4: Pass memo preference from App**

In `App.tsx`, update the memo route:

```tsx
          <Route path={viewRoutes.memos} element={<MemoPanel printButtonEnabled={printButtonEnabled} />} />
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm run test -w @todo/desktop -- apps/desktop/src/components/MemoPanel.test.tsx apps/desktop/src/App.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit memo entry**

```bash
git add apps/desktop/src/App.tsx apps/desktop/src/components/MemoPanel.tsx apps/desktop/src/components/MemoPanel.test.tsx
git commit -m "feat: add memo print entry"
```

## Task 7: Final Verification

**Files:**
- Verify all files touched by Tasks 1-6.

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm run test -w @todo/shared -- packages/shared/src/index.test.ts
npm run test -w @todo/api -- apps/api/src/routes/preferences.test.ts apps/api/src/routes/print-shares.test.ts
npm run test -w @todo/desktop -- apps/desktop/src/components/PrintShareDialog.test.tsx apps/desktop/src/components/ProfileCenter.test.tsx apps/desktop/src/components/MemoPanel.test.tsx apps/desktop/src/App.test.tsx
```

Expected: all PASS.

- [ ] **Step 2: Run workspace typecheck**

Run:

```bash
npm run typecheck
```

Expected: shared build succeeds; API and desktop typecheck PASS.

- [ ] **Step 3: Run full test suite if focused tests pass**

Run:

```bash
npm test
```

Expected: PASS. If failures occur outside touched areas, record them with file/test names before deciding whether they are unrelated existing failures.

- [ ] **Step 4: Inspect changed files only**

Run:

```bash
git status --short
git diff --stat HEAD
git diff --check
```

Expected: no whitespace errors. Confirm `.superpowers/` and unrelated dirty files are not staged.

- [ ] **Step 5: Final implementation commit if needed**

If previous tasks were not committed individually, commit only relevant feature files:

```bash
git add packages/shared/src/index.ts packages/shared/src/index.test.ts \
  apps/api/prisma/schema.prisma apps/api/prisma/migrations/000022_print_shares/migration.sql apps/api/src/db.ts apps/api/src/app.ts apps/api/src/routes/preferences.ts apps/api/src/routes/preferences.test.ts apps/api/src/routes/print-shares.ts apps/api/src/routes/print-shares.test.ts \
  apps/desktop/src/api/client.ts apps/desktop/src/App.tsx apps/desktop/src/App.test.tsx apps/desktop/src/components/FloatingCard.tsx apps/desktop/src/components/MemoFloatingCard.tsx apps/desktop/src/components/ProfileCenter.tsx apps/desktop/src/components/ProfileCenter.test.tsx apps/desktop/src/components/PrintShareDialog.tsx apps/desktop/src/components/PrintShareDialog.test.tsx apps/desktop/src/components/MemoPanel.tsx apps/desktop/src/components/MemoPanel.test.tsx apps/desktop/src/styles.css
git commit -m "feat: add temporary print share links"
```

Expected: commit succeeds without staging unrelated worktree changes.
