import { useEffect, useMemo, useState } from "react";
import type { CalendarOccurrence, CalendarView as CalendarViewMode } from "@todo/shared";
import { Button, Card, Tooltip } from "animal-island-ui";
import { CalendarClock, ChevronLeft, ChevronRight, CheckCircle2 } from "lucide-react";
import { api } from "../api/client";

interface CalendarViewProps {
  onChanged(): Promise<void>;
}

const modes: Array<{ id: CalendarViewMode; label: string }> = [
  { id: "month", label: "月" },
  { id: "week", label: "周" },
  { id: "day", label: "日" }
];

const statusLabels: Record<CalendarOccurrence["status"], string> = {
  TODO: "未开始",
  IN_PROGRESS: "进行中",
  COMPLETED: "已完成",
  ARCHIVED: "已归档"
};

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getRange(cursor: Date, mode: CalendarViewMode) {
  const current = startOfDay(cursor);
  if (mode === "day") {
    return { from: current, to: addDays(current, 1), cells: [current] };
  }

  if (mode === "week") {
    const day = current.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const from = addDays(current, mondayOffset);
    return {
      from,
      to: addDays(from, 7),
      cells: Array.from({ length: 7 }, (_, index) => addDays(from, index))
    };
  }

  const first = new Date(current.getFullYear(), current.getMonth(), 1);
  const nextMonth = new Date(current.getFullYear(), current.getMonth() + 1, 1);
  const dayCount = Math.round((nextMonth.getTime() - first.getTime()) / (24 * 60 * 60 * 1000));
  return {
    from: first,
    to: nextMonth,
    cells: Array.from({ length: dayCount }, (_, index) => addDays(first, index))
  };
}

function keyOf(date: Date | string) {
  return new Date(date).toISOString().slice(0, 10);
}

function isSameCalendarDate(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

function formatDueTime(value: string | null) {
  if (!value) {
    return null;
  }
  return new Date(value).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

export function CalendarView({ onChanged }: CalendarViewProps) {
  const [mode, setMode] = useState<CalendarViewMode>("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [occurrences, setOccurrences] = useState<CalendarOccurrence[]>([]);
  const [message, setMessage] = useState("");

  const range = useMemo(() => getRange(cursor, mode), [cursor, mode]);
  const grouped = useMemo(() => {
    const map = new Map<string, CalendarOccurrence[]>();
    for (const occurrence of occurrences) {
      const key = keyOf(occurrence.date);
      map.set(key, [...(map.get(key) ?? []), occurrence]);
    }
    return map;
  }, [occurrences]);

  async function load() {
    setMessage("");
    try {
      const payload = await api.calendar(range.from.toISOString(), range.to.toISOString(), mode);
      setOccurrences(payload.occurrences);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "日历加载失败");
    }
  }

  useEffect(() => {
    void load();
  }, [range.from.toISOString(), range.to.toISOString(), mode]);

  async function complete(occurrence: CalendarOccurrence) {
    await api.completeOccurrence(occurrence.taskId, occurrence.date);
    await Promise.all([load(), onChanged()]);
  }

  function move(delta: number) {
    const next = new Date(cursor);
    if (mode === "month") {
      next.setMonth(next.getMonth() + delta);
    } else {
      next.setDate(next.getDate() + delta * (mode === "week" ? 7 : 1));
    }
    setCursor(next);
  }

  function resetToToday() {
    setCursor(new Date());
  }

  function renderTaskTooltip(item: CalendarOccurrence) {
    const dueTime = formatDueTime(item.dueAt);
    const isDone = item.status === "COMPLETED";

    return (
      <div className="calendar-task-popover">
        <div className="calendar-task-popover-title">{item.title}</div>
        {item.task.notes ? <div className="calendar-task-popover-notes">{item.task.notes}</div> : null}
        <div className="calendar-task-popover-meta">
          <span>{statusLabels[item.status]}</span>
          {dueTime ? <span>{dueTime}</span> : null}
          {item.isRecurring ? <span>重复待办</span> : null}
        </div>
        <Button
          className="calendar-task-popover-action"
          disabled={isDone}
          icon={isDone ? <CheckCircle2 size={14} /> : undefined}
          size="small"
          type={isDone ? "default" : "primary"}
          onClick={() => {
            if (!isDone) {
              void complete(item);
            }
          }}
        >
          {isDone ? "已完成" : item.isRecurring ? "完成本次" : "标记完成"}
        </Button>
      </div>
    );
  }

  return (
    <section className="calendar-panel">
      <div className="calendar-toolbar">
        <div className="segmented-control">
          {modes.map((item) => (
            <Button key={item.id} className={mode === item.id ? "is-active" : ""} type={mode === item.id ? "primary" : "text"} onClick={() => setMode(item.id)}>
              {item.label}
            </Button>
          ))}
        </div>
        <div className="calendar-heading">
          <Button aria-label="重置为今日" className="calendar-today-button" icon={<CalendarClock size={18} />} size="small" title="重置为今日" type="default" onClick={resetToToday} />
          <Button icon={<ChevronLeft size={18} />} size="small" title="上一页" type="default" onClick={() => move(-1)} />
          <strong>{cursor.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: mode === "day" ? "numeric" : undefined })}</strong>
          <Button icon={<ChevronRight size={18} />} size="small" title="下一页" type="default" onClick={() => move(1)} />
        </div>
      </div>
      {message ? <div className="inline-alert">{message}</div> : null}
      <div className={`calendar-grid calendar-${mode}`}>
        {range.cells.map((cell) => {
          const key = keyOf(cell);
          const items = grouped.get(key) ?? [];
          const isToday = (mode === "month" || mode === "week") && isSameCalendarDate(cell, new Date());
          const cellStyle = mode === "month" && cell.getDate() === 1 ? { gridColumnStart: cell.getDay() + 1 } : undefined;
          return (
            <Card className={isToday ? "calendar-cell is-today" : "calendar-cell"} key={key} pattern={items.length > 0 ? "app-yellow" : "default"} style={cellStyle}>
              <header>
                <span>{cell.toLocaleDateString("zh-CN", { weekday: "short" })}</span>
                <strong>{cell.getDate()}</strong>
              </header>
              <div className="calendar-items">
                {items.map((item) => (
                  <Tooltip className="calendar-task-tooltip" key={item.id} placement="top-start" title={renderTaskTooltip(item)} trigger="hover" variant="island">
                    <span className={item.status === "COMPLETED" ? "calendar-task is-done" : "calendar-task"}>{item.title}</span>
                  </Tooltip>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
