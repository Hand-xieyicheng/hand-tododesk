import { describe, expect, it } from "vitest";
import { getTodayEndDatetimeLocal, toDatetimeLocal } from "./datetime";

describe("datetime helpers", () => {
  it("formats a date for datetime-local inputs", () => {
    expect(toDatetimeLocal(new Date(2026, 5, 17, 8, 30))).toBe("2026-06-17T08:30");
  });

  it("returns today's end time for datetime-local inputs", () => {
    expect(getTodayEndDatetimeLocal(new Date(2026, 5, 17, 8, 30))).toBe("2026-06-17T23:59");
  });
});
