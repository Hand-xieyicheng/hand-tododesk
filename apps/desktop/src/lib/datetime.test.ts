import { describe, expect, it } from "vitest";
import { formatTaskTimeRange, getTodayEndDatetimeLocal, getTomorrowEndDatetimeLocal, getWeekEndDatetimeLocal, isValidTaskTimeRange, toDatetimeLocal } from "./datetime";

describe("datetime helpers", () => {
  it("formats a date for datetime-local inputs", () => {
    expect(toDatetimeLocal(new Date(2026, 5, 17, 8, 30))).toBe("2026-06-17T08:30");
  });

  it("returns today's end time for datetime-local inputs", () => {
    expect(getTodayEndDatetimeLocal(new Date(2026, 5, 17, 8, 30))).toBe("2026-06-17T23:59");
  });

  it("returns quick deadline presets in local time", () => {
    expect(getTomorrowEndDatetimeLocal(new Date(2026, 5, 17, 8, 30))).toBe("2026-06-18T23:59");
    expect(getWeekEndDatetimeLocal(new Date(2026, 5, 17, 8, 30))).toBe("2026-06-21T23:59");
  });

  it("validates and formats task time ranges", () => {
    expect(isValidTaskTimeRange("2026-06-17T08:30", "2026-06-17T23:59")).toBe(true);
    expect(isValidTaskTimeRange("2026-06-18T08:30", "2026-06-17T23:59")).toBe(false);
    expect(formatTaskTimeRange({
      startAt: "2026-06-17T00:30:00.000Z",
      dueAt: "2026-06-17T10:30:00.000Z"
    })).toContain("开始");
    expect(formatTaskTimeRange({ startAt: null, dueAt: null })).toBe("无时间");
  });
});
