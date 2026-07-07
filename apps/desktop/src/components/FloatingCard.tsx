import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, FormEvent, ReactNode } from "react";
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, type DragEndEvent, type DragStartEvent, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { defaultThemeId, defaultVisibleSidebarModules, isTaskOverdue, sortTasksForDisplay, taskDateFilterOptions, taskMatchesDateFilter, toLocalDateKey, type ApiHabit, type ApiTag, type ApiTask, type ApiThemePreference, type CreateTaskRequest, type FloatingCardThemeId, type FloatingCardViewMode, type TaskCardDisplayMode, type TaskDateFilter, type TaskPriority, type TaskStatus, type UpdateTaskRequest } from "@todo/shared";
import { Button, Card, Input, Select, Tooltip, type TooltipPlacement } from "animal-island-ui";
import { Check, Eye, EyeOff, LayoutGrid, List, Pencil, Plus, RefreshCw, Save, Tags, Trash2, X } from "lucide-react";
import { api } from "../api/client";
import { emitDesktopSyncEvent, listenDesktopSyncEvents } from "../lib/desktopSync";
import { applyDisplaySize } from "../lib/displaySize";
import { datetimeLocalToIso, formatTaskTimeRange, getTodayEndDatetimeLocal, isValidTaskTimeRange, toDatetimeLocal } from "../lib/datetime";
import { floatingTaskWindowGeometryStorageKey } from "../lib/floatingWindowGeometry";
import { defaultFloatingCardThemeId, getFloatingCardThemeStyle, normalizeFloatingCardThemeId } from "../lib/floatingCardThemes";
import { applyFontFamily } from "../lib/fonts";
import { getHabitIcon } from "../lib/habitIcons";
import { applyVisibleTaskOrder, moveTaskInList, taskOrderIds } from "../lib/taskOrdering";
import { applyTheme } from "../lib/themes";
import { useTaskBoardStore } from "../stores/taskBoardStore";
import { FloatingWindowHeader } from "./FloatingWindowHeader";
import { TaskTimeRangePicker } from "./TaskTimeRangePicker";

type FormMode = "create" | "edit";

interface TaskDraft {
  title: string;
  notes: string;
  startAt: string;
  dueAt: string;
  priority: TaskPriority;
  tagId: string;
}

const priorityLabels: Record<TaskPriority, string> = {
  IMPORTANT_URGENT: "重要且紧急",
  IMPORTANT_NOT_URGENT: "重要不紧急",
  NOT_IMPORTANT_URGENT: "不重要但紧急",
  NOT_IMPORTANT_NOT_URGENT: "不重要不紧急"
};

const priorityOrder: TaskPriority[] = [
  "IMPORTANT_URGENT",
  "IMPORTANT_NOT_URGENT",
  "NOT_IMPORTANT_URGENT",
  "NOT_IMPORTANT_NOT_URGENT"
];

const priorityOptions = priorityOrder.map((priority) => ({ key: priority, label: priorityLabels[priority] }));
const noTagSelectValue = "__none__";
const otherTagGroupId = "__other__";
const leftAlignedHabitShortcutTooltipCount = 3;

const floatingCardViewModeLabels: Record<FloatingCardViewMode, string> = {
  list: "默认列表",
  quadrant: "四象限列表",
  tag: "标签列表"
};

const floatingCardViewModeOrder: FloatingCardViewMode[] = ["list", "quadrant", "tag"];

function getHabitShortcutTooltipPlacement(index: number, total: number): TooltipPlacement {
  if (index < Math.min(leftAlignedHabitShortcutTooltipCount, total)) {
    return "top-start";
  }
  if (index >= total - 1) {
    return "top-end";
  }
  return "top";
}

const defaultThemePreference: ApiThemePreference = {
  themeId: defaultThemeId,
  titleColor: "app-teal",
  footerVisible: true,
  footerType: "sea",
  printButtonEnabled: false,
  floatingCardHabitCheckInEnabled: true,
  showCompletedTasks: true,
  taskViewMode: "list",
  taskCardDisplayMode: "full",
  floatingCardThemeId: defaultFloatingCardThemeId,
  floatingCardViewMode: "list",
  appCloseBehavior: "hide",
  displaySize: "default",
  visibleSidebarModules: defaultVisibleSidebarModules,
  sidebarCollapsed: false,
  fontFamily: "system"
};

function emptyDraft(): TaskDraft {
  return {
    title: "",
    notes: "",
    startAt: "",
    dueAt: getTodayEndDatetimeLocal(),
    priority: "IMPORTANT_NOT_URGENT",
    tagId: noTagSelectValue
  };
}

function draftFromTask(task: ApiTask): TaskDraft {
  return {
    title: task.title,
    notes: task.notes ?? "",
    startAt: toDatetimeLocal(task.startAt),
    dueAt: toDatetimeLocal(task.dueAt),
    priority: task.priority,
    tagId: task.tags[0]?.id ?? noTagSelectValue
  };
}

type FloatingTaskGroupView = Exclude<FloatingCardViewMode, "list">;

type FloatingTaskDragData = {
  type: "floating-task";
  taskId: string;
  view: FloatingCardViewMode;
  groupId: string;
  priority?: TaskPriority;
  tagId?: string | null;
};

type FloatingTaskGroupDropData = {
  type: "floating-task-group-drop";
  view: FloatingTaskGroupView;
  groupId: string;
  priority?: TaskPriority;
  tagId?: string | null;
};

function isFloatingTaskDragData(value: unknown): value is FloatingTaskDragData {
  return Boolean(value && typeof value === "object" && (value as FloatingTaskDragData).type === "floating-task" && typeof (value as FloatingTaskDragData).taskId === "string");
}

function isFloatingTaskGroupDropData(value: unknown): value is FloatingTaskGroupDropData {
  return Boolean(value && typeof value === "object" && (value as FloatingTaskGroupDropData).type === "floating-task-group-drop");
}

function nextFloatingCardViewMode(current: FloatingCardViewMode) {
  const index = floatingCardViewModeOrder.indexOf(current);
  return floatingCardViewModeOrder[(index + 1) % floatingCardViewModeOrder.length] ?? "list";
}

function getTagGroupId(tagId: string | null) {
  return tagId ?? otherTagGroupId;
}

interface FloatingTaskGroup {
  id: string;
  title: string;
  tasks: ApiTask[];
  view: FloatingTaskGroupView;
  priority?: TaskPriority;
  tagId?: string | null;
}

function buildQuadrantGroups(tasks: ApiTask[]): FloatingTaskGroup[] {
  return priorityOrder.map((priority) => ({
    id: priority,
    priority,
    tasks: tasks.filter((task) => task.priority === priority),
    title: priorityLabels[priority],
    view: "quadrant"
  }));
}

function buildTagGroups(tasks: ApiTask[], tags: ApiTag[]): FloatingTaskGroup[] {
  const tagGroups: FloatingTaskGroup[] = tags.map((tag) => ({
    id: tag.id,
    tagId: tag.id,
    tasks: [],
    title: tag.name,
    view: "tag"
  }));
  const otherGroup: FloatingTaskGroup = {
    id: otherTagGroupId,
    tagId: null,
    tasks: [],
    title: "其它",
    view: "tag"
  };
  const groupByTagId = new Map(tagGroups.map((group) => [group.tagId, group]));

  for (const task of tasks) {
    const firstTag = task.tags[0];
    const group = firstTag ? groupByTagId.get(firstTag.id) ?? otherGroup : otherGroup;
    group.tasks.push(task);
  }

  return [...tagGroups, otherGroup];
}

function moveTaskAcrossGroups(
  groups: Record<string, ApiTask[]>,
  groupOrder: string[],
  activeId: string,
  targetGroupId: string,
  overTaskId: string | null,
  patch: Partial<ApiTask>
) {
  let sourceGroupId = "";
  let sourceIndex = -1;
  let taskToMove: ApiTask | null = null;
  for (const groupId of groupOrder) {
    const index = (groups[groupId] ?? []).findIndex((task) => task.id === activeId);
    if (index >= 0) {
      sourceGroupId = groupId;
      sourceIndex = index;
      taskToMove = (groups[groupId] ?? [])[index] ?? null;
      break;
    }
  }

  const nextGroups = Object.fromEntries(groupOrder.map((groupId) => {
    const nextItems = (groups[groupId] ?? []).filter((task) => task.id !== activeId);
    return [groupId, nextItems];
  })) as Record<string, ApiTask[]>;

  if (!taskToMove || taskToMove.status === "COMPLETED" || !nextGroups[targetGroupId]) {
    return null;
  }

  const targetItems = nextGroups[targetGroupId];
  const targetOverTask = overTaskId ? (groups[targetGroupId] ?? []).find((task) => task.id === overTaskId) : null;
  if (targetOverTask?.status === "COMPLETED") {
    return null;
  }
  const overIndexBeforeMove = overTaskId ? (groups[targetGroupId] ?? []).findIndex((task) => task.id === overTaskId) : -1;
  let insertIndex = overTaskId ? targetItems.findIndex((task) => task.id === overTaskId) : targetItems.length;
  if (sourceGroupId === targetGroupId && sourceIndex >= 0 && overIndexBeforeMove > sourceIndex) {
    insertIndex += 1;
  }
  if (!overTaskId) {
    const firstCompletedIndex = targetItems.findIndex((task) => task.status === "COMPLETED");
    if (firstCompletedIndex >= 0) {
      insertIndex = firstCompletedIndex;
    }
  }
  targetItems.splice(insertIndex < 0 ? targetItems.length : insertIndex, 0, {
    ...taskToMove,
    ...patch
  });

  return groupOrder.flatMap((groupId) => nextGroups[groupId] ?? []);
}

interface SortableFloatingTaskProps {
  children: ReactNode;
  groupId: string;
  priority?: TaskPriority;
  task: ApiTask;
  tagId?: string | null;
  view: FloatingCardViewMode;
}

function SortableFloatingTask({ children, groupId, priority, tagId, task, view }: SortableFloatingTaskProps) {
  const sortDisabled = task.status === "COMPLETED";
  const {
    attributes,
    isDragging,
    listeners,
    setNodeRef,
    transform,
    transition
  } = useSortable({
    id: task.id,
    disabled: sortDisabled,
    data: {
      type: "floating-task",
      taskId: task.id,
      view,
      groupId,
      priority,
      tagId
    } satisfies FloatingTaskDragData
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  return (
    <div
      className={`floating-task-sortable${sortDisabled ? " is-sort-disabled" : ""}${isDragging ? " is-dragging" : ""}`}
      {...attributes}
      {...(listeners ?? {})}
      aria-disabled={sortDisabled || undefined}
      aria-label={`拖动排序${task.title}`}
      data-floating-task-id={task.id}
      ref={setNodeRef}
      style={style}
    >
      {children}
    </div>
  );
}

interface FloatingTaskGroupSectionProps {
  children: ReactNode;
  group: FloatingTaskGroup;
}

function FloatingTaskGroupSection({ children, group }: FloatingTaskGroupSectionProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: `floating-${group.view}-${group.id}`,
    data: {
      type: "floating-task-group-drop",
      view: group.view,
      groupId: group.id,
      priority: group.priority,
      tagId: group.tagId
    } satisfies FloatingTaskGroupDropData
  });

  return (
    <section className={`floating-task-group${isOver ? " is-drop-target" : ""}`} ref={setNodeRef}>
      <header className="floating-task-group-header">
        <h3>{group.title}</h3>
        <span>{group.tasks.length}</span>
      </header>
      <SortableContext items={group.tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
        <div className="floating-task-list">
          {children}
        </div>
      </SortableContext>
    </section>
  );
}

export function FloatingCard() {
  const tasks = useTaskBoardStore((state) => state.tasks);
  const tags = useTaskBoardStore((state) => state.tags);
  const setTaskSnapshot = useTaskBoardStore((state) => state.setSnapshot);
  const setTasks = useTaskBoardStore((state) => state.setTasks);
  const upsertTask = useTaskBoardStore((state) => state.upsertTask);
  const deleteTaskFromStore = useTaskBoardStore((state) => state.deleteTask);
  const taskSortSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5
      }
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const [showCompletedTasks, setShowCompletedTasks] = useState(defaultThemePreference.showCompletedTasks);
  const [taskDateFilter, setTaskDateFilter] = useState<TaskDateFilter>("all");
  const [floatingCardHabitCheckInEnabled, setFloatingCardHabitCheckInEnabled] = useState(defaultThemePreference.floatingCardHabitCheckInEnabled);
  const [taskCardDisplayMode, setTaskCardDisplayMode] = useState<TaskCardDisplayMode>(defaultThemePreference.taskCardDisplayMode);
  const [floatingCardThemeId, setFloatingCardThemeId] = useState<FloatingCardThemeId>(() => normalizeFloatingCardThemeId(localStorage.getItem("tododesk.floatingCardThemeId")));
  const [floatingCardViewMode, setFloatingCardViewMode] = useState<FloatingCardViewMode>(() => (
    floatingCardViewModeOrder.includes(localStorage.getItem("tododesk.floatingCardViewMode") as FloatingCardViewMode)
      ? localStorage.getItem("tododesk.floatingCardViewMode") as FloatingCardViewMode
      : defaultThemePreference.floatingCardViewMode
  ));
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [savingHabitId, setSavingHabitId] = useState<string | null>(null);
  const [savingPreference, setSavingPreference] = useState(false);
  const [formMode, setFormMode] = useState<FormMode | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [habits, setHabits] = useState<ApiHabit[]>([]);
  const [draft, setDraft] = useState<TaskDraft>(() => emptyDraft());

  const visibleTasks = useMemo(() => {
    return sortTasksForDisplay(
      (showCompletedTasks ? tasks : tasks.filter((task) => task.status !== "COMPLETED"))
        .filter((task) => taskMatchesDateFilter(task, taskDateFilter))
    );
  }, [showCompletedTasks, taskDateFilter, tasks]);
  const tagOptions = useMemo(() => [
    { key: noTagSelectValue, label: "不选择" },
    ...tags.map((tag) => ({ key: tag.id, label: tag.name }))
  ], [tags]);
  const quadrantGroups = useMemo(() => buildQuadrantGroups(visibleTasks), [visibleTasks]);
  const tagGroups = useMemo(() => buildTagGroups(visibleTasks, tags), [tags, visibleTasks]);
  const todayHabitShortcuts = useMemo(() => habits.filter((habit) => habit.todayPlanned), [habits]);
  const openTaskCount = useMemo(() => tasks.filter((task) => task.status !== "COMPLETED").length, [tasks]);
  const formTitle = formMode === "edit" ? "编辑待办" : "新增待办";
  const showCompletedAction = showCompletedTasks ? "隐藏已完成待办" : "显示已完成待办";
  const nextViewMode = nextFloatingCardViewMode(floatingCardViewMode);
  const switchViewAction = `切换为${floatingCardViewModeLabels[nextViewMode]}`;
  const floatingCardStyle = useMemo(() => getFloatingCardThemeStyle(floatingCardThemeId) as CSSProperties, [floatingCardThemeId]);

  function applyThemePreference(preference: ApiThemePreference) {
    const nextFloatingCardThemeId = normalizeFloatingCardThemeId(preference.floatingCardThemeId);
    setShowCompletedTasks(preference.showCompletedTasks);
    setFloatingCardHabitCheckInEnabled(preference.floatingCardHabitCheckInEnabled);
    setTaskCardDisplayMode(preference.taskCardDisplayMode);
    setFloatingCardThemeId(nextFloatingCardThemeId);
    setFloatingCardViewMode(preference.floatingCardViewMode);
    localStorage.setItem("tododesk.theme", preference.themeId);
    localStorage.setItem("tododesk.displaySize", preference.displaySize);
    localStorage.setItem("tododesk.floatingCardThemeId", nextFloatingCardThemeId);
    localStorage.setItem("tododesk.floatingCardViewMode", preference.floatingCardViewMode);
    localStorage.setItem("tododesk.fontFamily", preference.fontFamily);
    applyTheme(preference.themeId);
    applyDisplaySize(preference.displaySize);
    applyFontFamily(preference.fontFamily);
  }

  async function loadData(options: { silent?: boolean } = {}) {
    if (!options.silent) {
      setLoading(true);
    }
    setMessage("");
    try {
      const [taskPayload, tagPayload, habitPayload, preference] = await Promise.all([
        api.tasks(),
        api.tags(),
        api.habits(false),
        api.getThemePreference().catch(() => defaultThemePreference)
      ]);
      setTaskSnapshot({
        tags: tagPayload.tags,
        tasks: taskPayload.tasks
      });
      setHabits(habitPayload.habits);
      applyThemePreference(preference);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载失败");
    } finally {
      if (!options.silent) {
        setLoading(false);
      }
    }
  }

  async function loadHabitShortcuts() {
    try {
      const payload = await api.habits(false);
      setHabits(payload.habits);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "习惯加载失败");
    }
  }

  useEffect(() => {
    applyTheme(localStorage.getItem("tododesk.theme") ?? defaultThemePreference.themeId);
    applyDisplaySize(localStorage.getItem("tododesk.displaySize") ?? defaultThemePreference.displaySize);
    applyFontFamily(localStorage.getItem("tododesk.fontFamily") ?? defaultThemePreference.fontFamily);
    void loadData();
  }, []);

  useEffect(() => {
    return listenDesktopSyncEvents((event) => {
      if (event.type === "task:upserted") {
        useTaskBoardStore.getState().upsertTask(event.task);
        return;
      }
      if (event.type === "task:deleted") {
        useTaskBoardStore.getState().deleteTask(event.taskId);
        return;
      }
      if (event.type === "preference:changed") {
        applyThemePreference(event.preference);
        return;
      }
      if (event.type === "task-board:reload-requested") {
        void loadData({ silent: true });
        return;
      }
      if (event.type === "habit-board:reload-requested") {
        void loadHabitShortcuts();
      }
    });
  }, []);

  function updateDraft(patch: Partial<TaskDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  useEffect(() => {
    setDraft((current) => (
      current.tagId !== noTagSelectValue && !tags.some((tag) => tag.id === current.tagId)
        ? { ...current, tagId: noTagSelectValue }
        : current
    ));
  }, [tags]);

  function beginCreate() {
    setMessage("");
    setEditingTaskId(null);
    setDraft(emptyDraft());
    setFormMode("create");
  }

  function beginEdit(task: ApiTask) {
    setMessage("");
    setEditingTaskId(task.id);
    setDraft(draftFromTask(task));
    setFormMode("edit");
  }

  function cancelForm() {
    setMessage("");
    setEditingTaskId(null);
    setDraft(emptyDraft());
    setFormMode(null);
  }

  async function submitDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = draft.title.trim();
    if (!title) {
      setMessage("请输入待办标题");
      return;
    }
    if (!isValidTaskTimeRange(draft.startAt, draft.dueAt)) {
      setMessage("开始时间不能晚于截止时间");
      return;
    }

    setSavingTaskId("form");
    setMessage("");
    try {
      if (formMode === "edit" && editingTaskId) {
        const input: UpdateTaskRequest = {
          title,
          notes: draft.notes.trim() || null,
          startAt: datetimeLocalToIso(draft.startAt),
          dueAt: datetimeLocalToIso(draft.dueAt),
          priority: draft.priority,
          tagId: draft.tagId === noTagSelectValue ? null : draft.tagId
        };
        const payload = await api.updateTask(editingTaskId, input);
        upsertTask(payload.task);
        void emitDesktopSyncEvent({ type: "task:upserted", task: payload.task });
      } else {
        const input: CreateTaskRequest = {
          title,
          notes: draft.notes.trim() || null,
          startAt: datetimeLocalToIso(draft.startAt),
          dueAt: datetimeLocalToIso(draft.dueAt),
          priority: draft.priority,
          status: "TODO",
          tagId: draft.tagId === noTagSelectValue ? null : draft.tagId,
          recurrenceRule: null
        };
        const payload = await api.createTask(input);
        upsertTask(payload.task);
        void emitDesktopSyncEvent({ type: "task:upserted", task: payload.task });
      }
      cancelForm();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : formMode === "edit" ? "编辑失败" : "创建失败");
    } finally {
      setSavingTaskId((current) => (current === "form" ? null : current));
    }
  }

  async function setTaskStatus(task: ApiTask, status: TaskStatus) {
    setSavingTaskId(task.id);
    setMessage("");
    try {
      const payload = await api.updateTask(task.id, { status });
      upsertTask(payload.task);
      void emitDesktopSyncEvent({ type: "task:upserted", task: payload.task });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : status === "COMPLETED" ? "完成失败" : "重置失败");
    } finally {
      setSavingTaskId((current) => (current === task.id ? null : current));
    }
  }

  async function deleteTask(task: ApiTask) {
    setSavingTaskId(task.id);
    setMessage("");
    try {
      await api.deleteTask(task.id);
      deleteTaskFromStore(task.id);
      void emitDesktopSyncEvent({ type: "task:deleted", taskId: task.id });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除失败");
    } finally {
      setSavingTaskId((current) => (current === task.id ? null : current));
    }
  }

  async function toggleHabitToday(habit: ApiHabit) {
    const today = toLocalDateKey();
    setSavingHabitId(habit.id);
    setMessage("");
    try {
      if (habit.todayChecked) {
        await api.cancelHabitCheckIn(habit.id, today);
      } else {
        await api.checkInHabit(habit.id, today);
      }
      await loadHabitShortcuts();
      void emitDesktopSyncEvent({ type: "habit-board:reload-requested" });
    } catch {
      setMessage("习惯打卡失败");
    } finally {
      setSavingHabitId((current) => (current === habit.id ? null : current));
    }
  }

  async function persistTaskOrder(nextTasks: ApiTask[], update?: { id: string; input: UpdateTaskRequest }) {
    const previousTasks = tasks;
    setTasks(nextTasks);
    setSavingTaskId(update?.id ?? "task-order");
    setMessage("");
    try {
      if (update) {
        const payload = await api.updateTask(update.id, update.input);
        upsertTask(payload.task);
        void emitDesktopSyncEvent({ type: "task:upserted", task: payload.task });
      }
      await api.updateTaskOrder({ orderedIds: taskOrderIds(nextTasks) });
      void emitDesktopSyncEvent({ type: "task-board:reload-requested" });
    } catch (error) {
      setTasks(previousTasks);
      setMessage(error instanceof Error ? error.message : "排序保存失败");
    } finally {
      setSavingTaskId((current) => (current === (update?.id ?? "task-order") ? null : current));
    }
  }

  function handleTaskSortDragStart(event: DragStartEvent) {
    const activeData = event.active.data.current;
    if (isFloatingTaskDragData(activeData)) {
      setDraggingTaskId(activeData.taskId);
    }
  }

  function handleTaskSortDragCancel() {
    setDraggingTaskId(null);
  }

  function handleTaskSortDragEnd(event: DragEndEvent) {
    setDraggingTaskId(null);
    const activeData = event.active.data.current;
    const overData = event.over?.data.current;
    if (!isFloatingTaskDragData(activeData) || !isFloatingTaskDragData(overData)) {
      return;
    }
    if (activeData.view !== "list") {
      return;
    }
    const nextVisibleTasks = moveTaskInList(visibleTasks, activeData.taskId, overData.taskId);
    if (!nextVisibleTasks) {
      return;
    }

    void persistTaskOrder(applyVisibleTaskOrder(tasks, visibleTasks, nextVisibleTasks));
  }

  function handleGroupedTaskSortDragEnd(event: DragEndEvent) {
    setDraggingTaskId(null);
    const activeData = event.active.data.current;
    const overData = event.over?.data.current;
    if (!isFloatingTaskDragData(activeData) || !overData) {
      return;
    }

    if (activeData.view === "quadrant") {
      const targetPriority = isFloatingTaskDragData(overData) && overData.view === "quadrant"
        ? overData.priority
        : isFloatingTaskGroupDropData(overData) && overData.view === "quadrant" ? overData.priority : undefined;
      if (!targetPriority) {
        return;
      }
      const overTaskId = isFloatingTaskDragData(overData) ? overData.taskId : null;
      const groups = Object.fromEntries(quadrantGroups.map((group) => [group.id, group.tasks])) as Record<string, ApiTask[]>;
      const groupOrder = quadrantGroups.map((group) => group.id);
      const nextVisibleTasks = moveTaskAcrossGroups(groups, groupOrder, activeData.taskId, targetPriority, overTaskId, { priority: targetPriority });
      if (!nextVisibleTasks) {
        return;
      }
      const update = activeData.priority !== targetPriority
        ? { id: activeData.taskId, input: { priority: targetPriority } satisfies UpdateTaskRequest }
        : undefined;
      void persistTaskOrder(applyVisibleTaskOrder(tasks, visibleTasks, nextVisibleTasks), update);
      return;
    }

    if (activeData.view === "tag") {
      const targetTagId = isFloatingTaskDragData(overData) && overData.view === "tag"
        ? overData.tagId ?? null
        : isFloatingTaskGroupDropData(overData) && overData.view === "tag" ? overData.tagId ?? null : undefined;
      if (targetTagId === undefined) {
        return;
      }
      const targetGroupId = getTagGroupId(targetTagId);
      const overTaskId = isFloatingTaskDragData(overData) ? overData.taskId : null;
      const groups = Object.fromEntries(tagGroups.map((group) => [group.id, group.tasks])) as Record<string, ApiTask[]>;
      const groupOrder = tagGroups.map((group) => group.id);
      const nextTags = targetTagId ? tags.filter((tag) => tag.id === targetTagId).slice(0, 1) : [];
      const nextVisibleTasks = moveTaskAcrossGroups(groups, groupOrder, activeData.taskId, targetGroupId, overTaskId, { tags: nextTags });
      if (!nextVisibleTasks) {
        return;
      }
      const update = activeData.tagId !== targetTagId
        ? { id: activeData.taskId, input: { tagId: targetTagId } satisfies UpdateTaskRequest }
        : undefined;
      void persistTaskOrder(applyVisibleTaskOrder(tasks, visibleTasks, nextVisibleTasks), update);
    }
  }

  async function toggleShowCompletedTasks(next: boolean) {
    setShowCompletedTasks(next);
    setSavingPreference(true);
    setMessage("");
    try {
      const preference = await api.setThemePreference({ showCompletedTasks: next });
      applyThemePreference(preference);
      void emitDesktopSyncEvent({ type: "preference:changed", preference });
    } catch (error) {
      setShowCompletedTasks(!next);
      setMessage(error instanceof Error ? error.message : "待办显示配置保存失败");
    } finally {
      setSavingPreference(false);
    }
  }

  async function toggleFloatingCardViewMode() {
    const previous = floatingCardViewMode;
    const next = nextFloatingCardViewMode(previous);
    setFloatingCardViewMode(next);
    setSavingPreference(true);
    setMessage("");
    try {
      const preference = await api.setThemePreference({ floatingCardViewMode: next });
      applyThemePreference(preference);
      void emitDesktopSyncEvent({ type: "preference:changed", preference });
    } catch (error) {
      setFloatingCardViewMode(previous);
      setMessage(error instanceof Error ? error.message : "固定卡片视图保存失败");
    } finally {
      setSavingPreference(false);
    }
  }

  function renderViewModeIcon() {
    if (floatingCardViewMode === "quadrant") {
      return <LayoutGrid size={16} />;
    }
    if (floatingCardViewMode === "tag") {
      return <Tags size={16} />;
    }
    return <List size={16} />;
  }

  function renderFloatingTask(task: ApiTask, options: { groupId: string; priority?: TaskPriority; showTagMeta: boolean; tagId?: string | null; view: FloatingCardViewMode }) {
    const isCompleted = task.status === "COMPLETED";
    const isOverdue = isTaskOverdue(task);
    const titleOnly = taskCardDisplayMode === "title";
    const statusAction = isCompleted ? "重置为未完成" : "完成";
    const nextStatus: TaskStatus = isCompleted ? "TODO" : "COMPLETED";
    const dueAtLabel = formatTaskTimeRange({ startAt: task.startAt, dueAt: task.dueAt });
    const recurrenceLabel = task.recurrenceRule?.frequency ?? null;
    const tagMeta = options.showTagMeta ? task.tags.map((tag) => <span key={tag.id}>#{tag.name}</span>) : null;
    const fullContent = (
      <div className="floating-task-tooltip-content">
        <strong className={isOverdue ? "is-overdue" : undefined}>{task.title}</strong>
        <p>{task.notes || "无备注"}</p>
        <div className="floating-task-tooltip-meta">
          <span>{priorityLabels[task.priority]}</span>
          <span>{dueAtLabel}</span>
          {recurrenceLabel ? <span>{recurrenceLabel}</span> : null}
          <span>{task.pomodoroCompletedCount} 个番茄</span>
          {tagMeta}
        </div>
      </div>
    );
    const copy = (
      <div className="floating-task-copy">
        <strong className="floating-task-title">{task.title}</strong>
        {titleOnly ? null : (
          <>
            <div className="floating-task-meta">
              <span>{priorityLabels[task.priority]}</span>
              <span>{dueAtLabel}</span>
              {tagMeta}
            </div>
            {task.notes ? <p className="floating-task-notes">{task.notes}</p> : null}
          </>
        )}
      </div>
    );

    return (
      <SortableFloatingTask
        groupId={options.groupId}
        key={task.id}
        priority={options.priority}
        tagId={options.tagId}
        task={task}
        view={options.view}
      >
        <Card className={`floating-task${isCompleted ? " is-completed" : ""}${isOverdue ? " is-overdue" : ""}${titleOnly ? " is-title-only" : ""}`} pattern="default">
          <button
            aria-checked={isCompleted}
            aria-label={statusAction}
            className="floating-task-checkbox"
            disabled={savingTaskId === task.id}
            role="checkbox"
            title={statusAction}
            type="button"
            onClick={() => void setTaskStatus(task, nextStatus)}
          >
            {isCompleted ? <Check size={14} /> : null}
          </button>
          {titleOnly ? (
            <Tooltip className="floating-task-tooltip" placement="top-start" title={fullContent} trigger="hover" variant="default">
              {copy}
            </Tooltip>
          ) : copy}
          <div className="floating-task-actions">
            <Button
              aria-label="编辑"
              disabled={savingTaskId === task.id}
              icon={<Pencil size={15} />}
              size="small"
              title="编辑"
              type="default"
              onClick={() => beginEdit(task)}
            />
            <Button
              aria-label="删除"
              disabled={savingTaskId === task.id}
              icon={<Trash2 size={15} />}
              size="small"
              title="删除"
              type="default"
              onClick={() => void deleteTask(task)}
            />
          </div>
        </Card>
      </SortableFloatingTask>
    );
  }

  function renderGroupedTaskView(groups: FloatingTaskGroup[]) {
    const visibleGroups = groups.filter((group) => group.tasks.length > 0 || draggingTaskId);
    return (
      <DndContext
        collisionDetection={closestCenter}
        sensors={taskSortSensors}
        onDragCancel={handleTaskSortDragCancel}
        onDragEnd={handleGroupedTaskSortDragEnd}
        onDragStart={handleTaskSortDragStart}
      >
        <section className={`floating-task-group-list is-${floatingCardViewMode}`} aria-busy={loading}>
          {visibleTasks.length === 0 && !loading ? <Card className="empty-state" type="dashed">暂无待办</Card> : null}
          {visibleGroups.map((group) => (
            <FloatingTaskGroupSection group={group} key={group.id}>
              {group.tasks.length === 0 ? <div className="floating-task-group-empty" aria-hidden="true" /> : null}
              {group.tasks.map((task) => renderFloatingTask(task, {
                groupId: group.id,
                priority: group.priority,
                showTagMeta: group.view !== "tag",
                tagId: group.tagId,
                view: group.view
              }))}
            </FloatingTaskGroupSection>
          ))}
        </section>
      </DndContext>
    );
  }

  function renderDefaultTaskList() {
    return (
      <DndContext
        collisionDetection={closestCenter}
        sensors={taskSortSensors}
        onDragCancel={handleTaskSortDragCancel}
        onDragEnd={handleTaskSortDragEnd}
        onDragStart={handleTaskSortDragStart}
      >
        <SortableContext items={visibleTasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
          <section className="floating-task-list" aria-busy={loading}>
            {visibleTasks.length === 0 && !loading ? <Card className="empty-state" type="dashed">暂无待办</Card> : null}
            {visibleTasks.map((task) => renderFloatingTask(task, {
              groupId: "list",
              showTagMeta: true,
              view: "list"
            }))}
          </section>
        </SortableContext>
      </DndContext>
    );
  }

  function renderHabitShortcut(habit: ApiHabit, index: number, shortcuts: ApiHabit[]) {
    const Icon = getHabitIcon(habit.icon);
    const actionLabel = habit.todayChecked ? `取消打卡 ${habit.title}` : `打卡 ${habit.title}`;
    const placement = getHabitShortcutTooltipPlacement(index, shortcuts.length);
    return (
      <Tooltip className="floating-habit-shortcut-tooltip" key={habit.id} placement={placement} title={actionLabel} trigger="hover" variant="default">
        <button
          aria-label={actionLabel}
          aria-pressed={habit.todayChecked}
          className={`floating-habit-shortcut color-${habit.color}${habit.todayChecked ? " is-checked" : ""}`}
          disabled={savingHabitId === habit.id}
          title={actionLabel}
          type="button"
          onClick={() => void toggleHabitToday(habit)}
        >
          <Icon size={16} strokeWidth={2.4} />
        </button>
      </Tooltip>
    );
  }

  return (
    <div className="floating-card" style={floatingCardStyle}>
      <FloatingWindowHeader geometryStorageKey={floatingTaskWindowGeometryStorageKey} />
      <div className="floating-toolbar">
        <Button className="floating-toolbar-primary" icon={<Plus size={15} />} size="small" type="default" onClick={beginCreate}>
          新增
        </Button>
        <Button
          aria-label={switchViewAction}
          className="floating-view-mode-button"
          disabled={savingPreference}
          icon={renderViewModeIcon()}
          loading={savingPreference}
          size="small"
          title={switchViewAction}
          type="default"
          onClick={() => void toggleFloatingCardViewMode()}
        />
        <Button
          aria-label={showCompletedAction}
          disabled={savingPreference}
          icon={showCompletedTasks ? <Eye size={15} /> : <EyeOff size={15} />}
          loading={savingPreference}
          size="small"
          title={showCompletedAction}
          onClick={() => void toggleShowCompletedTasks(!showCompletedTasks)}
        />
        <Button
          aria-label="刷新待办"
          icon={<RefreshCw size={15} />}
          loading={loading}
          size="small"
          title="刷新待办"
          type="default"
          onClick={() => void loadData()}
        />
      </div>
      <main>
        <div className="floating-summary">
          <span>{openTaskCount} 个未完成</span>
          {showCompletedTasks ? <span>含已完成</span> : <span>仅未完成</span>}
          <label className="floating-date-filter">
            <span>日期</span>
            <Select aria-label="日期" value={taskDateFilter} onChange={(next) => setTaskDateFilter(next as TaskDateFilter)} options={taskDateFilterOptions} />
          </label>
        </div>

        {formMode ? (
          <form className="task-form floating-task-form" onSubmit={submitDraft}>
            <header>
              <strong>{formTitle}</strong>
              <Button aria-label="取消" htmlType="button" icon={<X size={14} />} size="small" title="取消" type="text" onClick={cancelForm} />
            </header>
            <label>
              <span>标题</span>
              <Input value={draft.title} onChange={(event) => updateDraft({ title: event.target.value })} required maxLength={160} allowClear shadow />
            </label>
            <label>
              <span>备注</span>
              <textarea value={draft.notes} onChange={(event) => updateDraft({ notes: event.target.value })} rows={3} />
            </label>
            <div className="floating-form-grid">
              <TaskTimeRangePicker
                value={{ startAt: draft.startAt, dueAt: draft.dueAt }}
                variant="floating"
                onChange={(next) => updateDraft(next)}
              />
              <label>
                <span>优先级</span>
                <Select value={draft.priority} onChange={(next) => updateDraft({ priority: next as TaskPriority })} options={priorityOptions} />
              </label>
            </div>
            <label>
              <span>标签</span>
              <Select value={draft.tagId} onChange={(next) => updateDraft({ tagId: next })} options={tagOptions} />
            </label>
            <Button block htmlType="submit" icon={<Save size={15} />} loading={savingTaskId === "form"} type="primary">
              保存
            </Button>
          </form>
        ) : null}

        {message ? <div className="inline-alert">{message}</div> : null}

        {floatingCardViewMode === "list" ? renderDefaultTaskList() : renderGroupedTaskView(floatingCardViewMode === "quadrant" ? quadrantGroups : tagGroups)}
      </main>
      {floatingCardHabitCheckInEnabled && todayHabitShortcuts.length > 0 ? (
        <div className="floating-habit-shortcuts" aria-label="今日习惯快捷打卡">
          {todayHabitShortcuts.map(renderHabitShortcut)}
        </div>
      ) : null}
    </div>
  );
}
