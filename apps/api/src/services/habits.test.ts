import { describe, expect, it } from "vitest";
import { calculateHabitStats, isHabitPlannedOn, plannedHabitDateKeysBetween, type HabitSchedule } from "./habits.js";

const daily: HabitSchedule = {
  frequency: "DAILY",
  interval: 1,
  weekDays: [],
  monthDays: [],
  startDate: "2026-06-01",
  endDate: null
};

describe("habit schedule service", () => {
  it("expands daily interval habits inside date boundaries", () => {
    expect(plannedHabitDateKeysBetween({
      ...daily,
      interval: 2,
      startDate: "2026-06-02",
      endDate: "2026-06-08"
    }, "2026-06-01", "2026-06-10")).toEqual([
      "2026-06-02",
      "2026-06-04",
      "2026-06-06",
      "2026-06-08"
    ]);
  });

  it("supports weekly habits with multiple selected weekdays and intervals", () => {
    const schedule: HabitSchedule = {
      frequency: "WEEKLY",
      interval: 2,
      weekDays: ["MO", "WE"],
      monthDays: [],
      startDate: "2026-06-01",
      endDate: null
    };

    expect(plannedHabitDateKeysBetween(schedule, "2026-06-01", "2026-06-30")).toEqual([
      "2026-06-01",
      "2026-06-03",
      "2026-06-15",
      "2026-06-17",
      "2026-06-29"
    ]);
  });

  it("clamps monthly 29/30/31 habits to short month endings", () => {
    const schedule: HabitSchedule = {
      frequency: "MONTHLY",
      interval: 1,
      weekDays: [],
      monthDays: [29, 30, 31],
      startDate: "2026-01-01",
      endDate: null
    };

    expect(plannedHabitDateKeysBetween(schedule, "2026-02-01", "2026-02-28")).toEqual(["2026-02-28"]);
    expect(isHabitPlannedOn(schedule, "2026-04-30")).toBe(true);
  });

  it("calculates month completion and current streak from planned dates", () => {
    const stats = calculateHabitStats(daily, new Set(["2026-06-01", "2026-06-02", "2026-06-04"]), "2026-06", "2026-06-04");

    expect(stats).toMatchObject({
      monthCheckIns: 3,
      monthPlanned: 4,
      monthCompletionRate: 75,
      totalCheckIns: 3,
      currentStreak: 1,
      currentStreakUnit: "天"
    });
  });

  it("keeps yesterday streak while today's planned habit has not been checked yet", () => {
    const stats = calculateHabitStats(daily, new Set(["2026-06-01", "2026-06-02", "2026-06-03"]), "2026-06", "2026-06-04");

    expect(stats.currentStreak).toBe(3);
  });
});
