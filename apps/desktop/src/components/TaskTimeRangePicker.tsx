import { useEffect, useId, useMemo, useRef, useState } from "react";
import DatePicker from "antd/es/date-picker";
import "antd/es/date-picker/style/index";
import dayjs, { type Dayjs } from "dayjs";
import { Calendar, CalendarArrowUp, CalendarCheck, CalendarDays, CalendarX2 } from "lucide-react";
import {
  formatTaskTimeRange,
  getTodayEndDatetimeLocal,
  getTomorrowEndDatetimeLocal,
  getWeekEndDatetimeLocal,
  toDatetimeLocal
} from "../lib/datetime";

export interface TaskTimeRangeValue {
  startAt: string;
  dueAt: string;
}

interface TaskTimeRangePickerProps {
  className?: string;
  value: TaskTimeRangeValue;
  variant?: "default" | "floating";
  onChange(value: TaskTimeRangeValue): void;
}

type ActiveField = "startAt" | "dueAt";

function datePickerValue(value: string): Dayjs | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : dayjs(date);
}

function parseTypedDatetime(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  const normalized = trimmed
    .replace(/\//g, "-")
    .replace(/\s+/, "T");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? "" : toDatetimeLocal(date);
}

export function TaskTimeRangePicker({ className = "", value, variant = "default", onChange }: TaskTimeRangePickerProps) {
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const id = useId();
  const titleId = `${id}-task-time-range-title`;
  const startInputId = `${id}-task-start-at`;
  const dueInputId = `${id}-task-due-at`;
  const customPanelId = `${id}-task-custom-time-panel`;
  const suppressNextEmptyTypedCommitRef = useRef<Record<ActiveField, boolean>>({
    startAt: false,
    dueAt: false
  });
  const [customOpen, setCustomOpen] = useState(false);
  const summary = useMemo(
    () => formatTaskTimeRange({
      startAt: value.startAt || null,
      dueAt: value.dueAt || null
    }),
    [value.dueAt, value.startAt]
  );

  useEffect(() => {
    if (!customOpen) {
      return undefined;
    }

    function closeOnOutsidePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (pickerRef.current?.contains(target)) {
        return;
      }
      if (target instanceof Element && target.closest(".task-time-range-ant-dropdown")) {
        return;
      }
      setCustomOpen(false);
    }

    document.addEventListener("pointerdown", closeOnOutsidePointerDown);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointerDown);
  }, [customOpen]);

  function setDueAt(dueAt: string) {
    onChange({ startAt: value.startAt, dueAt });
  }

  function updateField(field: ActiveField, nextValue: string) {
    onChange({ ...value, [field]: nextValue });
  }

  function updateFieldFromPicker(field: ActiveField, nextValue: Dayjs | null) {
    suppressNextEmptyTypedCommitRef.current[field] = Boolean(nextValue);
    updateField(field, nextValue ? toDatetimeLocal(nextValue.toDate()) : "");
  }

  function commitTypedValue(field: ActiveField, nextValue: string) {
    const parsed = parseTypedDatetime(nextValue);
    if (parsed) {
      suppressNextEmptyTypedCommitRef.current[field] = false;
      updateField(field, parsed);
      return;
    }

    if (!nextValue.trim()) {
      if (suppressNextEmptyTypedCommitRef.current[field]) {
        suppressNextEmptyTypedCommitRef.current[field] = false;
        return;
      }
      updateField(field, "");
    }
  }

  function renderDatePickerField(field: ActiveField, label: string, inputId: string) {
    return (
      <label
        className="task-time-range-field"
        htmlFor={inputId}
        onChangeCapture={(event) => {
          const target = event.nativeEvent.target;
          if (target instanceof HTMLInputElement) {
            commitTypedValue(field, target.value);
          }
        }}
      >
        <span>{label}</span>
        <DatePicker
          allowClear
          aria-label={label}
          className="task-time-range-ant-picker"
          classNames={{ popup: { root: "task-time-range-ant-dropdown" } }}
          format="YYYY/MM/DD HH:mm"
          id={inputId}
          inputReadOnly={false}
          placeholder={label}
          showNow={false}
          showTime={{ format: "HH:mm" }}
          styles={{ popup: { root: { zIndex: 2147483000 } } }}
          value={datePickerValue(value[field])}
          onBlur={(event) => {
            const target = event.target as HTMLInputElement;
            commitTypedValue(field, target.value);
          }}
          onChange={(nextValue) => updateFieldFromPicker(field, nextValue)}
        />
      </label>
    );
  }

  return (
    <div
      ref={pickerRef}
      className={`task-time-range-picker task-time-range-picker-${variant}${className ? ` ${className}` : ""}`}
      aria-labelledby={titleId}
    >
      <div className="task-time-range-title" id={titleId}>日期时间</div>
      <div className="task-time-range-popup-anchor">
        <div className="task-time-range-quick-actions" aria-label="任务时间快捷选项">
          <button
            aria-label="清除时间"
            className="task-time-range-clear"
            type="button"
            onClick={() => onChange({ startAt: "", dueAt: "" })}
          >
            <CalendarX2 size={18} />
          </button>
          <button className="task-time-range-preset" type="button" onClick={() => setDueAt(getTodayEndDatetimeLocal())}>
            <CalendarDays size={18} />
            <span>今日</span>
          </button>
          <button className="task-time-range-preset" type="button" onClick={() => setDueAt(getTomorrowEndDatetimeLocal())}>
            <CalendarArrowUp size={18} />
            <span>明日</span>
          </button>
          <button className="task-time-range-preset" type="button" onClick={() => setDueAt(getWeekEndDatetimeLocal())}>
            <CalendarCheck size={18} />
            <span>本周</span>
          </button>
          <button
            aria-controls={customOpen ? customPanelId : undefined}
            aria-expanded={customOpen}
            className="task-time-range-preset"
            type="button"
            onClick={() => setCustomOpen((next) => !next)}
          >
            <Calendar size={18} />
            <span>其它时间</span>
          </button>
        </div>
        {customOpen ? (
          <div
            aria-label="其它时间"
            className={`task-time-range-custom-panel task-time-range-custom-panel-popup task-time-range-custom-panel-${variant}`}
            id={customPanelId}
          >
            {renderDatePickerField("startAt", "开始时间", startInputId)}
            {renderDatePickerField("dueAt", "截止时间", dueInputId)}
          </div>
        ) : null}
      </div>
      <p className="task-time-range-summary">{summary}</p>
    </div>
  );
}
