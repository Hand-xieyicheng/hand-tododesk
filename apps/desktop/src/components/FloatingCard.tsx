import { useEffect, useMemo, useState } from "react";
import type { FormEvent, MouseEvent, PointerEvent } from "react";
import type { ApiTask, ApiThemePreference, CreateTaskRequest, TaskCardDisplayMode, TaskPriority, TaskStatus, UpdateTaskRequest } from "@todo/shared";
import { Button, Card, Input, Select, Tooltip } from "animal-island-ui";
import { Check, Eye, EyeOff, Pencil, Plus, RefreshCw, RotateCcw, Save, X } from "lucide-react";
import { api } from "../api/client";
import todoDeskLogo from "../assets/tododesk-logo.png";
import { applyDisplaySize } from "../lib/displaySize";
import { applyFontFamily } from "../lib/fonts";
import { applyTheme } from "../lib/themes";

type FormMode = "create" | "edit";

interface TaskDraft {
  title: string;
  notes: string;
  dueAt: string;
  priority: TaskPriority;
  tags: string;
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

const defaultThemePreference: ApiThemePreference = {
  themeId: "default",
  titleColor: "app-teal",
  footerVisible: true,
  footerType: "sea",
  showCompletedTasks: true,
  taskViewMode: "list",
  taskCardDisplayMode: "full",
  displaySize: "default",
  fontFamily: "system"
};

const preferenceSyncIntervalMs = 5000;

function emptyDraft(): TaskDraft {
  return {
    title: "",
    notes: "",
    dueAt: "",
    priority: "IMPORTANT_NOT_URGENT",
    tags: ""
  };
}

function toDatetimeLocal(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
}

function draftFromTask(task: ApiTask): TaskDraft {
  return {
    title: task.title,
    notes: task.notes ?? "",
    dueAt: toDatetimeLocal(task.dueAt),
    priority: task.priority,
    tags: task.tags.map((tag) => tag.name).join(",")
  };
}

function parseTags(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function dueAtToIso(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function FloatingHeader() {
  async function dragWindow(event: PointerEvent<HTMLElement>) {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().startDragging();
    } catch {
      // Browser preview fallback.
    }
  }

  async function closeWindow(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().close();
    } catch {
      window.close();
    }
  }

  return (
    <header className="floating-header">
      <button className="floating-drag-handle" type="button" title="拖动卡片" onPointerDown={dragWindow}>
        <img className="floating-logo" src={todoDeskLogo} alt="todoDesk" />
      </button>
      <Button aria-label="关闭" icon={<X size={16} />} size="small" title="关闭" type="text" onClick={closeWindow} />
    </header>
  );
}

export function FloatingCard() {
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [showCompletedTasks, setShowCompletedTasks] = useState(defaultThemePreference.showCompletedTasks);
  const [taskCardDisplayMode, setTaskCardDisplayMode] = useState<TaskCardDisplayMode>(defaultThemePreference.taskCardDisplayMode);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [savingPreference, setSavingPreference] = useState(false);
  const [formMode, setFormMode] = useState<FormMode | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TaskDraft>(() => emptyDraft());

  const visibleTasks = useMemo(() => {
    return showCompletedTasks ? tasks : tasks.filter((task) => task.status !== "COMPLETED");
  }, [showCompletedTasks, tasks]);
  const openTaskCount = useMemo(() => tasks.filter((task) => task.status !== "COMPLETED").length, [tasks]);
  const formTitle = formMode === "edit" ? "编辑待办" : "新增待办";
  const showCompletedAction = showCompletedTasks ? "隐藏已完成待办" : "显示已完成待办";

  function applyThemePreference(preference: ApiThemePreference) {
    setShowCompletedTasks(preference.showCompletedTasks);
    setTaskCardDisplayMode(preference.taskCardDisplayMode);
    localStorage.setItem("tododesk.theme", preference.themeId);
    localStorage.setItem("tododesk.displaySize", preference.displaySize);
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
      const [taskPayload, preference] = await Promise.all([
        api.tasks(),
        api.getThemePreference().catch(() => defaultThemePreference)
      ]);
      setTasks(taskPayload.tasks);
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
    let cancelled = false;
    const syncPreference = async () => {
      try {
        const preference = await api.getThemePreference();
        if (!cancelled) {
          applyThemePreference(preference);
        }
      } catch {
        // Background preference sync should not interrupt the floating card.
      }
    };
    const intervalId = window.setInterval(() => void syncPreference(), preferenceSyncIntervalMs);
    const syncWhenVisible = () => {
      if (document.visibilityState === "visible") {
        void syncPreference();
      }
    };

    window.addEventListener("focus", syncWhenVisible);
    document.addEventListener("visibilitychange", syncWhenVisible);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", syncWhenVisible);
      document.removeEventListener("visibilitychange", syncWhenVisible);
    };
  }, []);

  function updateDraft(patch: Partial<TaskDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

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
          tagNames: parseTags(draft.tags)
        };
        const payload = await api.updateTask(editingTaskId, input);
        setTasks((current) => current.map((task) => task.id === editingTaskId ? payload.task : task));
      } else {
        const input: CreateTaskRequest = {
          title,
          notes: draft.notes.trim() || null,
          dueAt: dueAtToIso(draft.dueAt),
          priority: draft.priority,
          status: "TODO",
          tagNames: parseTags(draft.tags),
          recurrenceRule: null
        };
        const payload = await api.createTask(input);
        setTasks((current) => [payload.task, ...current]);
      }
      cancelForm();
      await loadData({ silent: true });
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
      setTasks((current) => current.map((item) => item.id === task.id ? payload.task : item));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : status === "COMPLETED" ? "完成失败" : "重置失败");
    } finally {
      setSavingTaskId((current) => (current === task.id ? null : current));
    }
  }

  async function toggleShowCompletedTasks(next: boolean) {
    setShowCompletedTasks(next);
    setSavingPreference(true);
    setMessage("");
    try {
      const preference = await api.setThemePreference({ showCompletedTasks: next });
      applyThemePreference(preference);
    } catch (error) {
      setShowCompletedTasks(!next);
      setMessage(error instanceof Error ? error.message : "待办显示配置保存失败");
    } finally {
      setSavingPreference(false);
    }
  }

  return (
    <div className="floating-card">
      <FloatingHeader />
      <main>
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
              <Input value={draft.tags} onChange={(event) => updateDraft({ tags: event.target.value })} placeholder="工作,生活" allowClear shadow />
            </label>
            <Button block htmlType="submit" icon={<Save size={15} />} loading={savingTaskId === "form"} type="primary">
              保存
            </Button>
          </form>
        ) : null}

        {message ? <div className="inline-alert">{message}</div> : null}
        {loading ? <div className="inline-muted">刷新中...</div> : null}

        <section className="floating-task-list">
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
              <Card className={`${isCompleted ? "floating-task is-completed" : "floating-task"}${titleOnly ? " is-title-only" : ""}`} key={task.id} pattern="default">
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
                    aria-label={statusAction}
                    disabled={savingTaskId === task.id}
                    icon={isCompleted ? <RotateCcw size={15} /> : <Check size={15} />}
                    loading={savingTaskId === task.id}
                    size="small"
                    title={statusAction}
                    type={isCompleted ? "default" : "default"}
                    onClick={() => void setTaskStatus(task, nextStatus)}
                  />
                </div>
              </Card>
            );
          })}
        </section>
      </main>
    </div>
  );
}
