import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTask,
  deleteTask,
  listTasks,
  TaskDomainError,
  updateTask
} from "./task-domain.js";

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

const taskRow = {
  id: "task-1",
  userId: "user-1",
  title: "交周报",
  notes: null,
  startAt: null,
  dueAt: new Date("2026-07-10T09:00:00.000Z"),
  priority: "IMPORTANT_URGENT",
  status: "TODO",
  sortOrder: 1000,
  completedAt: null,
  createdAt: new Date("2026-07-10T01:00:00.000Z"),
  updatedAt: new Date("2026-07-10T01:00:00.000Z")
};

describe("task domain service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.execute.mockResolvedValue({ affectedRows: 1 });
    db.queryOne.mockResolvedValue(null);
    db.queryRows.mockResolvedValue([]);
    db.transaction.mockImplementation(async (callback: (connection: { execute: typeof db.execute }) => Promise<unknown>) => (
      callback({ execute: db.execute })
    ));
  });

  it("creates and serializes an owned task", async () => {
    db.queryOne
      .mockResolvedValueOnce(taskRow)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ completedCount: 0, completedMinutes: 0 });

    await expect(createTask("user-1", {
      title: "交周报",
      notes: null,
      startAt: null,
      dueAt: "2026-07-10T09:00:00.000Z",
      priority: "IMPORTANT_URGENT",
      status: "TODO",
      tagId: null,
      recurrenceRule: null
    })).resolves.toMatchObject({
      id: "task-1",
      title: "交周报",
      dueAt: "2026-07-10T09:00:00.000Z"
    });

    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO `Task`"),
      expect.arrayContaining(["generated-id", "user-1", "交周报"])
    );
  });

  it("lists tasks with tags, recurrence, and pomodoro totals", async () => {
    db.queryRows
      .mockResolvedValueOnce([taskRow])
      .mockResolvedValueOnce([{ id: "tag-1", name: "工作" }]);
    db.queryOne
      .mockResolvedValueOnce({
        taskId: "task-1",
        frequency: "WEEKLY",
        interval: 1,
        until: null,
        count: null,
        byWeekday: "[\"FR\"]"
      })
      .mockResolvedValueOnce({ completedCount: 2, completedMinutes: 50 });

    await expect(listTasks("user-1")).resolves.toEqual([
      expect.objectContaining({
        id: "task-1",
        tags: [{ id: "tag-1", name: "工作" }],
        recurrenceRule: expect.objectContaining({ frequency: "WEEKLY", byWeekday: ["FR"] }),
        pomodoroCompletedCount: 2,
        pomodoroCompletedMinutes: 50
      })
    ]);
  });

  it("rejects a foreign tag before creating", async () => {
    db.queryOne.mockResolvedValueOnce(null);

    await expect(createTask("user-1", {
      title: "非法标签",
      tagId: "tag-other",
      priority: "IMPORTANT_NOT_URGENT",
      status: "TODO"
    })).rejects.toMatchObject({ code: "TAG_NOT_FOUND" });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("rejects updates for a missing or foreign task", async () => {
    db.queryOne.mockResolvedValueOnce(null);

    await expect(updateTask("user-1", "task-other", {
      title: "不能修改"
    })).rejects.toEqual(expect.any(TaskDomainError));
    await expect(updateTask("user-1", "task-other", {
      title: "不能修改"
    })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("updates an owned task and returns the serialized result", async () => {
    db.queryOne
      .mockResolvedValueOnce(taskRow)
      .mockResolvedValueOnce({ ...taskRow, title: "提交周报" })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ completedCount: 0, completedMinutes: 0 });

    await expect(updateTask("user-1", "task-1", {
      title: "提交周报"
    })).resolves.toMatchObject({
      id: "task-1",
      title: "提交周报"
    });
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE `Task` SET"),
      expect.arrayContaining(["提交周报", "task-1", "user-1"])
    );
  });

  it("rejects merged time ranges that become invalid", async () => {
    db.queryOne.mockResolvedValueOnce({
      ...taskRow,
      startAt: new Date("2026-07-12T09:00:00.000Z")
    });

    await expect(updateTask("user-1", "task-1", {
      dueAt: "2026-07-11T09:00:00.000Z"
    })).rejects.toMatchObject({ code: "INVALID_TIME_RANGE" });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("deletes only an owned task", async () => {
    await expect(deleteTask("user-1", "task-1")).resolves.toBeUndefined();
    expect(db.execute).toHaveBeenCalledWith(
      "DELETE FROM `Task` WHERE `id` = ? AND `userId` = ?",
      ["task-1", "user-1"]
    );

    db.execute.mockResolvedValueOnce({ affectedRows: 0 });
    await expect(deleteTask("user-1", "task-other")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
