import { sortTasksForDisplay, type ApiTask, type TaskStatus } from "@todo/shared";

type TaskOrderItem = {
  id: string;
  status?: TaskStatus | string | null;
};

function isCompletedTask(task: TaskOrderItem | undefined) {
  return task?.status === "COMPLETED";
}

export function moveTaskInList<TTask extends TaskOrderItem>(tasks: readonly TTask[], activeId: string, overId: string) {
  if (activeId === overId) {
    return null;
  }

  const oldIndex = tasks.findIndex((task) => task.id === activeId);
  const newIndex = tasks.findIndex((task) => task.id === overId);
  if (oldIndex < 0 || newIndex < 0) {
    return null;
  }
  if (isCompletedTask(tasks[oldIndex]) || isCompletedTask(tasks[newIndex])) {
    return null;
  }

  const nextTasks = [...tasks];
  const movedTask = nextTasks[oldIndex];
  if (!movedTask) {
    return null;
  }
  nextTasks.splice(oldIndex, 1);
  nextTasks.splice(newIndex, 0, movedTask);
  return nextTasks;
}

export function assignTaskSortOrders<TTask extends ApiTask>(tasks: readonly TTask[]) {
  return tasks.map((task, index) => ({
    ...task,
    sortOrder: (index + 1) * 1000
  }));
}

export function applyVisibleTaskOrder<TTask extends ApiTask>(
  allTasks: readonly TTask[],
  previousVisibleTasks: readonly TTask[],
  nextVisibleTasks: readonly TTask[]
) {
  const visibleIds = new Set(previousVisibleTasks.map((task) => task.id));
  const replacementTasks = [...nextVisibleTasks];
  const mergedTasks = sortTasksForDisplay(allTasks).map((task) => {
    if (!visibleIds.has(task.id)) {
      return task;
    }
    return replacementTasks.shift() ?? task;
  });

  return sortTasksForDisplay(assignTaskSortOrders(mergedTasks));
}

export function taskOrderIds(tasks: readonly ApiTask[]) {
  return tasks.map((task) => task.id);
}
