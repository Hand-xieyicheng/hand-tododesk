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
  id: () => "generated-tag",
  queryOne: db.queryOne,
  queryRows: db.queryRows,
  transaction: (callback: (connection: { execute: typeof db.execute }) => Promise<unknown>) => callback({ execute: db.execute })
}));

const token = signAccessToken({ sub: "user-1", email: "todo@example.com" });

async function injectTag(method: InjectOptions["method"], url = "/tags", payload?: InjectOptions["payload"]): Promise<Response> {
  const app = await buildApp();
  const response = await app.inject({
    method,
    url,
    headers: {
      authorization: `Bearer ${token}`
    },
    payload
  } satisfies InjectOptions);
  await app.close();
  return response;
}

describe("tag routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.execute.mockResolvedValue({ affectedRows: 1 });
    db.queryOne.mockResolvedValue(null);
    db.queryRows.mockResolvedValue([]);
  });

  it("lists current user tags", async () => {
    db.queryRows.mockResolvedValueOnce([
      { id: "tag-1", userId: "user-1", name: "工作", sortOrder: 1000 },
      { id: "tag-2", userId: "user-1", name: "生活", sortOrder: 2000 }
    ]);

    const response = await injectTag("GET");

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      tags: [
        { id: "tag-1", name: "工作" },
        { id: "tag-2", name: "生活" }
      ]
    });
    expect(db.queryRows).toHaveBeenCalledWith(expect.stringContaining("WHERE `userId` = ?"), ["user-1"]);
    expect(db.queryRows).toHaveBeenCalledWith(expect.stringContaining("ORDER BY `sortOrder` ASC, `createdAt` ASC, `name` ASC, `id` ASC"), ["user-1"]);
  });

  it("creates trimmed tags and rejects duplicates", async () => {
    db.queryOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ nextSortOrder: 1000 })
      .mockResolvedValueOnce({ id: "generated-tag", userId: "user-1", name: "娱乐", sortOrder: 1000 });

    const created = await injectTag("POST", "/tags", { name: " 娱乐 " });

    expect(created.statusCode).toBe(201);
    expect(created.json()).toEqual({ tag: { id: "generated-tag", name: "娱乐" } });
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO `Tag`"), ["generated-tag", "user-1", "娱乐", 1000]);

    db.queryOne.mockResolvedValueOnce({ id: "existing-tag", userId: "user-1", name: "娱乐" });
    const duplicate = await injectTag("POST", "/tags", { name: "娱乐" });

    expect(duplicate.statusCode).toBe(409);
  });

  it("persists tag order for owned tags only", async () => {
    db.queryRows.mockResolvedValueOnce([
      { id: "tag-2" },
      { id: "tag-1" }
    ]);

    const reordered = await injectTag("PUT", "/tags/order", { orderedIds: ["tag-2", "tag-1"] });

    expect(reordered.statusCode).toBe(200);
    expect(reordered.json()).toEqual({ ok: true });
    expect(db.queryRows).toHaveBeenCalledWith(expect.stringContaining("FROM `Tag`"), ["user-1", "tag-2", "tag-1"]);
    expect(db.execute).toHaveBeenNthCalledWith(1, "UPDATE `Tag` SET `sortOrder` = ? WHERE `id` = ? AND `userId` = ?", [1000, "tag-2", "user-1"]);
    expect(db.execute).toHaveBeenNthCalledWith(2, "UPDATE `Tag` SET `sortOrder` = ? WHERE `id` = ? AND `userId` = ?", [2000, "tag-1", "user-1"]);

    db.queryRows.mockResolvedValueOnce([{ id: "tag-1" }]);
    const missing = await injectTag("PUT", "/tags/order", { orderedIds: ["tag-1", "other-tag"] });

    expect(missing.statusCode).toBe(404);
  });

  it("renames only owned tags and rejects name conflicts", async () => {
    db.queryOne
      .mockResolvedValueOnce({ id: "tag-1", userId: "user-1", name: "工作" })
      .mockResolvedValueOnce({ id: "tag-2", userId: "user-1", name: "生活" });

    const conflict = await injectTag("PATCH", "/tags/tag-1", { name: "生活" });

    expect(conflict.statusCode).toBe(409);

    db.queryOne
      .mockResolvedValueOnce(null);

    const missing = await injectTag("PATCH", "/tags/other-tag", { name: "私人" });

    expect(missing.statusCode).toBe(404);
  });

  it("deletes only current user tags", async () => {
    db.execute.mockResolvedValueOnce({ affectedRows: 0 });

    const missing = await injectTag("DELETE", "/tags/other-tag");

    expect(missing.statusCode).toBe(404);

    db.execute.mockResolvedValueOnce({ affectedRows: 1 });
    const deleted = await injectTag("DELETE", "/tags/tag-1");

    expect(deleted.statusCode).toBe(204);
    expect(db.execute).toHaveBeenLastCalledWith("DELETE FROM `Tag` WHERE `id` = ? AND `userId` = ?", ["tag-1", "user-1"]);
  });
});
