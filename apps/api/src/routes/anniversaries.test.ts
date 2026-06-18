import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InjectOptions, Response } from "light-my-request";
import { buildApp } from "../app.js";
import { signAccessToken } from "../services/tokens.js";

const db = vi.hoisted(() => ({
  execute: vi.fn(),
  queryOne: vi.fn(),
  queryRows: vi.fn()
}));

vi.mock("../db.js", () => ({
  asDate: (value: unknown) => value instanceof Date ? value : new Date(String(value)),
  execute: db.execute,
  id: () => "anniversary-new",
  queryOne: db.queryOne,
  queryRows: db.queryRows
}));

const token = signAccessToken({ sub: "user-1", email: "todo@example.com" });

const baseRow = {
  id: "anniversary-1",
  userId: "user-1",
  title: "使用滴答清单",
  notes: null,
  category: "ANNIVERSARY",
  date: "2019-12-09",
  repeat: "NONE",
  direction: "AUTO",
  cardStyle: "lavender",
  calendarType: "SOLAR",
  lunarMonth: null,
  lunarDay: null,
  solarTerm: null,
  sortOrder: 1000,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z"
};

async function injectAnniversary(method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url = "/anniversaries", payload?: InjectOptions["payload"]): Promise<Response> {
  const app = await buildApp();
  const response = await app.inject({
    method,
    url,
    headers: {
      authorization: `Bearer ${token}`
    },
    payload
  } satisfies InjectOptions);
  await app.close();
  return response;
}

describe("anniversary routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    db.execute.mockResolvedValue({ affectedRows: 1 });
  });

  it("lists anniversaries with computed display fields", async () => {
    db.queryRows.mockResolvedValue([baseRow]);

    const response = await injectAnniversary("GET");

    expect(response.statusCode).toBe(200);
    expect(response.json().anniversaries).toEqual([
      expect.objectContaining({
        id: "anniversary-1",
        title: "使用滴答清单",
        sortOrder: 1000,
        displayDirection: "ELAPSED",
        displayDate: "2019-12-09",
        displaySubtext: "距离 2019/12/9 已经"
      })
    ]);
    expect(db.queryRows).toHaveBeenCalledWith(expect.stringContaining("AnniversaryEvent"), ["user-1"]);
  });

  it("creates a holiday anniversary and serializes lunar fields", async () => {
    const createdRow = {
      ...baseRow,
      id: "anniversary-new",
      title: "春节",
      category: "HOLIDAY",
      date: "2027-02-06",
      repeat: "YEARLY",
      direction: "COUNTDOWN",
      cardStyle: "rose",
      calendarType: "LUNAR",
      lunarMonth: 1,
      lunarDay: 1
    };
    db.queryOne
      .mockResolvedValueOnce({ nextSortOrder: 3000 })
      .mockResolvedValueOnce(createdRow);

    const response = await injectAnniversary("POST", "/anniversaries", {
      title: "春节",
      category: "HOLIDAY",
      date: "2027-02-06",
      repeat: "YEARLY",
      direction: "COUNTDOWN",
      cardStyle: "rose",
      calendarType: "LUNAR",
      lunarMonth: 1,
      lunarDay: 1
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().anniversary).toMatchObject({
      id: "anniversary-new",
      title: "春节",
      calendarType: "LUNAR",
      lunarMonth: 1,
      lunarDay: 1,
      displayDate: "2027-02-06"
    });
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO `AnniversaryEvent`"), [
      "anniversary-new",
      "user-1",
      "春节",
      null,
      "HOLIDAY",
      "2027-02-06",
      "YEARLY",
      "COUNTDOWN",
      "rose",
      "LUNAR",
      1,
      1,
      null,
      3000
    ]);
  });

  it("updates anniversary order for the authenticated user", async () => {
    db.queryRows.mockResolvedValue([{ id: "anniversary-2" }, { id: "anniversary-1" }]);

    const response = await injectAnniversary("PUT", "/anniversaries/order", {
      orderedIds: ["anniversary-2", "anniversary-1"]
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    expect(db.queryRows).toHaveBeenCalledWith(expect.stringContaining("WHERE `userId` = ? AND `id` IN (?, ?)"), [
      "user-1",
      "anniversary-2",
      "anniversary-1"
    ]);
    expect(db.execute).toHaveBeenCalledWith(
      "UPDATE `AnniversaryEvent` SET `sortOrder` = ?, `updatedAt` = NOW(3) WHERE `id` = ? AND `userId` = ?",
      [1000, "anniversary-2", "user-1"]
    );
    expect(db.execute).toHaveBeenCalledWith(
      "UPDATE `AnniversaryEvent` SET `sortOrder` = ?, `updatedAt` = NOW(3) WHERE `id` = ? AND `userId` = ?",
      [2000, "anniversary-1", "user-1"]
    );
  });

  it("rejects ordering anniversaries owned by another user", async () => {
    db.queryRows.mockResolvedValue([{ id: "anniversary-1" }]);

    const response = await injectAnniversary("PUT", "/anniversaries/order", {
      orderedIds: ["anniversary-1", "anniversary-other"]
    });

    expect(response.statusCode).toBe(404);
  });

  it("updates only the authenticated user's anniversary", async () => {
    db.queryOne
      .mockResolvedValueOnce(baseRow)
      .mockResolvedValueOnce({ ...baseRow, title: "使用 TodoDesk", cardStyle: "mint" });

    const response = await injectAnniversary("PATCH", "/anniversaries/anniversary-1", {
      title: "使用 TodoDesk",
      cardStyle: "mint"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().anniversary).toMatchObject({
      title: "使用 TodoDesk",
      cardStyle: "mint"
    });
    expect(db.queryOne).toHaveBeenCalledWith(expect.stringContaining("WHERE `id` = ? AND `userId` = ?"), ["anniversary-1", "user-1"]);
  });

  it("returns 404 for another user's anniversary", async () => {
    db.queryOne.mockResolvedValue(null);

    const response = await injectAnniversary("PATCH", "/anniversaries/anniversary-other", {
      title: "不能编辑"
    });

    expect(response.statusCode).toBe(404);
  });

  it("deletes only the authenticated user's anniversary", async () => {
    db.execute.mockResolvedValue({ affectedRows: 1 });

    const response = await injectAnniversary("DELETE", "/anniversaries/anniversary-1");

    expect(response.statusCode).toBe(204);
    expect(db.execute).toHaveBeenCalledWith(
      "DELETE FROM `AnniversaryEvent` WHERE `id` = ? AND `userId` = ?",
      ["anniversary-1", "user-1"]
    );
  });

  it("rejects invalid lunar anniversaries", async () => {
    const response = await injectAnniversary("POST", "/anniversaries", {
      title: "春节",
      category: "HOLIDAY",
      date: "2027-02-06",
      repeat: "YEARLY",
      calendarType: "LUNAR"
    });

    expect(response.statusCode).toBe(400);
  });
});
