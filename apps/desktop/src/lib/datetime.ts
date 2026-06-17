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

export function getTodayEndDatetimeLocal(now = new Date()) {
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 0, 0);
  return toDatetimeLocal(endOfToday);
}
