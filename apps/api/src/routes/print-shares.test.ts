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

const taskPrintSource = {
  tagFilter: "__all__",
  showCompletedTasks: false,
  viewMode: "list"
} as const;

const printConfig = {
  templateId: "checklist",
  paperWidthMode: "preset",
  paperWidthMm: 58,
  fontSizeMode: "normal",
  marginMode: "normal",
  expiresInHours: 24
} as const;

const validShare = {
  id: "share-1",
  userId: "user-1",
  tokenHash: "hash",
  sourceType: "tasks",
  sourceJson: JSON.stringify(taskPrintSource),
  configJson: JSON.stringify(printConfig),
  expiresAt: new Date("2099-01-01T00:00:00.000Z"),
  revokedAt: null
};

const taskRow = {
  id: "task-1",
  userId: "user-1",
  title: "整理热敏纸采购",
  notes: null,
  dueAt: null,
  priority: "IMPORTANT_NOT_URGENT",
  status: "TODO",
  sortOrder: null,
  completedAt: null,
  createdAt: new Date("2026-06-01T00:00:00.000Z"),
  updatedAt: new Date("2026-06-01T00:00:00.000Z")
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
    db.execute.mockResolvedValue({ affectedRows: 1 });
    db.queryOne.mockResolvedValue(null);
    db.queryRows.mockResolvedValue([]);
  });

  it("POST /print-shares creates a task print link and clears only current user's expired links first", async () => {
    const response = await inject("POST", "/print-shares", {
      sourceType: "tasks",
      source: taskPrintSource,
      config: printConfig
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().printShare).toMatchObject({
      id: "print-share-1",
      url: expect.stringMatching(/^http:\/\/localhost:4020\/print\/[A-Za-z0-9_-]+$/),
      expiresAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/)
    });
    expect(db.execute).toHaveBeenNthCalledWith(
      1,
      "DELETE FROM `PrintShare` WHERE `userId` = ? AND `expiresAt` < NOW(3)",
      ["user-1"]
    );
    expect(db.execute).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("INSERT INTO `PrintShare`"),
      expect.arrayContaining([
        "print-share-1",
        "user-1",
        "tasks",
        JSON.stringify(taskPrintSource),
        JSON.stringify(printConfig)
      ])
    );
  });

  it("POST /print-shares rejects memo print links when memo does not belong to current user", async () => {
    db.queryOne.mockResolvedValueOnce(null);

    const response = await inject("POST", "/print-shares", {
      sourceType: "memo",
      source: { memoId: "memo-other" },
      config: {
        ...printConfig,
        templateId: "memo"
      }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "Memo not found" });
    expect(db.execute).toHaveBeenCalledWith(
      "DELETE FROM `PrintShare` WHERE `userId` = ? AND `expiresAt` < NOW(3)",
      ["user-1"]
    );
    expect(db.queryOne).toHaveBeenCalledWith(expect.stringContaining("FROM `Memo`"), ["memo-other", "user-1"]);
    expect(db.execute).not.toHaveBeenCalledWith(expect.stringContaining("INSERT INTO `PrintShare`"), expect.any(Array));
  });

  it("GET /print/:token serves public printable HTML for valid token without auth", async () => {
    db.queryOne.mockResolvedValueOnce(validShare);
    db.queryRows
      .mockResolvedValueOnce([taskRow])
      .mockResolvedValueOnce([{ taskId: "task-1", id: "tag-1", name: "采购" }]);

    const response = await inject("GET", "/print/public-token", undefined, false);

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.body).toContain("整理热敏纸采购");
    expect(response.body).toContain("采购");
    expect(response.body).toContain("@media print");
    expect(response.body).toContain("58mm");
    expect(response.body).not.toContain("todo@example.com");
    expect(db.execute).toHaveBeenCalledWith("UPDATE `PrintShare` SET `lastAccessedAt` = NOW(3), `updatedAt` = NOW(3) WHERE `id` = ?", ["share-1"]);
  });

  it("GET /print/:token applies the selected print template to public HTML", async () => {
    db.queryOne.mockResolvedValueOnce({
      ...validShare,
      configJson: JSON.stringify({
        ...printConfig,
        templateId: "decorated"
      })
    });
    db.queryRows
      .mockResolvedValueOnce([taskRow])
      .mockResolvedValueOnce([]);

    const response = await inject("GET", "/print/decorated-token", undefined, false);

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("print-template-decorated");
    expect(response.body).toContain("border: 1px solid");
  });

  it.each([
    ["expired", { ...validShare, expiresAt: new Date("2000-01-01T00:00:00.000Z") }],
    ["revoked", { ...validShare, revokedAt: new Date("2026-01-01T00:00:00.000Z") }],
    ["nonexistent", null]
  ])("GET /print/:token returns generic error page for %s token", async (_caseName, share) => {
    db.queryOne.mockResolvedValueOnce(share);

    const response = await inject("GET", "/print/bad-token", undefined, false);

    expect(response.statusCode).toBe(410);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.body).toContain("链接不可用");
    expect(response.body).not.toContain("user-1");
    expect(response.body).not.toContain("todo@example.com");
    expect(response.body).not.toContain("tokenHash");
  });

  it("DELETE /print-shares/:id revokes only current user's own print share", async () => {
    const response = await inject("DELETE", "/print-shares/share-1");

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    expect(db.execute).toHaveBeenCalledWith(
      "UPDATE `PrintShare` SET `revokedAt` = NOW(3), `updatedAt` = NOW(3) WHERE `id` = ? AND `userId` = ?",
      ["share-1", "user-1"]
    );
  });
});
