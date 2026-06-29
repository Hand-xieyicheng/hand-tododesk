import { describe, expect, it } from "vitest";
import type { ApiTask } from "@todo/shared";
import { applyVisibleTaskOrder, moveTaskInList } from "./taskOrdering";

const baseTask: ApiTask = {
  id: "task-1",
  title: "任务",
  notes: null,
  startAt: null,
  dueAt: null,
  priority: "IMPORTANT_NOT_URGENT",
  status: "TODO",
  sortOrder: null,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
  completedAt: null,
  recurrenceRule: null,
  tags: [],
  pomodoroCompletedCount: 0,
  pomodoroCompletedMinutes: 0
};

function taskWith(id: string, createdAt: string, patch: Partial<ApiTask> = {}): ApiTask {
  return {
    ...baseTask,
    id,
    title: id,
    createdAt,
    updatedAt: createdAt,
    ...patch
  };
}

describe("taskOrdering", () => {
  it("moves a visible task to the target index", () => {
    const tasks = [
      taskWith("a", "2026-06-01T00:00:00.000Z"),
      taskWith("b", "2026-06-02T00:00:00.000Z"),
      taskWith("c", "2026-06-03T00:00:00.000Z")
    ];

    expect(moveTaskInList(tasks, "a", "c")?.map((task) => task.id)).toEqual(["b", "c", "a"]);
    expect(moveTaskInList(tasks, "a", "a")).toBeNull();
    expect(moveTaskInList(tasks, "missing", "c")).toBeNull();
  });

  it("does not move completed tasks or drop open tasks onto completed tasks", () => {
    const openOld = taskWith("open-old", "2026-06-01T00:00:00.000Z");
    const openNew = taskWith("open-new", "2026-06-02T00:00:00.000Z");
    const completed = taskWith("done", "2026-06-03T00:00:00.000Z", {
      status: "COMPLETED",
      completedAt: "2026-06-04T00:00:00.000Z"
    });
    const tasks = [openOld, openNew, completed];

    expect(moveTaskInList(tasks, "done", "open-old")).toBeNull();
    expect(moveTaskInList(tasks, "open-old", "done")).toBeNull();
  });

  it("merges reordered visible tasks into the full order and assigns manual sort values", () => {
    const allTasks = [
      taskWith("a", "2026-06-01T00:00:00.000Z"),
      taskWith("b-hidden", "2026-06-02T00:00:00.000Z"),
      taskWith("c", "2026-06-03T00:00:00.000Z"),
      taskWith("d-hidden", "2026-06-04T00:00:00.000Z")
    ];
    const previousVisibleTasks = [allTasks[0]!, allTasks[2]!];
    const nextVisibleTasks = [allTasks[2]!, allTasks[0]!];

    const nextTasks = applyVisibleTaskOrder(allTasks, previousVisibleTasks, nextVisibleTasks);

    expect(nextTasks.map((task) => task.id)).toEqual(["c", "b-hidden", "a", "d-hidden"]);
    expect(nextTasks.map((task) => task.sortOrder)).toEqual([1000, 2000, 3000, 4000]);
  });
});
