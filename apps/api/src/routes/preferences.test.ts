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
  asDate: (value: unknown) => value instanceof Date ? value : value ? new Date(String(value)) : null,
  execute: db.execute,
  id: () => "generated-id",
  queryOne: db.queryOne,
  queryRows: db.queryRows,
  transaction: (callback: (connection: { execute: typeof db.execute }) => Promise<unknown>) => callback({ execute: db.execute })
}));

const token = signAccessToken({ sub: "user-1", email: "todo@example.com" });

const currentPreference = {
  themeId: "shinchan",
  titleColor: "app-teal",
  footerVisible: 1,
  footerType: "sea",
  showCompletedTasks: 1,
  taskViewMode: "list",
  taskCardDisplayMode: "full",
  floatingCardThemeId: "warm-paper",
  appCloseBehavior: "hide",
  displaySize: "default",
  visibleSidebarModules: "tasks,memos,anniversaries,habits,calendar,pomodoro",
  sidebarCollapsed: 0,
  fontFamily: "system"
};

async function injectPreference(method: "GET" | "PUT", payload?: InjectOptions["payload"]): Promise<Response> {
  const app = await buildApp();
  const response = await app.inject({
    method,
    url: "/preferences/theme",
    headers: {
      authorization: `Bearer ${token}`
    },
    payload
  } satisfies InjectOptions);
  await app.close();
  return response;
}

describe("preference routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.execute.mockResolvedValue({});
  });

  it("returns full card display mode by default", async () => {
    db.queryOne.mockResolvedValue(null);

    const response = await injectPreference("GET");

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      taskCardDisplayMode: "full",
      floatingCardThemeId: "warm-paper",
      appCloseBehavior: "hide",
      visibleSidebarModules: ["tasks", "memos", "anniversaries", "habits", "calendar", "pomodoro"],
      sidebarCollapsed: false
    });
  });

  it("saves title card display mode", async () => {
    db.queryOne.mockResolvedValue(currentPreference);

    const response = await injectPreference("PUT", { taskCardDisplayMode: "title" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      taskCardDisplayMode: "title"
    });
    expect(db.execute).toHaveBeenLastCalledWith(expect.stringContaining("taskCardDisplayMode"), [
      "user-1",
      "shinchan",
      "app-teal",
      true,
      "sea",
      true,
      "list",
      "title",
      "warm-paper",
      "hide",
      "default",
      "tasks,memos,anniversaries,habits,calendar,pomodoro",
      false,
      "system"
    ]);
  });

  it("falls back to full card display mode for invalid stored values", async () => {
    db.queryOne.mockResolvedValue({ ...currentPreference, taskCardDisplayMode: "compact" });

    const response = await injectPreference("GET");

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      taskCardDisplayMode: "full"
    });
  });

  it("saves selected floating card theme", async () => {
    db.queryOne.mockResolvedValue(currentPreference);

    const response = await injectPreference("PUT", { floatingCardThemeId: "black-snow" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      floatingCardThemeId: "black-snow"
    });
    expect(db.execute).toHaveBeenLastCalledWith(expect.stringContaining("floatingCardThemeId"), [
      "user-1",
      "shinchan",
      "app-teal",
      true,
      "sea",
      true,
      "list",
      "full",
      "black-snow",
      "hide",
      "default",
      "tasks,memos,anniversaries,habits,calendar,pomodoro",
      false,
      "system"
    ]);
  });

  it("falls back to warm paper floating card theme for invalid stored values", async () => {
    db.queryOne.mockResolvedValue({ ...currentPreference, floatingCardThemeId: "custom" });

    const response = await injectPreference("GET");

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      floatingCardThemeId: "warm-paper"
    });
  });

  it("saves selected font family", async () => {
    db.queryOne.mockResolvedValue(currentPreference);

    const response = await injectPreference("PUT", { fontFamily: "lemi-chunxu-wanxing" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      fontFamily: "lemi-chunxu-wanxing"
    });
    expect(db.execute).toHaveBeenLastCalledWith(expect.stringContaining("fontFamily"), [
      "user-1",
      "shinchan",
      "app-teal",
      true,
      "sea",
      true,
      "list",
      "full",
      "warm-paper",
      "hide",
      "default",
      "tasks,memos,anniversaries,habits,calendar,pomodoro",
      false,
      "lemi-chunxu-wanxing"
    ]);
  });

  it("falls back to system font for invalid stored values", async () => {
    db.queryOne.mockResolvedValue({ ...currentPreference, fontFamily: "serif" });

    const response = await injectPreference("GET");

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      fontFamily: "system"
    });
  });

  it("saves selected app close behavior", async () => {
    db.queryOne.mockResolvedValue(currentPreference);

    const response = await injectPreference("PUT", { appCloseBehavior: "quit" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      appCloseBehavior: "quit"
    });
    expect(db.execute).toHaveBeenLastCalledWith(expect.stringContaining("appCloseBehavior"), [
      "user-1",
      "shinchan",
      "app-teal",
      true,
      "sea",
      true,
      "list",
      "full",
      "warm-paper",
      "quit",
      "default",
      "tasks,memos,anniversaries,habits,calendar,pomodoro",
      false,
      "system"
    ]);
  });

  it("falls back to hide on close for invalid stored values", async () => {
    db.queryOne.mockResolvedValue({ ...currentPreference, appCloseBehavior: "close" });

    const response = await injectPreference("GET");

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      appCloseBehavior: "hide"
    });
  });

  it("saves sidebar collapsed state", async () => {
    db.queryOne.mockResolvedValue(currentPreference);

    const response = await injectPreference("PUT", { sidebarCollapsed: true });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      sidebarCollapsed: true
    });
    expect(db.execute).toHaveBeenLastCalledWith(expect.stringContaining("sidebarCollapsed"), [
      "user-1",
      "shinchan",
      "app-teal",
      true,
      "sea",
      true,
      "list",
      "full",
      "warm-paper",
      "hide",
      "default",
      "tasks,memos,anniversaries,habits,calendar,pomodoro",
      true,
      "system"
    ]);
  });

  it("saves selected sidebar modules", async () => {
    db.queryOne.mockResolvedValue(currentPreference);

    const response = await injectPreference("PUT", { visibleSidebarModules: ["memos", "tasks"] });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      visibleSidebarModules: ["memos", "tasks"]
    });
    expect(db.execute).toHaveBeenLastCalledWith(expect.stringContaining("visibleSidebarModules"), [
      "user-1",
      "shinchan",
      "app-teal",
      true,
      "sea",
      true,
      "list",
      "full",
      "warm-paper",
      "hide",
      "default",
      "memos,tasks",
      false,
      "system"
    ]);
  });

  it("allows hiding every sidebar module", async () => {
    db.queryOne.mockResolvedValue(currentPreference);

    const response = await injectPreference("PUT", { visibleSidebarModules: [] });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      visibleSidebarModules: []
    });
    expect(db.execute).toHaveBeenLastCalledWith(expect.stringContaining("visibleSidebarModules"), [
      "user-1",
      "shinchan",
      "app-teal",
      true,
      "sea",
      true,
      "list",
      "full",
      "warm-paper",
      "hide",
      "default",
      "",
      false,
      "system"
    ]);
  });
});
