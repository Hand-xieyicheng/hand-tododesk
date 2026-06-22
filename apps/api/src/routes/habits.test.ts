import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InjectOptions, Response } from "light-my-request";
import { formatDateKey, parseDateKey, toLocalDateKey } from "@todo/shared";
import { buildApp } from "../app.js";
import { signAccessToken } from "../services/tokens.js";

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
  queryRows: db.queryRows,
  transaction: (callback: (connection: { execute: typeof db.execute }) => Promise<unknown>) => callback({ execute: db.execute })
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
    title: "学习日语",
    notes: null,
    icon: "BookOpen",
    color: "mint",
    frequency: "DAILY",
    interval: 1,
    weekDays: "[]",
    monthDays: "[]",
    startDate: "2020-01-01",
    endDate: null,
    sortOrder: 1000,
    archivedAt: null,
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    updatedAt: new Date("2026-06-01T00:00:00.000Z"),
    ...patch
  };
}

function checkInRow(patch: Partial<Record<string, unknown>> = {}) {
  const today = toLocalDateKey();
  return {
    id: "check-1",
    habitId: "habit-1",
    userId: "user-1",
    date: today,
    note: "完成一课",
    createdAt: new Date(`${today}T00:00:00.000Z`),
    updatedAt: new Date(`${today}T00:00:00.000Z`),
    ...patch
  };
}

async function injectHabit(method: InjectOptions["method"], url: string, payload?: InjectOptions["payload"]): Promise<Response> {
  const app = await buildApp();
  const response = await app.inject({
    method,
    url,
    headers: {
      authorization: `Bearer ${signAccessToken({ sub: "user-1", email: "todo@example.com" })}`
    },
    payload
  } satisfies InjectOptions);
  await app.close();
  return response;
}

describe("habit routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.execute.mockResolvedValue({ affectedRows: 1 });
    db.queryOne.mockResolvedValue(null);
    db.queryRows.mockResolvedValue([]);
  });

  it("lists habits with today state and stats", async () => {
    db.queryRows
      .mockResolvedValueOnce([habitRow()])
      .mockResolvedValueOnce([checkInRow()]);

    const response = await injectHabit("GET", "/habits");

    expect(response.statusCode).toBe(200);
    expect(response.json().habits[0]).toMatchObject({
      id: "habit-1",
      title: "学习日语",
      todayChecked: true,
      stats: {
        monthCheckIns: 1,
        totalCheckIns: 1
      }
    });
  });

  it("creates weekly habits with selected weekdays", async () => {
    db.queryOne
      .mockResolvedValueOnce({ nextSortOrder: 1000 })
      .mockResolvedValueOnce(habitRow({
        frequency: "WEEKLY",
        weekDays: "[\"MO\",\"WE\"]"
      }));

    const response = await injectHabit("POST", "/habits", {
      title: " 跑步 ",
      icon: "Footprints",
      color: "blue",
      frequency: "WEEKLY",
      interval: 1,
      weekDays: ["MO", "WE"],
      monthDays: [],
      startDate: "2026-06-01"
    });

    expect(response.statusCode).toBe(201);
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO `Habit`"), expect.arrayContaining([
      "generated-id",
      "user-1",
      "跑步",
      null,
      "Footprints",
      "blue",
      "WEEKLY"
    ]));
  });

  it("archives and restores habits through patch", async () => {
    db.queryOne
      .mockResolvedValueOnce(habitRow())
      .mockResolvedValueOnce(habitRow({ archivedAt: new Date() }));

    const response = await injectHabit("PATCH", "/habits/habit-1", { archived: true });

    expect(response.statusCode).toBe(200);
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining("`archivedAt` = ?"), expect.arrayContaining([
      expect.any(Date),
      "habit-1",
      "user-1"
    ]));
  });

  it("rejects future check-ins", async () => {
    db.queryOne.mockResolvedValueOnce(habitRow());
    const futureDate = addDays(toLocalDateKey(), 1);

    const response = await injectHabit("POST", "/habits/habit-1/check-ins", {
      date: futureDate,
      note: "too early"
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "Cannot check in future dates" });
  });

  it("upserts valid check-ins and allows cancellation", async () => {
    db.queryOne
      .mockResolvedValueOnce(habitRow())
      .mockResolvedValueOnce(checkInRow())
      .mockResolvedValueOnce(habitRow());
    const today = toLocalDateKey();

    const createResponse = await injectHabit("POST", "/habits/habit-1/check-ins", {
      date: today,
      note: "完成一课"
    });
    const deleteResponse = await injectHabit("DELETE", `/habits/habit-1/check-ins/${today}`);

    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.json().checkIn).toMatchObject({ date: today, note: "完成一课" });
    expect(deleteResponse.statusCode).toBe(204);
  });
});
