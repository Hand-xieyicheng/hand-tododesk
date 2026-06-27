import { create } from "zustand";
import { sortTasksForDisplay, type ApiTag, type ApiTask } from "@todo/shared";

interface TaskBoardSnapshot {
  tags: ApiTag[];
  tasks: ApiTask[];
}

interface TaskBoardStore extends TaskBoardSnapshot {
  deleteTask(taskId: string): void;
  reset(): void;
  setSnapshot(snapshot: TaskBoardSnapshot): void;
  setTags(tags: ApiTag[]): void;
  setTasks(tasks: ApiTask[]): void;
  upsertTask(task: ApiTask): void;
}

export const useTaskBoardStore = create<TaskBoardStore>((set) => ({
  tags: [],
  tasks: [],
  deleteTask: (taskId) => set((state) => ({
    tasks: state.tasks.filter((task) => task.id !== taskId)
  })),
  reset: () => set({ tags: [], tasks: [] }),
  setSnapshot: (snapshot) => set({
    tags: snapshot.tags,
    tasks: sortTasksForDisplay(snapshot.tasks)
  }),
  setTags: (tags) => set({ tags }),
  setTasks: (tasks) => set({ tasks: sortTasksForDisplay(tasks) }),
  upsertTask: (task) => set((state) => {
    const existingIndex = state.tasks.findIndex((item) => item.id === task.id);
    if (existingIndex === -1) {
      return { tasks: sortTasksForDisplay([...state.tasks, task]) };
    }

    return {
      tasks: sortTasksForDisplay(state.tasks.map((item) => item.id === task.id ? task : item))
    };
  })
}));
