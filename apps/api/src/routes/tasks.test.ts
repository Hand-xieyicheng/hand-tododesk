import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InjectOptions, Response } from "light-my-request";
import { buildApp } from "../app.js";
import { signAccessToken } from "../services/tokens.js";

const db = vi.hoisted(() => ({
  execute: vi.fn(),
  queryOne: vi.fn(),
  queryRows: vi.fn(),
  transaction: vi.fn()
}));

vi.mock("../db.js", () => ({
  asDate: (value: unknown) => value instanceof Date ? value : value ? new Date(String(value)) : null,
  execute: db.execute,
  id: () => "generated-id",
  queryOne: db.queryOne,
  queryRows: db.queryRows,
  toMysqlDate: (date: Date | null | undefined) => date ? date.toISOString().slice(0, 19).replace("T", " ") : null,
  transaction: db.transaction
}));

const token = signAccessToken({ sub: "user-1", email: "todo@example.com" });

const taskRow = {
  id: "task-1",
  userId: "user-1",
  title: "整理计划",
  notes: null,
  dueAt: null,
  priority: "IMPORTANT_NOT_URGENT",
  status: "TODO",
  completedAt: null,
  createdAt: new Date("2026-06-01T00:00:00.000Z"),
  updatedAt: new Date("2026-06-01T00:00:00.000Z")
};

async function injectTask(method: InjectOptions["method"], url = "/tasks", payload?: InjectOptions["payload"]): Promise<Response> {
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

describe("task tag assignment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.execute.mockResolvedValue({ affectedRows: 1 });
    db.queryOne.mockResolvedValue(null);
    db.queryRows.mockResolvedValue([]);
    db.transaction.mockImplementation(async (callback: (connection: { execute: typeof db.execute }) => Promise<unknown>) => callback({ execute: db.execute }));
  });

  it("creates tasks with one owned tag id", async () => {
    db.queryOne
      .mockResolvedValueOnce({ id: "tag-1" })
      .mockResolvedValueOnce(taskRow)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ completedCount: 0, completedMinutes: 0 });
    db.queryRows.mockResolvedValueOnce([{ id: "tag-1", name: "工作" }]);

    const response = await injectTask("POST", "/tasks", {
      title: "整理计划",
      priority: "IMPORTANT_NOT_URGENT",
      status: "TODO",
      tagId: "tag-1",
      recurrenceRule: null
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().task.tags).toEqual([{ id: "tag-1", name: "工作" }]);
    expect(db.execute).toHaveBeenCalledWith("INSERT INTO `TaskTag` (`taskId`, `tagId`) VALUES (?, ?)", ["generated-id", "tag-1"]);
  });

  it("rejects task creation with another user's tag id", async () => {
    db.queryOne.mockResolvedValueOnce(null);

    const response = await injectTask("POST", "/tasks", {
      title: "非法标签",
      tagId: "other-tag"
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "Tag not found" });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("clears tags when a task is updated with null tag id", async () => {
    db.queryOne
      .mockResolvedValueOnce(taskRow)
      .mockResolvedValueOnce(taskRow)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ completedCount: 0, completedMinutes: 0 });
    db.queryRows.mockResolvedValueOnce([]);

    const response = await injectTask("PATCH", "/tasks/task-1", {
      tagId: null
    });

    expect(response.statusCode).toBe(200);
    expect(db.execute).toHaveBeenCalledWith("DELETE FROM `TaskTag` WHERE `taskId` = ?", ["task-1"]);
    expect(response.json().task.tags).toEqual([]);
  });

  it("rejects task updates with another user's tag id", async () => {
    db.queryOne
      .mockResolvedValueOnce(taskRow)
      .mockResolvedValueOnce(null);

    const response = await injectTask("PATCH", "/tasks/task-1", {
      tagId: "other-tag"
    });

    expect(response.statusCode).toBe(400);
    expect(db.transaction).not.toHaveBeenCalled();
  });
});
