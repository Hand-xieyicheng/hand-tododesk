import { type CSSProperties, type FormEvent, type KeyboardEvent, type PointerEvent, type ReactNode, type WheelEvent, useEffect, useMemo, useRef, useState } from "react";
import { closestCenter, DndContext, DragOverlay, KeyboardSensor, PointerSensor, type DragEndEvent, type DragStartEvent, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { sortTasksForDisplay, type ApiTag, type ApiTask, type CreateTaskRequest, type TaskCardDisplayMode, type TaskPriority, type TaskStatus, type TaskViewMode } from "@todo/shared";
import { Button, Card, Divider, Input, Modal, Select } from "animal-island-ui";
import { Check, Pencil, Plus, RotateCcw, Save, Trash2, X } from "lucide-react";
import { api } from "../api/client";
import { getTodayEndDatetimeLocal } from "../lib/datetime";
import { ConfirmDialog } from "./ConfirmDialog";

interface TaskPanelProps {
  createOpen: boolean;
  showCompletedTasks: boolean;
  tags: ApiTag[];
  taskCardDisplayMode: TaskCardDisplayMode;
  tagMaintenanceOpen: boolean;
  taskTagFilter: string;
  tasks: ApiTask[];
  viewMode: TaskViewMode;
  onChanged(): Promise<void>;
  onCreateOpenChange(open: boolean): void;
  onPanelMessageChange?(message: string): void;
  onTagMaintenanceOpenChange(open: boolean): void;
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

const statusLabels: Record<TaskStatus, string> = {
  ARCHIVED: "已归档",
  COMPLETED: "已完成",
  IN_PROGRESS: "进行中",
  TODO: "未完成"
};

const recurrenceFrequencyLabels: Record<string, string> = {
  DAILY: "每天",
  MONTHLY: "每月",
  WEEKLY: "每周",
  YEARLY: "每年"
};

const quadrantMeta: Record<TaskPriority, { title: string; hint: string }> = {
  IMPORTANT_URGENT: { title: "重要且紧急", hint: "马上处理" },
  IMPORTANT_NOT_URGENT: { title: "重要不紧急", hint: "安排时间" },
  NOT_IMPORTANT_URGENT: { title: "不重要但紧急", hint: "快速推进" },
  NOT_IMPORTANT_NOT_URGENT: { title: "不重要不紧急", hint: "稍后再看" }
};

const repeatOptions = [
  { key: "NONE", label: "不重复" },
  { key: "DAILY", label: "每天" },
  { key: "WEEKLY", label: "每周" },
  { key: "MONTHLY", label: "每月" }
];

const noTagSelectValue = "__none__";
const allTagsFilterValue = "__all__";
const untaggedTagsFilterValue = "__untagged__";
const kanbanDragThresholdPx = 5;
const kanbanColumnDropIdPrefix = "kanban-column:";

type KanbanTaskDragData = {
  type: "kanban-task";
  taskId: string;
  sourceTagId: string | null;
};

type KanbanColumnDropData = {
  type: "kanban-column";
  tagId: string | null;
};

type KanbanDragState = {
  pointerId: number;
  startX: number;
  scrollLeft: number;
  dragging: boolean;
};

function emptyQuadrants() {
  const quadrants = {} as Record<TaskPriority, ApiTask[]>;
  for (const priority of priorityOrder) {
    quadrants[priority] = [];
  }
  return quadrants;
}

function priorityClass(priority: TaskPriority) {
  return priority.toLowerCase().replaceAll("_", "-");
}

function getDueAtLabel(task: ApiTask) {
  return task.dueAt ? new Date(task.dueAt).toLocaleString() : "无截止时间";
}

function getRecurrenceLabel(task: ApiTask) {
  const frequency = task.recurrenceRule?.frequency;
  return frequency ? recurrenceFrequencyLabels[frequency] ?? frequency : null;
}

function getTaskMetaItems(task: ApiTask) {
  return [
    getDueAtLabel(task),
    getRecurrenceLabel(task),
    `${task.pomodoroCompletedCount} 个番茄`,
    ...task.tags.map((tag) => `#${tag.name}`)
  ].filter((item): item is string => Boolean(item));
}

function taskMatchesTagFilter(task: ApiTask, filter: string) {
  if (filter === allTagsFilterValue) {
    return true;
  }
  if (filter === untaggedTagsFilterValue) {
    return task.tags.length === 0;
  }
  return task.tags.some((tag) => tag.id === filter);
}

function closestElement(target: EventTarget | null, selector: string) {
  return target instanceof Element ? target.closest(selector) : null;
}

function isKanbanDragIgnoredTarget(target: EventTarget | null) {
  return Boolean(closestElement(target, "button, a, input, textarea, select, [role='button'], .task-item, .kanban-task-draggable"));
}

function getKanbanColumnDropId(columnId: string) {
  return `${kanbanColumnDropIdPrefix}${columnId}`;
}

function isKanbanTaskDragData(value: unknown): value is KanbanTaskDragData {
  return Boolean(value && typeof value === "object" && (value as KanbanTaskDragData).type === "kanban-task" && typeof (value as KanbanTaskDragData).taskId === "string");
}

function isKanbanColumnDropData(value: unknown): value is KanbanColumnDropData {
  return Boolean(value && typeof value === "object" && (value as KanbanColumnDropData).type === "kanban-column");
}

function getKanbanTaskDragWidth(taskId: string) {
  const element = [...document.querySelectorAll<HTMLElement>(".kanban-task-draggable")]
    .find((item) => item.dataset.kanbanTaskId === taskId);
  const width = element?.getBoundingClientRect().width ?? 0;
  return Number.isFinite(width) && width > 0 ? width : null;
}

interface KanbanColumn {
  id: string;
  title: string;
  tagId: string | null;
  tasks: ApiTask[];
}

function buildKanbanColumns(tasks: ApiTask[], tags: ApiTag[], showCompletedTasks: boolean): KanbanColumn[] {
  const untaggedColumn: KanbanColumn = {
    id: untaggedTagsFilterValue,
    title: "其它",
    tagId: null,
    tasks: []
  };
  const tagColumns: KanbanColumn[] = tags.map((tag) => ({
    id: tag.id,
    title: tag.name,
    tagId: tag.id,
    tasks: []
  }));
  const columns = [untaggedColumn, ...tagColumns];
  const columnByTagId = new Map(tagColumns.map((column) => [column.tagId, column]));
  const sourceTasks = showCompletedTasks ? tasks : tasks.filter((task) => task.status !== "COMPLETED");

  for (const task of sourceTasks) {
    const firstTag = task.tags[0];
    const column = firstTag ? columnByTagId.get(firstTag.id) ?? untaggedColumn : untaggedColumn;
    column.tasks.push(task);
  }

  return columns.map((column) => ({
    ...column,
    tasks: sortTasksForDisplay(column.tasks)
  }));
}

interface TaskDetailModalProps {
  task: ApiTask | null;
  onClose(): void;
}

function TaskDetailModal({ task, onClose }: TaskDetailModalProps) {
  if (!task) {
    return null;
  }

  const metaItems = getTaskMetaItems(task);

  return (
    <Modal
      className="task-detail-modal"
      open
      title="待办详情"
      width={560}
      footer={null}
      typewriter={false}
      onClose={onClose}
    >
      <div className={`task-detail-content priority-${priorityClass(task.priority)}`}>
        <div className="task-detail-status-row">
          <span>{priorityLabels[task.priority]}</span>
          <span>{statusLabels[task.status]}</span>
        </div>
        <h2>{task.title}</h2>
        <section className="task-detail-section">
          <span>备注</span>
          <p>{task.notes || "无备注"}</p>
        </section>
        <div className="task-detail-meta">
          {metaItems.map((item) => <span key={item}>{item}</span>)}
        </div>
      </div>
    </Modal>
  );
}

interface TaskCardProps {
  task: ApiTask;
  compact?: boolean;
  displayMode: TaskCardDisplayMode;
  onDelete(task: ApiTask): Promise<void>;
  onOpenDetails(task: ApiTask): void;
  onSetStatus(task: ApiTask, status: TaskStatus): Promise<void>;
}

function TaskCard({ task, compact, displayMode, onDelete, onOpenDetails, onSetStatus }: TaskCardProps) {
  const isCompleted = task.status === "COMPLETED";
  const titleOnly = displayMode === "title";
  const statusAction = isCompleted ? "恢复为未完成" : "完成";
  const nextStatus: TaskStatus = isCompleted ? "TODO" : "COMPLETED";
  const dueAtLabel = getDueAtLabel(task);
  const recurrenceLabel = getRecurrenceLabel(task);

  function openDetails() {
    onOpenDetails(task);
  }

  function handleCopyKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    openDetails();
  }

  const copy = (
    <div
      aria-label={`查看${task.title}详情`}
      className="task-copy"
      role="button"
      tabIndex={0}
      onClick={openDetails}
      onKeyDown={handleCopyKeyDown}
    >
      <div className="task-title-row">
        <h3>{task.title}</h3>
      </div>
      {titleOnly ? null : (
        <>
          <p className="task-notes">{task.notes || "无备注"}</p>
          <div className="task-meta">
            <span>{priorityLabels[task.priority]}</span>
            <span>{dueAtLabel}</span>
            {recurrenceLabel ? <span>{recurrenceLabel}</span> : null}
            <span>{task.pomodoroCompletedCount} 个番茄</span>
            {task.tags.map((tag) => <span key={tag.id}>#{tag.name}</span>)}
          </div>
        </>
      )}
    </div>
  );

  return (
    <Card
      className={`task-item priority-${priorityClass(task.priority)}${compact ? " is-compact" : ""}${isCompleted ? " is-completed" : ""}${titleOnly ? " is-title-only" : ""}`}
      pattern="default"
    >
      <button
        aria-label={statusAction}
        className="task-status-button task-icon-action"
        title={statusAction}
        type="button"
        onClick={() => onSetStatus(task, nextStatus)}
      >
        {isCompleted ? <RotateCcw size={16} /> : <Check size={16} />}
      </button>
      {copy}
      <div className="task-actions">
        <button
          aria-label="删除"
          className="task-action-button task-icon-action is-danger"
          title="删除"
          type="button"
          onClick={() => onDelete(task)}
        >
          <Trash2 size={16} />
        </button>
      </div>
    </Card>
  );
}

interface KanbanTaskCardProps {
  disabled: boolean;
  displayMode: TaskCardDisplayMode;
  dragging: boolean;
  task: ApiTask;
  updating: boolean;
  onDelete(task: ApiTask): Promise<void>;
  onOpenDetails(task: ApiTask): void;
  onSetStatus(task: ApiTask, status: TaskStatus): Promise<void>;
}

function KanbanTaskCard({ disabled, displayMode, dragging, task, updating, onDelete, onOpenDetails, onSetStatus }: KanbanTaskCardProps) {
  const sourceTagId = task.tags[0]?.id ?? null;
  const {
    attributes,
    isDragging,
    listeners,
    setNodeRef
  } = useDraggable({
    id: task.id,
    data: {
      type: "kanban-task",
      taskId: task.id,
      sourceTagId
    } satisfies KanbanTaskDragData,
    disabled
  });

  return (
    <div
      {...attributes}
      {...listeners}
      className={[
        "kanban-task-draggable",
        dragging || isDragging ? "is-dragging" : "",
        updating ? "is-updating" : ""
      ].filter(Boolean).join(" ")}
      data-kanban-task-id={task.id}
      ref={setNodeRef}
    >
      <TaskCard compact displayMode={displayMode} task={task} onDelete={onDelete} onOpenDetails={onOpenDetails} onSetStatus={onSetStatus} />
    </div>
  );
}

interface KanbanColumnSectionProps {
  children: ReactNode;
  column: KanbanColumn;
  draggingTaskId: string | null;
  onCreateTask(tagId: string | null): void;
}

function KanbanColumnSection({ children, column, draggingTaskId, onCreateTask }: KanbanColumnSectionProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: getKanbanColumnDropId(column.id),
    data: {
      type: "kanban-column",
      tagId: column.tagId
    } satisfies KanbanColumnDropData
  });

  return (
    <section
      className={[
        "kanban-column",
        draggingTaskId ? "is-drag-active" : "",
        isOver ? "is-drop-target" : ""
      ].filter(Boolean).join(" ")}
      aria-label={`${column.title}看板列`}
      ref={setNodeRef}
    >
      <header>
        <div>
          <h3>{column.title}</h3>
          <span>{column.tagId ? "标签" : "无标签"}</span>
        </div>
        <strong>{column.tasks.length}</strong>
      </header>
      <Button
        className="kanban-add-task"
        icon={<Plus size={15} />}
        size="small"
        type="text"
        onClick={() => onCreateTask(column.tagId)}
      >
        新建任务
      </Button>
      <div className="kanban-task-list">
        {column.tasks.length === 0 ? <div className="empty-state">暂无待办</div> : null}
        {children}
      </div>
    </section>
  );
}

interface TagMaintenanceModalProps {
  open: boolean;
  tags: ApiTag[];
  onChanged(): Promise<void>;
  onClose(): void;
}

function TagMaintenanceModal({ open, tags, onChanged, onClose }: TagMaintenanceModalProps) {
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ApiTag | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setName("");
      setEditingId(null);
      setEditingName("");
      setDeleteTarget(null);
      setMessage("");
    }
  }, [open]);

  function beginEdit(tag: ApiTag) {
    setMessage("");
    setEditingId(tag.id);
    setEditingName(tag.name);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingName("");
    setMessage("");
  }

  async function createTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextName = name.trim();
    if (!nextName || busy) {
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await api.createTag({ name: nextName });
      setName("");
      await onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "标签创建失败");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(tag: ApiTag) {
    const nextName = editingName.trim();
    if (!nextName || busy) {
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await api.updateTag(tag.id, { name: nextName });
      cancelEdit();
      await onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "标签保存失败");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || deleteBusy) {
      return;
    }
    setDeleteBusy(true);
    setMessage("");
    try {
      await api.deleteTag(deleteTarget.id);
      setDeleteTarget(null);
      if (editingId === deleteTarget.id) {
        cancelEdit();
      }
      await onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "标签删除失败");
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <>
      <Modal
        className="tag-maintenance-modal"
        open={open}
        title="标签维护"
        width={560}
        footer={null}
        typewriter={false}
        onClose={onClose}
      >
        <div className="tag-maintenance-content">
          <form className="tag-maintenance-form" onSubmit={createTag}>
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="输入标签名称" maxLength={40} allowClear shadow />
            <Button className="primary-button tag-maintenance-submit" htmlType="submit" icon={<Plus size={15} />} loading={busy} type="primary">
              新增
            </Button>
          </form>
          {message ? <div className="inline-alert">{message}</div> : null}
          <div className="tag-maintenance-list">
            {tags.length === 0 ? <Card className="empty-state" type="dashed">暂无标签</Card> : null}
            {tags.map((tag) => (
              <div className="tag-maintenance-row" key={tag.id}>
                {editingId === tag.id ? (
                  <>
                    <Input value={editingName} onChange={(event) => setEditingName(event.target.value)} maxLength={40} allowClear shadow />
                    <Button aria-label={`保存${tag.name}`} icon={<Save size={15} />} loading={busy} size="small" type="default" onClick={() => void saveEdit(tag)} />
                    <Button aria-label={`取消编辑${tag.name}`} icon={<X size={15} />} disabled={busy} size="small" type="text" onClick={cancelEdit} />
                  </>
                ) : (
                  <>
                    <span className="tag-maintenance-name">#{tag.name}</span>
                    <Button aria-label={`编辑${tag.name}`} icon={<Pencil size={15} />} size="small" type="default" onClick={() => beginEdit(tag)} />
                    <Button aria-label={`删除${tag.name}`} danger icon={<Trash2 size={15} />} size="small" type="default" onClick={() => setDeleteTarget(tag)} />
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </Modal>
      <ConfirmDialog
        danger
        open={Boolean(deleteTarget)}
        title="删除标签"
        confirmText="删除"
        description={<span>确定删除「{deleteTarget?.name ?? ""}」？关联待办将变为无标签。</span>}
        loading={deleteBusy}
        onCancel={() => {
          if (!deleteBusy) {
            setDeleteTarget(null);
          }
        }}
        onConfirm={() => void confirmDelete()}
      />
    </>
  );
}

export function TaskPanel({ createOpen, showCompletedTasks, tags, taskCardDisplayMode, tagMaintenanceOpen, taskTagFilter, tasks, viewMode, onChanged, onCreateOpenChange, onPanelMessageChange = () => undefined, onTagMaintenanceOpenChange }: TaskPanelProps) {
  const kanbanDragState = useRef<KanbanDragState | null>(null);
  const kanbanTaskSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: kanbanDragThresholdPx
      }
    }),
    useSensor(KeyboardSensor)
  );
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [dueAt, setDueAt] = useState(() => getTodayEndDatetimeLocal());
  const [priority, setPriority] = useState<TaskPriority>("IMPORTANT_NOT_URGENT");
  const [tagId, setTagId] = useState(noTagSelectValue);
  const [repeat, setRepeat] = useState<"NONE" | "DAILY" | "WEEKLY" | "MONTHLY">("NONE");
  const [formMessage, setFormMessage] = useState("");
  const [detailTask, setDetailTask] = useState<ApiTask | null>(null);
  const [draggingKanbanTaskId, setDraggingKanbanTaskId] = useState<string | null>(null);
  const [kanbanDragOverlayWidth, setKanbanDragOverlayWidth] = useState<number | null>(null);
  const [updatingKanbanTaskId, setUpdatingKanbanTaskId] = useState<string | null>(null);
  const [quadrants, setQuadrants] = useState<Record<TaskPriority, ApiTask[]>>(() => emptyQuadrants());
  const tagOptions = useMemo(() => [
    { key: noTagSelectValue, label: "不选择" },
    ...tags.map((tag) => ({ key: tag.id, label: tag.name }))
  ], [tags]);
  const visibleTasks = useMemo(
    () => sortTasksForDisplay(
      (showCompletedTasks ? tasks : tasks.filter((task) => task.status !== "COMPLETED"))
        .filter((task) => taskMatchesTagFilter(task, taskTagFilter))
    ),
    [showCompletedTasks, taskTagFilter, tasks]
  );
  const kanbanColumns = useMemo(
    () => buildKanbanColumns(tasks, tags, showCompletedTasks),
    [showCompletedTasks, tags, tasks]
  );
  const draggingKanbanTask = useMemo(
    () => draggingKanbanTaskId ? tasks.find((item) => item.id === draggingKanbanTaskId) ?? null : null,
    [draggingKanbanTaskId, tasks]
  );
  const kanbanDragOverlayStyle: CSSProperties | undefined = kanbanDragOverlayWidth ? { width: kanbanDragOverlayWidth } : undefined;

  function setPanelMessage(message: string) {
    onPanelMessageChange(message);
  }

  async function loadQuadrants() {
    setPanelMessage("");
    try {
      const payload = await api.taskQuadrants();
      setQuadrants({ ...emptyQuadrants(), ...payload.quadrants });
    } catch (error) {
      setPanelMessage(error instanceof Error ? error.message : "四象限加载失败");
    }
  }

  useEffect(() => {
    if (viewMode === "quadrant") {
      void loadQuadrants();
    }
  }, [viewMode, tasks.length]);

  useEffect(() => {
    if (createOpen) {
      setDueAt(getTodayEndDatetimeLocal());
    }
  }, [createOpen]);

  useEffect(() => {
    if (tagId !== noTagSelectValue && !tags.some((tag) => tag.id === tagId)) {
      setTagId(noTagSelectValue);
    }
  }, [tagId, tags]);

  async function refreshAfterChange() {
    await onChanged();
    if (viewMode === "quadrant") {
      await loadQuadrants();
    }
  }

  function resetForm() {
    setTitle("");
    setNotes("");
    setDueAt(getTodayEndDatetimeLocal());
    setPriority("IMPORTANT_NOT_URGENT");
    setTagId(noTagSelectValue);
    setRepeat("NONE");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormMessage("");
    const input: CreateTaskRequest = {
      title,
      notes: notes || null,
      dueAt: dueAt ? new Date(dueAt).toISOString() : null,
      priority,
      status: "TODO",
      tagId: tagId === noTagSelectValue ? null : tagId,
      recurrenceRule: repeat === "NONE" ? null : {
        frequency: repeat,
        interval: 1,
        until: null,
        count: null,
        byWeekday: null
      }
    };

    try {
      await api.createTask(input);
      resetForm();
      onCreateOpenChange(false);
      await refreshAfterChange();
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "创建失败");
    }
  }

  async function setStatus(task: ApiTask, status: TaskStatus) {
    await api.updateTask(task.id, { status });
    await refreshAfterChange();
  }

  async function deleteTask(task: ApiTask) {
    await api.deleteTask(task.id);
    await refreshAfterChange();
  }

  function closeCreateModal() {
    setFormMessage("");
    resetForm();
    onCreateOpenChange(false);
  }

  function openCreateForKanbanColumn(nextTagId: string | null) {
    resetForm();
    setFormMessage("");
    setTagId(nextTagId ?? noTagSelectValue);
    onCreateOpenChange(true);
  }

  async function moveKanbanTaskToTag(taskId: string, targetTagId: string | null) {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) {
      return;
    }

    const sourceTagId = task.tags[0]?.id ?? null;
    if (sourceTagId === targetTagId || updatingKanbanTaskId) {
      return;
    }

    setPanelMessage("");
    setUpdatingKanbanTaskId(taskId);
    try {
      await api.updateTask(task.id, { tagId: targetTagId });
      await refreshAfterChange();
    } catch (error) {
      setPanelMessage(error instanceof Error ? error.message : "标签更新失败");
    } finally {
      setUpdatingKanbanTaskId((current) => current === taskId ? null : current);
    }
  }

  function handleKanbanTaskDragStart(event: DragStartEvent) {
    const activeData = event.active.data.current;
    if (isKanbanTaskDragData(activeData)) {
      setDraggingKanbanTaskId(activeData.taskId);
      setKanbanDragOverlayWidth(getKanbanTaskDragWidth(activeData.taskId));
    }
  }

  function handleKanbanTaskDragCancel() {
    setDraggingKanbanTaskId(null);
    setKanbanDragOverlayWidth(null);
  }

  function handleKanbanTaskDragEnd(event: DragEndEvent) {
    setDraggingKanbanTaskId(null);
    setKanbanDragOverlayWidth(null);
    const activeData = event.active.data.current;
    const overData = event.over?.data.current;
    if (!isKanbanTaskDragData(activeData) || !isKanbanColumnDropData(overData)) {
      return;
    }

    void moveKanbanTaskToTag(activeData.taskId, overData.tagId);
  }

  function handleKanbanWheel(event: WheelEvent<HTMLElement>) {
    const board = event.currentTarget;
    const canScrollHorizontally = board.scrollWidth > board.clientWidth;
    const isHorizontalIntent = Math.abs(event.deltaX) > Math.abs(event.deltaY);
    if (!canScrollHorizontally || !isHorizontalIntent || event.deltaX === 0) {
      return;
    }

    event.preventDefault();
    board.scrollLeft += event.deltaX;
  }

  function beginKanbanDrag(event: PointerEvent<HTMLElement>) {
    if (event.button !== 0 || isKanbanDragIgnoredTarget(event.target)) {
      return;
    }

    kanbanDragState.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      scrollLeft: event.currentTarget.scrollLeft,
      dragging: false
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveKanbanDrag(event: PointerEvent<HTMLElement>) {
    const state = kanbanDragState.current;
    if (!state || state.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - state.startX;
    if (Math.abs(deltaX) > kanbanDragThresholdPx) {
      state.dragging = true;
      event.currentTarget.classList.add("is-dragging");
    }

    if (state.dragging) {
      event.preventDefault();
      event.currentTarget.scrollLeft = state.scrollLeft - deltaX;
    }
  }

  function endKanbanDrag(event: PointerEvent<HTMLElement>) {
    const state = kanbanDragState.current;
    if (!state || state.pointerId !== event.pointerId) {
      return;
    }

    kanbanDragState.current = null;
    event.currentTarget.classList.remove("is-dragging");
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <>
      <TaskDetailModal task={detailTask} onClose={() => setDetailTask(null)} />
      <TagMaintenanceModal
        open={tagMaintenanceOpen}
        tags={tags}
        onChanged={refreshAfterChange}
        onClose={() => onTagMaintenanceOpenChange(false)}
      />

      <Modal
        className="task-create-modal"
        open={createOpen}
        title="新建待办"
        width={720}
        footer={null}
        typewriter={false}
        onClose={closeCreateModal}
      >
        <form className="task-form modal-task-form" onSubmit={submit}>
          <label>
            <span>标题</span>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={160} allowClear shadow />
          </label>
          <label>
            <span>备注</span>
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} />
          </label>
          <div className="form-grid">
            <label>
              <span>截止时间</span>
              <Input value={dueAt} onChange={(event) => setDueAt(event.target.value)} type="datetime-local" shadow />
            </label>
            <label>
              <span>优先级</span>
              <Select value={priority} onChange={(next) => setPriority(next as TaskPriority)} options={priorityOptions} />
            </label>
          </div>
          <div className="form-grid">
            <label>
              <span>重复</span>
              <Select value={repeat} onChange={(next) => setRepeat(next as typeof repeat)} options={repeatOptions} />
            </label>
            <label>
              <span>标签</span>
              <Select value={tagId} onChange={setTagId} options={tagOptions} />
            </label>
          </div>
          {formMessage ? <div className="inline-alert">{formMessage}</div> : null}
          <Button block className="primary-button" htmlType="submit" icon={<Plus size={16} />} type="primary">
            添加
          </Button>
        </form>
      </Modal>

      <div className={`task-layout task-layout-${viewMode}`}>
        {viewMode === "list" ? (
          <section className="task-list">
            {visibleTasks.length === 0 ? <Card className="empty-state" type="dashed">暂无待办</Card> : null}
            {visibleTasks.map((task) => (
              <TaskCard displayMode={taskCardDisplayMode} key={task.id} task={task} onDelete={deleteTask} onOpenDetails={setDetailTask} onSetStatus={setStatus} />
            ))}
          </section>
        ) : viewMode === "kanban" ? (
          <DndContext
            collisionDetection={closestCenter}
            sensors={kanbanTaskSensors}
            onDragCancel={handleKanbanTaskDragCancel}
            onDragEnd={handleKanbanTaskDragEnd}
            onDragStart={handleKanbanTaskDragStart}
          >
            <section
              className="kanban-board"
              aria-label="按标签分组的待办看板"
              onPointerCancel={endKanbanDrag}
              onPointerDown={beginKanbanDrag}
              onPointerMove={moveKanbanDrag}
              onPointerUp={endKanbanDrag}
              onWheel={handleKanbanWheel}
            >
              {kanbanColumns.map((column) => (
                <KanbanColumnSection
                  column={column}
                  draggingTaskId={draggingKanbanTaskId}
                  key={column.id}
                  onCreateTask={openCreateForKanbanColumn}
                >
                  {column.tasks.map((task) => (
                    <KanbanTaskCard
                      disabled={Boolean(updatingKanbanTaskId)}
                      displayMode={taskCardDisplayMode}
                      dragging={draggingKanbanTaskId === task.id}
                      key={task.id}
                      task={task}
                      updating={updatingKanbanTaskId === task.id}
                      onDelete={deleteTask}
                      onOpenDetails={setDetailTask}
                      onSetStatus={setStatus}
                    />
                  ))}
                </KanbanColumnSection>
              ))}
            </section>
            <DragOverlay dropAnimation={null}>
              {draggingKanbanTask ? (
                <div className="kanban-drag-overlay" style={kanbanDragOverlayStyle}>
                  <TaskCard compact displayMode={taskCardDisplayMode} task={draggingKanbanTask} onDelete={deleteTask} onOpenDetails={setDetailTask} onSetStatus={setStatus} />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        ) : (
          <section className="quadrant-grid">
            {priorityOrder.map((item) => {
              const sourceItems = quadrants[item] ?? [];
              const items = sortTasksForDisplay(
                (showCompletedTasks ? sourceItems : sourceItems.filter((task) => task.status !== "COMPLETED"))
                  .filter((task) => taskMatchesTagFilter(task, taskTagFilter))
              );
              return (
                <Card className={`quadrant-panel priority-${priorityClass(item)}`} key={item} pattern="default">
                  <header>
                    <div>
                      <h3>{quadrantMeta[item].title}</h3>
                      <span>{quadrantMeta[item].hint}</span>
                    </div>
                    <strong>{items.length}</strong>
                  </header>
                  <Divider type="dashed-teal" />
                  <div className="quadrant-task-list">
                    {items.length === 0 ? <div className="empty-state">暂无待办</div> : null}
                    {items.map((task) => (
                      <TaskCard compact displayMode={taskCardDisplayMode} key={task.id} task={task} onDelete={deleteTask} onOpenDetails={setDetailTask} onSetStatus={setStatus} />
                    ))}
                  </div>
                </Card>
              );
            })}
          </section>
        )}
      </div>
    </>
  );
}
