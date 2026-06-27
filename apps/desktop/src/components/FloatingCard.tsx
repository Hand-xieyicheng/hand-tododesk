import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, FormEvent, ReactNode } from "react";
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, type DragEndEvent, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { defaultThemeId, defaultVisibleSidebarModules, sortTasksForDisplay, type ApiTag, type ApiTask, type ApiThemePreference, type CreateTaskRequest, type FloatingCardThemeId, type TaskCardDisplayMode, type TaskPriority, type TaskStatus, type UpdateTaskRequest } from "@todo/shared";
import { Button, Card, Input, Select, Tooltip } from "animal-island-ui";
import { Check, Eye, EyeOff, Pencil, Plus, RefreshCw, Save, X } from "lucide-react";
import { api } from "../api/client";
import { emitDesktopSyncEvent, listenDesktopSyncEvents } from "../lib/desktopSync";
import { applyDisplaySize } from "../lib/displaySize";
import { getTodayEndDatetimeLocal, toDatetimeLocal } from "../lib/datetime";
import { defaultFloatingCardThemeId, getFloatingCardThemeStyle, normalizeFloatingCardThemeId } from "../lib/floatingCardThemes";
import { applyFontFamily } from "../lib/fonts";
import { applyVisibleTaskOrder, moveTaskInList, taskOrderIds } from "../lib/taskOrdering";
import { applyTheme } from "../lib/themes";
import { useTaskBoardStore } from "../stores/taskBoardStore";
import { FloatingWindowHeader } from "./FloatingWindowHeader";

type FormMode = "create" | "edit";

interface TaskDraft {
  title: string;
  notes: string;
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

const defaultThemePreference: ApiThemePreference = {
  themeId: defaultThemeId,
  titleColor: "app-teal",
  footerVisible: true,
  footerType: "sea",
  showCompletedTasks: true,
  taskViewMode: "list",
  taskCardDisplayMode: "full",
  floatingCardThemeId: defaultFloatingCardThemeId,
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
    dueAt: getTodayEndDatetimeLocal(),
    priority: "IMPORTANT_NOT_URGENT",
    tagId: noTagSelectValue
  };
}

function draftFromTask(task: ApiTask): TaskDraft {
  return {
    title: task.title,
    notes: task.notes ?? "",
    dueAt: toDatetimeLocal(task.dueAt),
    priority: task.priority,
    tagId: task.tags[0]?.id ?? noTagSelectValue
  };
}

function dueAtToIso(value: string) {
  return value ? new Date(value).toISOString() : null;
}

type FloatingTaskDragData = {
  type: "floating-task";
  taskId: string;
};

function isFloatingTaskDragData(value: unknown): value is FloatingTaskDragData {
  return Boolean(value && typeof value === "object" && (value as FloatingTaskDragData).type === "floating-task" && typeof (value as FloatingTaskDragData).taskId === "string");
}

interface SortableFloatingTaskProps {
  children: ReactNode;
  task: ApiTask;
}

function SortableFloatingTask({ children, task }: SortableFloatingTaskProps) {
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
      taskId: task.id
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

export function FloatingCard() {
  const tasks = useTaskBoardStore((state) => state.tasks);
  const tags = useTaskBoardStore((state) => state.tags);
  const setTaskSnapshot = useTaskBoardStore((state) => state.setSnapshot);
  const setTasks = useTaskBoardStore((state) => state.setTasks);
  const upsertTask = useTaskBoardStore((state) => state.upsertTask);
  const taskSortSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5
      }
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const [showCompletedTasks, setShowCompletedTasks] = useState(defaultThemePreference.showCompletedTasks);
  const [taskCardDisplayMode, setTaskCardDisplayMode] = useState<TaskCardDisplayMode>(defaultThemePreference.taskCardDisplayMode);
  const [floatingCardThemeId, setFloatingCardThemeId] = useState<FloatingCardThemeId>(() => normalizeFloatingCardThemeId(localStorage.getItem("tododesk.floatingCardThemeId")));
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [savingPreference, setSavingPreference] = useState(false);
  const [formMode, setFormMode] = useState<FormMode | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TaskDraft>(() => emptyDraft());

  const visibleTasks = useMemo(() => {
    return sortTasksForDisplay(showCompletedTasks ? tasks : tasks.filter((task) => task.status !== "COMPLETED"));
  }, [showCompletedTasks, tasks]);
  const tagOptions = useMemo(() => [
    { key: noTagSelectValue, label: "不选择" },
    ...tags.map((tag) => ({ key: tag.id, label: tag.name }))
  ], [tags]);
  const openTaskCount = useMemo(() => tasks.filter((task) => task.status !== "COMPLETED").length, [tasks]);
  const formTitle = formMode === "edit" ? "编辑待办" : "新增待办";
  const showCompletedAction = showCompletedTasks ? "隐藏已完成待办" : "显示已完成待办";
  const floatingCardStyle = useMemo(() => getFloatingCardThemeStyle(floatingCardThemeId) as CSSProperties, [floatingCardThemeId]);

  function applyThemePreference(preference: ApiThemePreference) {
    const nextFloatingCardThemeId = normalizeFloatingCardThemeId(preference.floatingCardThemeId);
    setShowCompletedTasks(preference.showCompletedTasks);
    setTaskCardDisplayMode(preference.taskCardDisplayMode);
    setFloatingCardThemeId(nextFloatingCardThemeId);
    localStorage.setItem("tododesk.theme", preference.themeId);
    localStorage.setItem("tododesk.displaySize", preference.displaySize);
    localStorage.setItem("tododesk.floatingCardThemeId", nextFloatingCardThemeId);
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
      const [taskPayload, tagPayload, preference] = await Promise.all([
        api.tasks(),
        api.tags(),
        api.getThemePreference().catch(() => defaultThemePreference)
      ]);
      setTaskSnapshot({
        tags: tagPayload.tags,
        tasks: taskPayload.tasks
      });
      applyThemePreference(preference);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载失败");
    } finally {
      if (!options.silent) {
        setLoading(false);
      }
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

    setSavingTaskId("form");
    setMessage("");
    try {
      if (formMode === "edit" && editingTaskId) {
        const input: UpdateTaskRequest = {
          title,
          notes: draft.notes.trim() || null,
          dueAt: dueAtToIso(draft.dueAt),
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
          dueAt: dueAtToIso(draft.dueAt),
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

  async function persistTaskOrder(nextTasks: ApiTask[]) {
    const previousTasks = tasks;
    setTasks(nextTasks);
    setSavingTaskId("task-order");
    setMessage("");
    try {
      await api.updateTaskOrder({ orderedIds: taskOrderIds(nextTasks) });
      void emitDesktopSyncEvent({ type: "task-board:reload-requested" });
    } catch (error) {
      setTasks(previousTasks);
      setMessage(error instanceof Error ? error.message : "排序保存失败");
    } finally {
      setSavingTaskId((current) => (current === "task-order" ? null : current));
    }
  }

  function handleTaskSortDragEnd(event: DragEndEvent) {
    const activeData = event.active.data.current;
    const overData = event.over?.data.current;
    if (!isFloatingTaskDragData(activeData) || !isFloatingTaskDragData(overData)) {
      return;
    }
    const nextVisibleTasks = moveTaskInList(visibleTasks, activeData.taskId, overData.taskId);
    if (!nextVisibleTasks) {
      return;
    }

    void persistTaskOrder(applyVisibleTaskOrder(tasks, visibleTasks, nextVisibleTasks));
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

  return (
    <div className="floating-card" style={floatingCardStyle}>
      <FloatingWindowHeader />
      <div className="floating-toolbar">
        <Button className="floating-toolbar-primary" icon={<Plus size={15} />} size="small" type="default" onClick={beginCreate}>
          新增
        </Button>
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
              <label>
                <span>截止时间</span>
                <Input value={draft.dueAt} onChange={(event) => updateDraft({ dueAt: event.target.value })} type="datetime-local" shadow />
              </label>
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

        <DndContext collisionDetection={closestCenter} sensors={taskSortSensors} onDragEnd={handleTaskSortDragEnd}>
          <SortableContext items={visibleTasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
            <section className="floating-task-list" aria-busy={loading}>
              {visibleTasks.length === 0 && !loading ? <Card className="empty-state" type="dashed">暂无待办</Card> : null}
              {visibleTasks.map((task) => {
                const isCompleted = task.status === "COMPLETED";
                const titleOnly = taskCardDisplayMode === "title";
                const statusAction = isCompleted ? "重置为未完成" : "完成";
                const nextStatus: TaskStatus = isCompleted ? "TODO" : "COMPLETED";
                const dueAtLabel = task.dueAt ? new Date(task.dueAt).toLocaleString() : "无截止时间";
                const recurrenceLabel = task.recurrenceRule?.frequency ?? null;
                const fullContent = (
                  <div className="floating-task-tooltip-content">
                    <strong>{task.title}</strong>
                    <p>{task.notes || "无备注"}</p>
                    <div className="floating-task-tooltip-meta">
                      <span>{priorityLabels[task.priority]}</span>
                      <span>{dueAtLabel}</span>
                      {recurrenceLabel ? <span>{recurrenceLabel}</span> : null}
                      <span>{task.pomodoroCompletedCount} 个番茄</span>
                      {task.tags.map((tag) => <span key={tag.id}>#{tag.name}</span>)}
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
                          {task.tags.map((tag) => <span key={tag.id}>#{tag.name}</span>)}
                        </div>
                        {task.notes ? <p className="floating-task-notes">{task.notes}</p> : null}
                      </>
                    )}
                  </div>
                );

                return (
                  <SortableFloatingTask key={task.id} task={task}>
                    <Card className={`${isCompleted ? "floating-task is-completed" : "floating-task"}${titleOnly ? " is-title-only" : ""}`} pattern="default">
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
                      </div>
                    </Card>
                  </SortableFloatingTask>
                );
              })}
            </section>
          </SortableContext>
        </DndContext>
      </main>
    </div>
  );
}
