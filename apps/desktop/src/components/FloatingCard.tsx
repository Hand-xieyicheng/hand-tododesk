import { useEffect, useMemo, useState } from "react";
import type { ApiTask } from "@todo/shared";
import { Button, Card } from "animal-island-ui";
import { Check, GripHorizontal, X } from "lucide-react";
import { api } from "../api/client";
import todoDeskLogo from "../assets/tododesk-logo.png";
import { applyTheme } from "../lib/themes";

function FloatingHeader() {
  async function dragWindow() {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().startDragging();
    } catch {
      // Browser preview fallback.
    }
  }

  async function closeWindow() {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().close();
    } catch {
      window.close();
    }
  }

  return (
    <header className="floating-header" onMouseDown={dragWindow}>
      <GripHorizontal size={18} />
      <img className="floating-logo" src={todoDeskLogo} alt="todoDesk" />
      <Button icon={<X size={16} />} size="small" title="关闭" type="text" onClick={closeWindow} />
    </header>
  );
}

export function FloatingCard() {
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    applyTheme(localStorage.getItem("tododesk.theme") ?? "default");
    void api.tasks()
      .then((payload) => setTasks(payload.tasks.filter((task) => task.status !== "COMPLETED")))
      .catch((error) => setMessage(error instanceof Error ? error.message : "加载失败"));
  }, []);

  const visibleTasks = useMemo(() => {
    return tasks.slice(0, 5);
  }, [tasks]);

  async function complete(task: ApiTask) {
    await api.updateTask(task.id, { status: "COMPLETED" });
    setTasks((current) => current.filter((item) => item.id !== task.id));
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
            <Button icon={<Check size={16} />} size="small" title="完成" type="default" onClick={() => complete(task)} />
          </Card>
        ))}
      </main>
    </div>
  );
}
