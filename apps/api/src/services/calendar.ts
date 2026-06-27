import rrulePackage from "rrule";
import type { Weekday } from "rrule";
import { toLocalDateKey, type CalendarOccurrence, type RecurrenceRuleInput } from "@todo/shared";

const { RRule } = rrulePackage as typeof import("rrule");

const weekdays: Record<string, Weekday> = {
  MO: RRule.MO,
  TU: RRule.TU,
  WE: RRule.WE,
  TH: RRule.TH,
  FR: RRule.FR,
  SA: RRule.SA,
  SU: RRule.SU
};

const frequencies = {
  DAILY: RRule.DAILY,
  WEEKLY: RRule.WEEKLY,
  MONTHLY: RRule.MONTHLY,
  YEARLY: RRule.YEARLY
} as const;

export interface ExpandableTask {
  id: string;
  title: string;
  dueAt: Date | null;
  priority: CalendarOccurrence["priority"];
  status: CalendarOccurrence["status"];
  recurrenceRule: RecurrenceRuleInput | null;
  exceptions: Array<{
    occurrenceDate: Date;
    status: "SKIPPED" | "COMPLETED" | "RESCHEDULED";
    rescheduledDate: Date | null;
  }>;
}

export function toDateKey(date: Date) {
  return toLocalDateKey(date);
}

export function expandTaskOccurrences(task: ExpandableTask, from: Date, to: Date): Date[] {
  if (!task.recurrenceRule) {
    if (!task.dueAt || task.dueAt < from || task.dueAt > to) {
      return [];
    }
    return [task.dueAt];
  }

  const start = task.dueAt ?? from;
  const byweekday = task.recurrenceRule.byWeekday
    ?.map((day) => weekdays[day])
    .filter((day): day is Weekday => day !== undefined);

  const rule = new RRule({
    freq: frequencies[task.recurrenceRule.frequency],
    interval: task.recurrenceRule.interval,
    dtstart: start,
    until: task.recurrenceRule.until ? new Date(task.recurrenceRule.until) : undefined,
    count: task.recurrenceRule.count ?? undefined,
    byweekday
  });

  return rule.between(from, to, true);
}

export function buildOccurrences<TTask extends ExpandableTask>(
  tasks: TTask[],
  from: Date,
  to: Date,
  serializeTask: (task: TTask) => CalendarOccurrence["task"]
): CalendarOccurrence[] {
  const occurrences: CalendarOccurrence[] = [];

  for (const task of tasks) {
    const exceptionMap = new Map(task.exceptions.map((item) => [toDateKey(item.occurrenceDate), item]));
    for (const occurrenceDate of expandTaskOccurrences(task, from, to)) {
      const exception = exceptionMap.get(toDateKey(occurrenceDate));
      if (exception?.status === "SKIPPED") {
        continue;
      }

      const date = exception?.status === "RESCHEDULED" && exception.rescheduledDate
        ? exception.rescheduledDate
        : occurrenceDate;

      occurrences.push({
        id: `${task.id}:${toDateKey(occurrenceDate)}`,
        taskId: task.id,
        title: task.title,
        date: date.toISOString(),
        dueAt: task.dueAt?.toISOString() ?? null,
        status: exception?.status === "COMPLETED" ? "COMPLETED" : task.status,
        priority: task.priority,
        isRecurring: Boolean(task.recurrenceRule),
        exceptionStatus: exception?.status ?? null,
        task: serializeTask(task)
      });
    }
  }

  return occurrences.sort((a, b) => a.date.localeCompare(b.date));
}
