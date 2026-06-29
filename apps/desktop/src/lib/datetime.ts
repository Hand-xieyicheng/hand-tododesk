export function toDatetimeLocal(value: string | Date | null) {
  if (!value) {
    return "";
  }

  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
}

function endOfLocalDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 0, 0);
  return next;
}

export function getTodayEndDatetimeLocal(now = new Date()) {
  return toDatetimeLocal(endOfLocalDay(now));
}

export function getTomorrowEndDatetimeLocal(now = new Date()) {
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return toDatetimeLocal(endOfLocalDay(tomorrow));
}

export function getWeekEndDatetimeLocal(now = new Date()) {
  const weekEnd = new Date(now);
  const daysUntilSunday = (7 - weekEnd.getDay()) % 7;
  weekEnd.setDate(weekEnd.getDate() + daysUntilSunday);
  return toDatetimeLocal(endOfLocalDay(weekEnd));
}

function parseDatetimeValue(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isValidTaskTimeRange(startAt: string | null | undefined, dueAt: string | null | undefined) {
  const start = parseDatetimeValue(startAt);
  const due = parseDatetimeValue(dueAt);
  return !start || !due || start.getTime() <= due.getTime();
}

export function datetimeLocalToIso(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString();
}

export function formatTaskTimeRange(range: { startAt: string | null; dueAt: string | null }) {
  const start = range.startAt ? formatDateTime(range.startAt) : "";
  const due = range.dueAt ? formatDateTime(range.dueAt) : "";
  if (start && due) {
    return `开始 ${start} / 截止 ${due}`;
  }
  if (start) {
    return `开始 ${start}`;
  }
  if (due) {
    return `截止 ${due}`;
  }
  return "无时间";
}
