import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AnniversaryDomainError,
  createAnniversary,
  deleteAnniversary,
  listAnniversaries,
  updateAnniversary
} from "./anniversary-domain.js";

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

const baseRow = {
  id: "anniversary-1",
  userId: "user-1",
  title: "生日",
  notes: null,
  category: "BIRTHDAY",
  date: "2027-03-12",
  repeat: "YEARLY",
  direction: "COUNTDOWN",
  cardStyle: "lavender",
  calendarType: "SOLAR",
  lunarMonth: null,
  lunarDay: null,
  solarTerm: null,
  sortOrder: 1000,
  createdAt: "2026-07-10T00:00:00.000Z",
  updatedAt: "2026-07-10T00:00:00.000Z"
};

describe("anniversary domain service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.execute.mockResolvedValue({ affectedRows: 1 });
    db.queryOne.mockResolvedValue(null);
    db.queryRows.mockResolvedValue([]);
  });

  it("lists only the user's anniversaries with display fields", async () => {
    db.queryRows.mockResolvedValueOnce([baseRow]);

    await expect(listAnniversaries("user-1")).resolves.toEqual([
      expect.objectContaining({
        id: "anniversary-1",
        title: "生日",
        calendarType: "SOLAR",
        displayDate: "2027-03-12"
      })
    ]);
    expect(db.queryRows).toHaveBeenCalledWith(expect.stringContaining("WHERE `userId` = ?"), ["user-1"]);
  });

  it("creates a birthday with normalized calendar fields", async () => {
    db.queryOne
      .mockResolvedValueOnce({ nextSortOrder: 2000 })
      .mockResolvedValueOnce({ ...baseRow, id: "anniversary-new", sortOrder: 2000 });

    await expect(createAnniversary("user-1", {
      title: "生日",
      notes: null,
      category: "BIRTHDAY",
      date: "2027-03-12",
      repeat: "YEARLY",
      direction: "COUNTDOWN",
      cardStyle: "lavender",
      calendarType: "SOLAR",
      lunarMonth: null,
      lunarDay: null,
      solarTerm: null
    })).resolves.toMatchObject({
      id: "anniversary-new",
      title: "生日",
      calendarType: "SOLAR",
      lunarMonth: null,
      lunarDay: null
    });

    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO `AnniversaryEvent`"),
      expect.arrayContaining(["anniversary-new", "user-1", "生日", "BIRTHDAY", "2027-03-12"])
    );
  });

  it("normalizes partial calendar updates against the existing record", async () => {
    const lunarRow = {
      ...baseRow,
      calendarType: "LUNAR",
      lunarMonth: 2,
      lunarDay: 4
    };
    db.queryOne
      .mockResolvedValueOnce(lunarRow)
      .mockResolvedValueOnce(baseRow);

    await expect(updateAnniversary("user-1", "anniversary-1", {
      calendarType: "SOLAR"
    })).resolves.toMatchObject({
      calendarType: "SOLAR",
      lunarMonth: null,
      lunarDay: null
    });

    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE `AnniversaryEvent` SET"),
      expect.arrayContaining(["SOLAR", null, null, null, "anniversary-1", "user-1"])
    );
  });

  it("rejects updates for another user's anniversary", async () => {
    db.queryOne.mockResolvedValueOnce(null);

    await expect(updateAnniversary("user-1", "anniversary-other", {
      title: "不能编辑"
    })).rejects.toEqual(expect.any(AnniversaryDomainError));
    await expect(updateAnniversary("user-1", "anniversary-other", {
      title: "不能编辑"
    })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("deletes only an owned anniversary", async () => {
    await expect(deleteAnniversary("user-1", "anniversary-1")).resolves.toBeUndefined();
    expect(db.execute).toHaveBeenCalledWith(
      "DELETE FROM `AnniversaryEvent` WHERE `id` = ? AND `userId` = ?",
      ["anniversary-1", "user-1"]
    );

    db.execute.mockResolvedValueOnce({ affectedRows: 0 });
    await expect(deleteAnniversary("user-1", "anniversary-other")).rejects.toMatchObject({
      code: "NOT_FOUND"
    });
  });
});
