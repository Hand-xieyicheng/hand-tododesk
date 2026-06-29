import { beforeEach, describe, expect, it } from "vitest";
import type { ApiTag, ApiTask } from "@todo/shared";
import { useTaskBoardStore } from "./taskBoardStore";

const tag: ApiTag = {
  id: "tag-1",
  name: "工作"
};

const task: ApiTask = {
  id: "task-1",
  title: "准备周报",
  notes: "整理本周项目进展",
  startAt: null,
  dueAt: null,
  priority: "IMPORTANT_NOT_URGENT",
  status: "TODO",
  sortOrder: null,
  createdAt: "2026-06-26T00:00:00.000Z",
  updatedAt: "2026-06-26T00:00:00.000Z",
  completedAt: null,
  recurrenceRule: null,
  tags: [tag],
  pomodoroCompletedCount: 0,
  pomodoroCompletedMinutes: 0
};

function taskWith(patch: Partial<ApiTask>): ApiTask {
  return {
    ...task,
    ...patch,
    tags: patch.tags ?? task.tags
  };
}

describe("taskBoardStore", () => {
  beforeEach(() => {
    useTaskBoardStore.getState().reset();
  });

  it("hydrates task and tag snapshots", () => {
    useTaskBoardStore.getState().setSnapshot({ tasks: [task], tags: [tag] });

    expect(useTaskBoardStore.getState().tasks).toEqual([task]);
    expect(useTaskBoardStore.getState().tags).toEqual([tag]);
  });

  it("replaces existing tasks and keeps tasks in display order", () => {
    const updatedTask = taskWith({ title: "准备周报更新", updatedAt: "2026-06-26T01:00:00.000Z" });
    const newTask = taskWith({
      id: "task-2",
      title: "补充票据",
      createdAt: "2026-06-26T02:00:00.000Z",
      updatedAt: "2026-06-26T02:00:00.000Z"
    });

    useTaskBoardStore.getState().setTasks([task]);
    useTaskBoardStore.getState().upsertTask(updatedTask);
    useTaskBoardStore.getState().upsertTask(newTask);

    expect(useTaskBoardStore.getState().tasks).toEqual([updatedTask, newTask]);
  });

  it("deletes tasks by id", () => {
    const secondTask = taskWith({ id: "task-2", title: "补充票据" });

    useTaskBoardStore.getState().setTasks([task, secondTask]);
    useTaskBoardStore.getState().deleteTask("task-1");

    expect(useTaskBoardStore.getState().tasks).toEqual([secondTask]);
  });
});
