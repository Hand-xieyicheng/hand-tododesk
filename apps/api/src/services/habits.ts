import { compareDateKeys, formatDateKey, parseDateKey, toLocalDateKey, type ApiHabitCalendarDay, type ApiHabitStats, type HabitFrequency, type HabitWeekday } from "@todo/shared";

const msPerDay = 24 * 60 * 60 * 1000;

export interface HabitSchedule {
  frequency: HabitFrequency;
  interval: number;
  weekDays: HabitWeekday[];
  monthDays: number[];
  startDate: string;
  endDate: string | null;
}

export interface HabitCheckInInfo {
  id: string;
  date: string;
  note: string | null;
}

const weekdayKeys: HabitWeekday[] = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function dayNumber(dateKey: string) {
  const parts = parseDateKey(dateKey);
  return Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / msPerDay);
}

function monthNumber(dateKey: string) {
  const parts = parseDateKey(dateKey);
  return parts.year * 12 + parts.month - 1;
}

function weekdayOf(dateKey: string): HabitWeekday {
  const parts = parseDateKey(dateKey);
  return weekdayKeys[new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay()] ?? "SU";
}

function addDays(dateKey: string, days: number) {
  const parts = parseDateKey(dateKey);
  const next = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return formatDateKey({
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate()
  });
}

function weekStartDayNumber(dateKey: string) {
  const current = dayNumber(dateKey);
  const weekday = weekdayOf(dateKey);
  const mondayOffset = weekday === "SU" ? -6 : 1 - weekdayKeys.indexOf(weekday);
  return current + mondayOffset;
}

function normalizeInterval(value: number) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
}

function effectiveMonthDays(schedule: HabitSchedule, dateKey: string) {
  const parts = parseDateKey(dateKey);
  const maxDay = daysInMonth(parts.year, parts.month);
  return new Set(schedule.monthDays.map((day) => Math.min(day, maxDay)));
}

export function monthStartKey(month: string) {
  return `${month}-01`;
}

export function monthEndKey(month: string) {
  const [year, monthNumberValue] = month.split("-").map(Number);
  return formatDateKey({
    year: year ?? 0,
    month: monthNumberValue ?? 1,
    day: daysInMonth(year ?? 0, monthNumberValue ?? 1)
  });
}

export function currentMonthKey(todayKey = toLocalDateKey()) {
  return todayKey.slice(0, 7);
}

export function isHabitPlannedOn(schedule: HabitSchedule, dateKey: string) {
  if (compareDateKeys(dateKey, schedule.startDate) < 0) {
    return false;
  }
  if (schedule.endDate && compareDateKeys(dateKey, schedule.endDate) > 0) {
    return false;
  }

  const interval = normalizeInterval(schedule.interval);
  if (schedule.frequency === "DAILY") {
    return (dayNumber(dateKey) - dayNumber(schedule.startDate)) % interval === 0;
  }

  if (schedule.frequency === "WEEKLY") {
    if (!schedule.weekDays.includes(weekdayOf(dateKey))) {
      return false;
    }
    const weeksBetween = Math.floor((weekStartDayNumber(dateKey) - weekStartDayNumber(schedule.startDate)) / 7);
    return weeksBetween >= 0 && weeksBetween % interval === 0;
  }

  const monthsBetween = monthNumber(dateKey) - monthNumber(schedule.startDate);
  return monthsBetween >= 0 &&
    monthsBetween % interval === 0 &&
    effectiveMonthDays(schedule, dateKey).has(parseDateKey(dateKey).day);
}

export function plannedHabitDateKeysBetween(schedule: HabitSchedule, fromKey: string, toKey: string) {
  if (compareDateKeys(fromKey, toKey) > 0) {
    return [];
  }

  const start = compareDateKeys(fromKey, schedule.startDate) > 0 ? fromKey : schedule.startDate;
  const end = schedule.endDate && compareDateKeys(schedule.endDate, toKey) < 0 ? schedule.endDate : toKey;
  if (compareDateKeys(start, end) > 0) {
    return [];
  }

  const dates: string[] = [];
  for (let cursor = start; compareDateKeys(cursor, end) <= 0; cursor = addDays(cursor, 1)) {
    if (isHabitPlannedOn(schedule, cursor)) {
      dates.push(cursor);
    }
  }
  return dates;
}

export function calculateHabitStats(
  schedule: HabitSchedule,
  checkInDateKeys: Set<string>,
  month: string,
  todayKey = toLocalDateKey()
): ApiHabitStats {
  const monthStart = monthStartKey(month);
  const monthEnd = monthEndKey(month);
  const denominatorEnd = compareDateKeys(todayKey, monthEnd) < 0 ? todayKey : monthEnd;
  const plannedForRate = compareDateKeys(denominatorEnd, monthStart) >= 0
    ? plannedHabitDateKeysBetween(schedule, monthStart, denominatorEnd)
    : [];
  const plannedInMonth = plannedHabitDateKeysBetween(schedule, monthStart, monthEnd);
  const monthCheckIns = plannedInMonth.filter((date) => checkInDateKeys.has(date)).length;
  const monthPlanned = plannedForRate.length;
  const monthCompletionRate = monthPlanned === 0 ? 0 : Math.round((plannedForRate.filter((date) => checkInDateKeys.has(date)).length / monthPlanned) * 100);
  const streakEnd = schedule.endDate && compareDateKeys(schedule.endDate, todayKey) < 0 ? schedule.endDate : todayKey;
  const plannedUntilToday = plannedHabitDateKeysBetween(schedule, schedule.startDate, streakEnd);
  let currentStreak = 0;
  let index = plannedUntilToday.length - 1;

  if (index >= 0 && plannedUntilToday[index] === todayKey && !checkInDateKeys.has(todayKey)) {
    index -= 1;
  }

  for (; index >= 0; index -= 1) {
    const date = plannedUntilToday[index];
    if (!date || !checkInDateKeys.has(date)) {
      break;
    }
    currentStreak += 1;
  }

  return {
    monthCheckIns,
    monthPlanned,
    monthCompletionRate,
    totalCheckIns: checkInDateKeys.size,
    currentStreak,
    currentStreakUnit: schedule.frequency === "DAILY" ? "天" : "次"
  };
}

export function buildHabitCalendarDays(
  schedule: HabitSchedule,
  checkIns: Map<string, HabitCheckInInfo>,
  month: string,
  todayKey = toLocalDateKey()
): ApiHabitCalendarDay[] {
  const monthStart = monthStartKey(month);
  const monthEnd = monthEndKey(month);
  const days: ApiHabitCalendarDay[] = [];

  for (let cursor = monthStart; compareDateKeys(cursor, monthEnd) <= 0; cursor = addDays(cursor, 1)) {
    const checkIn = checkIns.get(cursor);
    days.push({
      date: cursor,
      day: parseDateKey(cursor).day,
      planned: isHabitPlannedOn(schedule, cursor),
      checked: Boolean(checkIn),
      future: compareDateKeys(cursor, todayKey) > 0,
      note: checkIn?.note ?? null,
      checkInId: checkIn?.id ?? null
    });
  }

  return days;
}
