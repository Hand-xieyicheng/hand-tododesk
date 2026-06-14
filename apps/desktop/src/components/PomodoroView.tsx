import { useEffect, useMemo, useState } from "react";
import type { ApiTask, PomodoroSession } from "@todo/shared";
import { Button, Card, Divider, Input, Select, Title } from "animal-island-ui";
import { Pause, Play, RotateCcw, Square } from "lucide-react";
import { api } from "../api/client";
import {
  createPomodoroState,
  formatSeconds,
  pausePomodoro,
  resetPomodoro,
  startPomodoro,
  tickPomodoro,
  type PomodoroState
} from "../lib/pomodoroMachine";

interface PomodoroViewProps {
  tasks: ApiTask[];
  onChanged(): Promise<void>;
}

const draftKey = "tododesk.pomodoroDraft";

function notify(title: string, body: string) {
  void import("@tauri-apps/plugin-notification")
    .then(async ({ isPermissionGranted, requestPermission, sendNotification }) => {
      const granted = await isPermissionGranted();
      const permission = granted ? "granted" : await requestPermission();
      if (permission === "granted") {
        sendNotification({ title, body });
      }
    })
    .catch(() => {
      if ("Notification" in window) {
        void Notification.requestPermission().then((permission) => {
          if (permission === "granted") {
            new Notification(title, { body });
          }
        });
      }
    });
}

export function PomodoroView({ tasks, onChanged }: PomodoroViewProps) {
  const [taskId, setTaskId] = useState(tasks[0]?.id ?? "");
  const [duration, setDuration] = useState(25);
  const [state, setState] = useState<PomodoroState>(() => {
    const raw = localStorage.getItem(draftKey);
    return raw ? JSON.parse(raw) as PomodoroState : createPomodoroState(25);
  });
  const [session, setSession] = useState<PomodoroSession | null>(null);
  const [message, setMessage] = useState("");

  const selectedTask = useMemo(() => tasks.find((task) => task.id === taskId) ?? null, [tasks, taskId]);
  const taskOptions = useMemo(() => tasks.map((task) => ({ key: task.id, label: task.title })), [tasks]);
  const progress = 1 - state.remainingSeconds / state.durationSeconds;

  useEffect(() => {
    if (!taskId && tasks[0]) {
      setTaskId(tasks[0].id);
    }
  }, [tasks, taskId]);

  useEffect(() => {
    localStorage.setItem(draftKey, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    if (state.mode !== "running") {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setState((current) => tickPomodoro(current));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [state.mode]);

  useEffect(() => {
    if (state.mode !== "finished" || !session) {
      return;
    }

    void api.completePomodoro(session.id, Math.round(state.durationSeconds / 60)).then(async () => {
      notify("番茄完成", selectedTask?.title ?? "专注已完成");
      setSession(null);
      await onChanged();
    });
  }, [state.mode, session?.id]);

  async function start() {
    if (!selectedTask) {
      setMessage("请选择待办");
      return;
    }

    setMessage("");
    if (!session) {
      const payload = await api.createPomodoro(selectedTask.id, duration);
      setSession(payload.session);
      setState(startPomodoro(resetPomodoro(duration)));
    } else {
      setState((current) => startPomodoro(current));
    }
  }

  async function cancel() {
    if (session) {
      await api.cancelPomodoro(session.id);
    }
    setSession(null);
    setState(resetPomodoro(duration));
  }

  return (
    <section className="pomodoro-layout">
      <Card className="pomodoro-clock" pattern="app-teal">
        <div className="progress-ring" style={{ background: `conic-gradient(var(--color-primary) ${progress * 360}deg, var(--color-surface-strong) 0deg)` }}>
          <div>
            <span>{formatSeconds(state.remainingSeconds)}</span>
            <small>{selectedTask?.title ?? "未选择"}</small>
          </div>
        </div>
        <div className="clock-controls">
          {state.mode === "running" ? (
            <Button className="primary-button" icon={<Pause size={16} />} type="primary" onClick={() => setState((current) => pausePomodoro(current))}>暂停</Button>
          ) : (
            <Button className="primary-button" icon={<Play size={16} />} type="primary" onClick={start}>开始</Button>
          )}
          <Button className="ghost-button" icon={<Square size={16} />} type="default" onClick={cancel}>取消</Button>
          <Button className="ghost-button" icon={<RotateCcw size={16} />} type="dashed" onClick={() => setState(resetPomodoro(duration))}>重置</Button>
        </div>
        {message ? <div className="inline-alert">{message}</div> : null}
      </Card>
      <Card className="tool-panel tool-card" pattern="default">
        <Title size="small" color="app-green">任务绑定</Title>
        <Divider type="dashed-teal" />
        <label>
          <span>待办</span>
          <Select value={taskId} onChange={setTaskId} options={taskOptions} placeholder="请选择待办" disabled={tasks.length === 0} />
        </label>
        <label>
          <span>分钟</span>
          <Input type="number" min={1} max={180} value={duration} shadow onChange={(event) => {
            const next = Number(event.target.value);
            setDuration(next);
            setState(resetPomodoro(next));
          }} />
        </label>
        <div className="stat-grid">
          {tasks.slice(0, 4).map((task) => (
            <div className="stat-tile" key={task.id}>
              <strong>{task.pomodoroCompletedCount}</strong>
              <span>{task.title}</span>
            </div>
          ))}
        </div>
      </Card>
    </section>
  );
}
