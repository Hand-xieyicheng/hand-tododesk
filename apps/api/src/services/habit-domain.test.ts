import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatDateKey, parseDateKey, toLocalDateKey } from "@todo/shared";
import {
  cancelHabitCheckIn,
  checkInHabit,
  createHabit,
  HabitDomainError,
  updateHabit
} from "./habit-domain.js";

const db = vi.hoisted(() => ({
  execute: vi.fn(),
  queryOne: vi.fn(),
  queryRows: vi.fn()
}));

vi.mock("../db.js", () => ({
  asDate: (value: unknown) => value instanceof Date ? value : value ? new Date(String(value)) : null,
  execute: db.execute,
  id: () => "generated-id",
  queryOne: db.queryOne,
  queryRows: db.queryRows
}));

function addDays(dateKey: string, days: number) {
  const parts = parseDateKey(dateKey);
  const next = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return formatDateKey({
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate()
  });
}

function habitRow(patch: Partial<Record<string, unknown>> = {}) {
  return {
    id: "habit-1",
    userId: "user-1",
    title: "喝咖啡",
    notes: null,
    icon: "Coffee",
    color: "mint",
    frequency: "DAILY",
    interval: 1,
    weekDays: "[]",
    monthDays: "[]",
    startDate: "2026-07-10",
    endDate: null,
    sortOrder: 1000,
    archivedAt: null,
    createdAt: new Date("2026-07-10T00:00:00.000Z"),
    updatedAt: new Date("2026-07-10T00:00:00.000Z"),
    ...patch
  };
}

function checkInRow(date = toLocalDateKey()) {
  return {
    id: "check-1",
    habitId: "habit-1",
    userId: "user-1",
    date,
    note: "已完成",
    createdAt: new Date(`${date}T00:00:00.000Z`),
    updatedAt: new Date(`${date}T00:00:00.000Z`)
  };
}

describe("habit domain service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.execute.mockResolvedValue({ affectedRows: 1 });
    db.queryOne.mockResolvedValue(null);
    db.queryRows.mockResolvedValue([]);
  });

  it("creates an open-ended daily habit", async () => {
    db.queryOne
      .mockResolvedValueOnce({ nextSortOrder: 1000 })
      .mockResolvedValueOnce(habitRow());

    await expect(createHabit("user-1", {
      title: "喝咖啡",
      notes: null,
      icon: "Coffee",
      color: "mint",
      frequency: "DAILY",
      interval: 1,
      weekDays: [],
      monthDays: [],
      startDate: "2026-07-10",
      endDate: null
    })).resolves.toMatchObject({
      title: "喝咖啡",
      endDate: null
    });
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO `Habit`"),
      expect.arrayContaining(["generated-id", "user-1", "喝咖啡", null])
    );
  });

  it("archives and restores an owned habit", async () => {
    db.queryOne
      .mockResolvedValueOnce(habitRow())
      .mockResolvedValueOnce(habitRow({ archivedAt: new Date("2026-07-10T02:00:00.000Z") }))
      .mockResolvedValueOnce(habitRow({ archivedAt: new Date("2026-07-10T02:00:00.000Z") }))
      .mockResolvedValueOnce(habitRow({ archivedAt: null }));

    await expect(updateHabit("user-1", "habit-1", { archived: true })).resolves.toMatchObject({
      archivedAt: expect.any(String)
    });
    await expect(updateHabit("user-1", "habit-1", { archived: false })).resolves.toMatchObject({
      archivedAt: null
    });
    expect(db.execute).toHaveBeenLastCalledWith(
      expect.stringContaining("UPDATE `Habit` SET"),
      expect.arrayContaining([null, "habit-1", "user-1"])
    );
  });

  it("upserts a valid check-in", async () => {
    const today = toLocalDateKey();
    db.queryOne
      .mockResolvedValueOnce(habitRow({ startDate: addDays(today, -30) }))
      .mockResolvedValueOnce(checkInRow(today));

    await expect(checkInHabit("user-1", "habit-1", {
      date: today,
      note: " 已完成 "
    })).resolves.toMatchObject({ date: today, note: "已完成" });
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO `HabitCheckIn`"),
      ["generated-id", "habit-1", "user-1", today, "已完成"]
    );
  });

  it("rejects future check-ins", async () => {
    db.queryOne.mockResolvedValue(habitRow());

    await expect(checkInHabit("user-1", "habit-1", {
      date: addDays(toLocalDateKey(), 1),
      note: null
    })).rejects.toEqual(expect.any(HabitDomainError));
    await expect(checkInHabit("user-1", "habit-1", {
      date: addDays(toLocalDateKey(), 1),
      note: null
    })).rejects.toMatchObject({ code: "FUTURE_CHECK_IN" });
  });

  it("rejects check-ins on an unplanned date", async () => {
    db.queryOne.mockResolvedValueOnce(habitRow({
      frequency: "WEEKLY",
      weekDays: "[]",
      startDate: addDays(toLocalDateKey(), -30)
    }));

    await expect(checkInHabit("user-1", "habit-1", {
      date: toLocalDateKey(),
      note: null
    })).rejects.toMatchObject({ code: "UNPLANNED_DATE" });
  });

  it("cancels an existing non-future check-in", async () => {
    const today = toLocalDateKey();
    db.queryOne.mockResolvedValueOnce(habitRow());

    await expect(cancelHabitCheckIn("user-1", "habit-1", today)).resolves.toBeUndefined();
    expect(db.execute).toHaveBeenCalledWith(
      "DELETE FROM `HabitCheckIn` WHERE `habitId` = ? AND `userId` = ? AND `date` = ?",
      ["habit-1", "user-1", today]
    );
  });
});
