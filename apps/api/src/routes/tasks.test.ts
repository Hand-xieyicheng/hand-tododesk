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
  startAt: null,
  dueAt: null,
  priority: "IMPORTANT_NOT_URGENT",
  status: "TODO",
  sortOrder: null,
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

describe("task time ranges", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.execute.mockResolvedValue({ affectedRows: 1 });
    db.queryOne.mockResolvedValue(null);
    db.queryRows.mockResolvedValue([]);
    db.transaction.mockImplementation(async (callback: (connection: { execute: typeof db.execute }) => Promise<unknown>) => callback({ execute: db.execute }));
  });

  it("creates tasks with optional start and due times", async () => {
    db.queryOne
      .mockResolvedValueOnce({
        ...taskRow,
        startAt: new Date("2026-06-10T01:30:00.000Z"),
        dueAt: new Date("2026-06-10T10:30:00.000Z")
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ completedCount: 0, completedMinutes: 0 });
    db.queryRows.mockResolvedValueOnce([]);

    const response = await injectTask("POST", "/tasks", {
      title: "整理计划",
      startAt: "2026-06-10T01:30:00.000Z",
      dueAt: "2026-06-10T10:30:00.000Z"
    });

    const insertCall = db.execute.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO `Task`"));
    expect(response.statusCode).toBe(201);
    expect(insertCall?.[0]).toContain("`startAt`");
    expect(insertCall?.[1]).toEqual(expect.arrayContaining(["2026-06-10 01:30:00", "2026-06-10 10:30:00"]));
    expect(response.json().task).toMatchObject({
      startAt: "2026-06-10T01:30:00.000Z",
      dueAt: "2026-06-10T10:30:00.000Z"
    });
  });

  it("rejects updates that would make the start time later than the due time", async () => {
    db.queryOne.mockResolvedValueOnce({
      ...taskRow,
      startAt: new Date("2026-06-11T01:30:00.000Z"),
      dueAt: new Date("2026-06-12T10:30:00.000Z")
    });

    const response = await injectTask("PATCH", "/tasks/task-1", {
      dueAt: "2026-06-10T10:30:00.000Z"
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "Start time must not be later than due time" });
    expect(db.transaction).not.toHaveBeenCalled();
  });
});

describe("task manual ordering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.execute.mockResolvedValue({ affectedRows: 1 });
    db.queryOne.mockImplementation(async (sql: string) => (
      sql.includes("PomodoroSession")
        ? { completedCount: 0, completedMinutes: 0 }
        : null
    ));
    db.queryRows.mockResolvedValue([]);
    db.transaction.mockImplementation(async (callback: (connection: { execute: typeof db.execute }) => Promise<unknown>) => callback({ execute: db.execute }));
  });

  it("returns open tasks before completed tasks, then applies manual and default ordering", async () => {
    db.queryRows
      .mockResolvedValueOnce([
        {
          ...taskRow,
          id: "default-old",
          title: "默认旧任务",
          createdAt: new Date("2026-06-01T00:00:00.000Z"),
          sortOrder: null
        },
        {
          ...taskRow,
          id: "manual-second",
          title: "手动第二",
          createdAt: new Date("2026-06-05T00:00:00.000Z"),
          sortOrder: 2000
        },
        {
          ...taskRow,
          id: "manual-first-completed",
          title: "手动第一已完成",
          status: "COMPLETED",
          completedAt: new Date("2026-06-06T00:00:00.000Z"),
          createdAt: new Date("2026-06-06T00:00:00.000Z"),
          sortOrder: 1000
        },
        {
          ...taskRow,
          id: "default-new",
          title: "默认新任务",
          createdAt: new Date("2026-06-03T00:00:00.000Z"),
          sortOrder: null
        }
      ])
      .mockResolvedValue([]);

    const response = await injectTask("GET");

    expect(response.statusCode).toBe(200);
    expect(db.queryRows).toHaveBeenNthCalledWith(1, expect.stringContaining("`status` = 'COMPLETED'"), ["user-1"]);
    expect(db.queryRows).toHaveBeenNthCalledWith(1, expect.stringContaining("`sortOrder` IS NULL"), ["user-1"]);
    expect(response.json().tasks.map((task: { id: string }) => task.id)).toEqual([
      "manual-second",
      "default-old",
      "default-new",
      "manual-first-completed"
    ]);
    expect(response.json().tasks[3]).toMatchObject({
      id: "manual-first-completed",
      sortOrder: 1000
    });
  });

  it("persists the supplied task order for the authenticated user", async () => {
    db.queryRows.mockResolvedValueOnce([{ id: "task-2" }, { id: "task-1" }]);

    const response = await injectTask("PUT", "/tasks/order", {
      orderedIds: ["task-2", "task-1"]
    });

    expect(response.statusCode).toBe(200);
    expect(db.execute).toHaveBeenNthCalledWith(1, expect.stringContaining("UPDATE `Task` SET `sortOrder` = ?"), [1000, "task-2", "user-1"]);
    expect(db.execute).toHaveBeenNthCalledWith(2, expect.stringContaining("UPDATE `Task` SET `sortOrder` = ?"), [2000, "task-1", "user-1"]);
    expect(response.json()).toEqual({ ok: true });
  });

  it("rejects task order updates containing unknown or archived task ids", async () => {
    db.queryRows.mockResolvedValueOnce([{ id: "task-1" }]);

    const response = await injectTask("PUT", "/tasks/order", {
      orderedIds: ["task-1", "missing-task"]
    });

    expect(response.statusCode).toBe(404);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("rejects duplicate task order ids before touching the database", async () => {
    const response = await injectTask("PUT", "/tasks/order", {
      orderedIds: ["task-1", "task-1"]
    });

    expect(response.statusCode).toBe(400);
    expect(db.queryRows).not.toHaveBeenCalled();
  });
});

describe("calendar route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.execute.mockResolvedValue({ affectedRows: 1 });
    db.queryOne.mockResolvedValue(null);
    db.queryRows.mockResolvedValue([]);
    db.transaction.mockImplementation(async (callback: (connection: { execute: typeof db.execute }) => Promise<unknown>) => callback({ execute: db.execute }));
  });

  it("returns task occurrences with habit check-ins inside the date range", async () => {
    const from = "2026-06-01T00:00:00.000Z";
    const to = "2026-07-01T00:00:00.000Z";
    db.queryRows
      .mockResolvedValueOnce([{ ...taskRow, dueAt: new Date("2026-06-25T10:00:00.000Z") }])
      .mockResolvedValueOnce([
        {
          checkInId: "check-active",
          habitId: "habit-1",
          date: "2026-06-25",
          title: "学习日语",
          icon: "BookOpen",
          color: "mint",
          sortOrder: 1000
        },
        {
          checkInId: "check-archived",
          habitId: "habit-2",
          date: "2026-06-25",
          title: "早睡",
          icon: "Moon",
          color: "blue",
          sortOrder: 2000,
          archivedAt: new Date("2026-06-20T00:00:00.000Z")
        },
        {
          checkInId: "check-boundary",
          habitId: "habit-3",
          date: "2026-07-01",
          title: "边界打卡",
          icon: "Smile",
          color: "teal",
          sortOrder: 3000
        }
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    db.queryOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ completedCount: 0, completedMinutes: 0 });

    const response = await injectTask("GET", `/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&view=month`);

    expect(response.statusCode).toBe(200);
    expect(db.queryRows).toHaveBeenNthCalledWith(2, expect.stringContaining("hc.`date` < ?"), ["user-1", "2026-06-01", "2026-07-01"]);
    expect(response.json().occurrences).toHaveLength(1);
    expect(response.json().occurrences[0]).toMatchObject({
      taskId: "task-1",
      title: "整理计划"
    });
    expect(response.json().habitCheckIns).toEqual([
      {
        id: "check-active",
        habitId: "habit-1",
        date: "2026-06-25",
        title: "学习日语",
        icon: "BookOpen",
        color: "mint",
        sortOrder: 1000
      },
      {
        id: "check-archived",
        habitId: "habit-2",
        date: "2026-06-25",
        title: "早睡",
        icon: "Moon",
        color: "blue",
        sortOrder: 2000
      }
    ]);
  });
});
