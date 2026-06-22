import { describe, expect, it } from "vitest";
import { toMysqlDate } from "./db.js";

function pad(value: number) {
  return String(value).padStart(2, "0");
}

describe("db date formatting", () => {
  it("formats DATETIME values in local time instead of UTC", () => {
    const date = new Date(2026, 5, 22, 17, 12, 2, 345);

    expect(toMysqlDate(date)).toBe([
      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
      `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
    ].join(" "));
  });

  it("keeps nullable dates as null", () => {
    expect(toMysqlDate(null)).toBeNull();
    expect(toMysqlDate(undefined)).toBeNull();
  });
});
