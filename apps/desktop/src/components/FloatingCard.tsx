import { MouseEvent, PointerEvent, useEffect, useMemo, useState } from "react";
import type { ApiTask } from "@todo/shared";
import { Button, Card } from "animal-island-ui";
import { Check, GripHorizontal, X } from "lucide-react";
import { api } from "../api/client";
import todoDeskLogo from "../assets/tododesk-logo.png";
import { applyDisplaySize } from "../lib/displaySize";
import { applyTheme } from "../lib/themes";

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
        <GripHorizontal size={18} />
        <img className="floating-logo" src={todoDeskLogo} alt="todoDesk" />
      </button>
      <Button icon={<X size={16} />} size="small" title="关闭" type="text" onClick={closeWindow} />
    </header>
  );
}

export function FloatingCard() {
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [message, setMessage] = useState("");
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);

  useEffect(() => {
    applyTheme(localStorage.getItem("tododesk.theme") ?? "default");
    applyDisplaySize(localStorage.getItem("tododesk.displaySize") ?? "default");
    void api.tasks()
      .then((payload) => setTasks(payload.tasks.filter((task) => task.status !== "COMPLETED")))
      .catch((error) => setMessage(error instanceof Error ? error.message : "加载失败"));
  }, []);

  const visibleTasks = useMemo(() => {
    return tasks.slice(0, 5);
  }, [tasks]);

  async function complete(task: ApiTask) {
    setSavingTaskId(task.id);
    setMessage("");
    try {
      await api.updateTask(task.id, { status: "COMPLETED" });
      setTasks((current) => current.filter((item) => item.id !== task.id));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "完成失败");
    } finally {
      setSavingTaskId((current) => (current === task.id ? null : current));
    }
  }

  return (
    <div className="floating-card">
      <FloatingHeader />
      <main>
        {message ? <div className="inline-alert">{message}</div> : null}
        {visibleTasks.length === 0 ? <Card className="empty-state" type="dashed">暂无待办</Card> : null}
        {visibleTasks.map((task) => (
          <Card className="floating-task" key={task.id} pattern="default">
            <div>
              <strong>{task.title}</strong>
              <span>{task.dueAt ? new Date(task.dueAt).toLocaleString() : "无截止时间"}</span>
            </div>
            <Button
              disabled={savingTaskId === task.id}
              icon={<Check size={16} />}
              loading={savingTaskId === task.id}
              size="small"
              title="完成"
              type="default"
              onClick={(event) => {
                event.stopPropagation();
                void complete(task);
              }}
            />
          </Card>
        ))}
      </main>
    </div>
  );
}
