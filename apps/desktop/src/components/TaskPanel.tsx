import { type FormEvent, type KeyboardEvent, useEffect, useMemo, useState } from "react";
import { sortTasksForDisplay, type ApiTask, type CreateTaskRequest, type TaskCardDisplayMode, type TaskPriority, type TaskStatus, type TaskViewMode } from "@todo/shared";
import { Button, Card, Divider, Input, Modal, Select } from "animal-island-ui";
import { Check, Plus, RotateCcw, Trash2 } from "lucide-react";
import { api } from "../api/client";
import { getTodayEndDatetimeLocal } from "../lib/datetime";

interface TaskPanelProps {
  createOpen: boolean;
  showCompletedTasks: boolean;
  taskCardDisplayMode: TaskCardDisplayMode;
  tasks: ApiTask[];
  viewMode: TaskViewMode;
  onChanged(): Promise<void>;
  onCreateOpenChange(open: boolean): void;
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
      {copy}
      <div className="task-actions">
        <Button
          aria-label={statusAction}
          icon={isCompleted ? <RotateCcw size={16} /> : <Check size={16} />}
          size="small"
          title={statusAction}
          type="default"
          onClick={() => onSetStatus(task, nextStatus)}
        />
        <Button aria-label="删除" danger icon={<Trash2 size={16} />} size="small" title="删除" type="default" onClick={() => onDelete(task)} />
      </div>
    </Card>
  );
}

export function TaskPanel({ createOpen, showCompletedTasks, taskCardDisplayMode, tasks, viewMode, onChanged, onCreateOpenChange }: TaskPanelProps) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [dueAt, setDueAt] = useState(() => getTodayEndDatetimeLocal());
  const [priority, setPriority] = useState<TaskPriority>("IMPORTANT_NOT_URGENT");
  const [tags, setTags] = useState("");
  const [repeat, setRepeat] = useState<"NONE" | "DAILY" | "WEEKLY" | "MONTHLY">("NONE");
  const [formMessage, setFormMessage] = useState("");
  const [panelMessage, setPanelMessage] = useState("");
  const [detailTask, setDetailTask] = useState<ApiTask | null>(null);
  const [quadrants, setQuadrants] = useState<Record<TaskPriority, ApiTask[]>>(() => emptyQuadrants());
  const visibleTasks = useMemo(
    () => sortTasksForDisplay(showCompletedTasks ? tasks : tasks.filter((task) => task.status !== "COMPLETED")),
    [showCompletedTasks, tasks]
  );

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
    setTags("");
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
      tagNames: tags.split(",").map((item) => item.trim()).filter(Boolean),
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
    onCreateOpenChange(false);
  }

  return (
    <>
      <TaskDetailModal task={detailTask} onClose={() => setDetailTask(null)} />

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
              <Input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="工作,生活" allowClear shadow />
            </label>
          </div>
          {formMessage ? <div className="inline-alert">{formMessage}</div> : null}
          <Button block className="primary-button" htmlType="submit" icon={<Plus size={16} />} type="primary">
            添加
          </Button>
        </form>
      </Modal>

      <div className={`task-layout task-layout-${viewMode}`}>
        {panelMessage ? <div className="inline-alert">{panelMessage}</div> : null}

        {viewMode === "list" ? (
          <section className="task-list">
            {visibleTasks.length === 0 ? <Card className="empty-state" type="dashed">暂无待办</Card> : null}
            {visibleTasks.map((task) => (
              <TaskCard displayMode={taskCardDisplayMode} key={task.id} task={task} onDelete={deleteTask} onOpenDetails={setDetailTask} onSetStatus={setStatus} />
            ))}
          </section>
        ) : (
          <section className="quadrant-grid">
            {priorityOrder.map((item) => {
              const sourceItems = quadrants[item] ?? [];
              const items = sortTasksForDisplay(showCompletedTasks ? sourceItems : sourceItems.filter((task) => task.status !== "COMPLETED"));
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
