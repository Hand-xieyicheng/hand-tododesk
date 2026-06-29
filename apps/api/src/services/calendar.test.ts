import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildOccurrences, expandTaskOccurrences } from "./calendar.js";

const baseTask = {
  id: "task_1",
  title: "写周报",
  dueAt: new Date("2026-06-01T09:00:00.000Z"),
  priority: "IMPORTANT_NOT_URGENT" as const,
  status: "TODO" as const,
  exceptions: []
};

describe("calendar recurrence expansion", () => {
  const originalTimezone = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = "Asia/Shanghai";
  });

  afterAll(() => {
    process.env.TZ = originalTimezone;
  });

  it("expands weekly tasks inside the requested range", () => {
    const dates = expandTaskOccurrences({
      ...baseTask,
      recurrenceRule: {
        frequency: "WEEKLY",
        interval: 1,
        byWeekday: ["MO"],
        until: null,
        count: null
      }
    }, new Date("2026-06-01T00:00:00.000Z"), new Date("2026-06-30T23:59:59.000Z"));

    expect(dates.map((date) => date.toISOString().slice(0, 10))).toEqual([
      "2026-06-01",
      "2026-06-08",
      "2026-06-15",
      "2026-06-22",
      "2026-06-29"
    ]);
  });

  it("removes skipped occurrences and marks completed exceptions", () => {
    const task = {
      ...baseTask,
      recurrenceRule: {
        frequency: "DAILY" as const,
        interval: 1,
        byWeekday: null,
        until: null,
        count: 3
      },
      exceptions: [
        {
          occurrenceDate: new Date("2026-06-02T09:00:00.000Z"),
          status: "SKIPPED" as const,
          rescheduledDate: null
        },
        {
          occurrenceDate: new Date("2026-06-03T09:00:00.000Z"),
          status: "COMPLETED" as const,
          rescheduledDate: null
        }
      ]
    };

    const occurrences = buildOccurrences([task], new Date("2026-06-01T00:00:00.000Z"), new Date("2026-06-04T00:00:00.000Z"), () => ({
      id: "task_1",
      title: "写周报",
      notes: null,
      startAt: null,
      dueAt: "2026-06-01T09:00:00.000Z",
      priority: "IMPORTANT_NOT_URGENT",
      status: "TODO",
      sortOrder: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      completedAt: null,
      recurrenceRule: task.recurrenceRule,
      tags: [],
      pomodoroCompletedCount: 0,
      pomodoroCompletedMinutes: 0
    }));

    expect(occurrences.map((item) => [item.date.slice(0, 10), item.status])).toEqual([
      ["2026-06-01", "TODO"],
      ["2026-06-03", "COMPLETED"]
    ]);
  });

  it("uses Beijing date keys for occurrences crossing the UTC day boundary", () => {
    const task = {
      ...baseTask,
      dueAt: new Date("2026-06-26T16:30:00.000Z"),
      recurrenceRule: null
    };

    const occurrences = buildOccurrences(
      [task],
      new Date("2026-06-26T16:00:00.000Z"),
      new Date("2026-06-27T16:00:00.000Z"),
      () => ({
        id: "task_1",
        title: "夜间任务",
        notes: null,
        startAt: null,
        dueAt: "2026-06-26T16:30:00.000Z",
        priority: "IMPORTANT_NOT_URGENT",
        status: "TODO",
        sortOrder: null,
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
        completedAt: null,
        recurrenceRule: null,
        tags: [],
        pomodoroCompletedCount: 0,
        pomodoroCompletedMinutes: 0
      })
    );

    expect(occurrences.map((item) => item.id)).toEqual(["task_1:2026-06-27"]);
  });
});
