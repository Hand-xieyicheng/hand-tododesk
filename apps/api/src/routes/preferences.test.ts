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
  themeId: "peach",
  titleColor: "app-teal",
  footerVisible: 1,
  footerType: "sea",
  showCompletedTasks: 1,
  taskViewMode: "list",
  taskCardDisplayMode: "full",
  floatingCardThemeId: "warm-paper",
  floatingCardViewMode: "list",
  appCloseBehavior: "hide",
  displaySize: "default",
  visibleSidebarModules: "tasks,memos,anniversaries,habits,calendar,pomodoro",
  sidebarCollapsed: 0,
  printButtonEnabled: 0,
  floatingCardHabitCheckInEnabled: 1,
  pageAnimationEnabled: 1,
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
      themeId: "warm-paper",
      taskCardDisplayMode: "full",
      floatingCardThemeId: "warm-paper",
      floatingCardViewMode: "list",
      appCloseBehavior: "hide",
      visibleSidebarModules: ["tasks", "memos", "anniversaries", "habits", "calendar", "pomodoro"],
      sidebarCollapsed: false,
      printButtonEnabled: false,
      floatingCardHabitCheckInEnabled: true,
      pageAnimationEnabled: true
    });
  });

  it("normalizes legacy and invalid stored theme ids", async () => {
    db.queryOne.mockResolvedValueOnce({ ...currentPreference, themeId: "shinchan" });

    const legacyResponse = await injectPreference("GET");

    expect(legacyResponse.statusCode).toBe(200);
    expect(legacyResponse.json()).toMatchObject({
      themeId: "peach"
    });

    db.queryOne.mockResolvedValueOnce({ ...currentPreference, themeId: "custom" });

    const invalidResponse = await injectPreference("GET");

    expect(invalidResponse.statusCode).toBe(200);
    expect(invalidResponse.json()).toMatchObject({
      themeId: "warm-paper"
    });
  });

  it("saves selected global theme ids", async () => {
    db.queryOne.mockResolvedValue(currentPreference);

    const response = await injectPreference("PUT", { themeId: "navy" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      themeId: "navy"
    });
    expect(db.execute).toHaveBeenLastCalledWith(expect.stringContaining("themeId"), [
      "user-1",
      "navy",
      "app-teal",
      true,
      "sea",
      true,
      "list",
      "full",
      "warm-paper",
      "list",
      "hide",
      "default",
      "tasks,memos,anniversaries,habits,calendar,pomodoro",
      false,
      false,
      true,
      true,
      "system"
    ]);
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
      "peach",
      "app-teal",
      true,
      "sea",
      true,
      "list",
      "title",
      "warm-paper",
      "list",
      "hide",
      "default",
      "tasks,memos,anniversaries,habits,calendar,pomodoro",
      false,
      false,
      true,
      true,
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
      "peach",
      "app-teal",
      true,
      "sea",
      true,
      "list",
      "full",
      "black-snow",
      "list",
      "hide",
      "default",
      "tasks,memos,anniversaries,habits,calendar,pomodoro",
      false,
      false,
      true,
      true,
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

  it("saves selected floating card view mode", async () => {
    db.queryOne.mockResolvedValue(currentPreference);

    const response = await injectPreference("PUT", { floatingCardViewMode: "tag" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      floatingCardViewMode: "tag",
      taskViewMode: "list"
    });
    expect(db.execute).toHaveBeenLastCalledWith(expect.stringContaining("floatingCardViewMode"), [
      "user-1",
      "peach",
      "app-teal",
      true,
      "sea",
      true,
      "list",
      "full",
      "warm-paper",
      "tag",
      "hide",
      "default",
      "tasks,memos,anniversaries,habits,calendar,pomodoro",
      false,
      false,
      true,
      true,
      "system"
    ]);
  });

  it("falls back to list floating card view mode for invalid stored values", async () => {
    db.queryOne.mockResolvedValue({ ...currentPreference, floatingCardViewMode: "board" });

    const response = await injectPreference("GET");

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      floatingCardViewMode: "list"
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
      "peach",
      "app-teal",
      true,
      "sea",
      true,
      "list",
      "full",
      "warm-paper",
      "list",
      "hide",
      "default",
      "tasks,memos,anniversaries,habits,calendar,pomodoro",
      false,
      false,
      true,
      true,
      "lemi-chunxu-wanxing"
    ]);
  });

  it("saves print button visibility preference", async () => {
    db.queryOne.mockResolvedValue(currentPreference);

    const response = await injectPreference("PUT", { printButtonEnabled: true });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      printButtonEnabled: true
    });
    expect(db.execute).toHaveBeenLastCalledWith(expect.stringContaining("printButtonEnabled"), [
      "user-1",
      "peach",
      "app-teal",
      true,
      "sea",
      true,
      "list",
      "full",
      "warm-paper",
      "list",
      "hide",
      "default",
      "tasks,memos,anniversaries,habits,calendar,pomodoro",
      false,
      true,
      true,
      true,
      "system"
    ]);
  });

  it("saves floating card habit shortcut preference", async () => {
    db.queryOne.mockResolvedValue(currentPreference);

    const disabledResponse = await injectPreference("PUT", { floatingCardHabitCheckInEnabled: false });

    expect(disabledResponse.statusCode).toBe(200);
    expect(disabledResponse.json()).toMatchObject({
      floatingCardHabitCheckInEnabled: false
    });
    expect(db.execute).toHaveBeenLastCalledWith(expect.stringContaining("floatingCardHabitCheckInEnabled"), [
      "user-1",
      "peach",
      "app-teal",
      true,
      "sea",
      true,
      "list",
      "full",
      "warm-paper",
      "list",
      "hide",
      "default",
      "tasks,memos,anniversaries,habits,calendar,pomodoro",
      false,
      false,
      false,
      true,
      "system"
    ]);

    const enabledResponse = await injectPreference("PUT", { floatingCardHabitCheckInEnabled: true });

    expect(enabledResponse.statusCode).toBe(200);
    expect(enabledResponse.json()).toMatchObject({
      floatingCardHabitCheckInEnabled: true
    });
    expect(db.execute).toHaveBeenLastCalledWith(expect.stringContaining("floatingCardHabitCheckInEnabled"), [
      "user-1",
      "peach",
      "app-teal",
      true,
      "sea",
      true,
      "list",
      "full",
      "warm-paper",
      "list",
      "hide",
      "default",
      "tasks,memos,anniversaries,habits,calendar,pomodoro",
      false,
      false,
      true,
      true,
      "system"
    ]);
  });

  it("saves page animation preference", async () => {
    db.queryOne.mockResolvedValue(currentPreference);

    const response = await injectPreference("PUT", { pageAnimationEnabled: false });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      pageAnimationEnabled: false
    });
    expect(db.execute).toHaveBeenLastCalledWith(expect.stringContaining("pageAnimationEnabled"), [
      "user-1",
      "peach",
      "app-teal",
      true,
      "sea",
      true,
      "list",
      "full",
      "warm-paper",
      "list",
      "hide",
      "default",
      "tasks,memos,anniversaries,habits,calendar,pomodoro",
      false,
      false,
      true,
      false,
      "system"
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
      "peach",
      "app-teal",
      true,
      "sea",
      true,
      "list",
      "full",
      "warm-paper",
      "list",
      "quit",
      "default",
      "tasks,memos,anniversaries,habits,calendar,pomodoro",
      false,
      false,
      true,
      true,
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
      "peach",
      "app-teal",
      true,
      "sea",
      true,
      "list",
      "full",
      "warm-paper",
      "list",
      "hide",
      "default",
      "tasks,memos,anniversaries,habits,calendar,pomodoro",
      true,
      false,
      true,
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
      "peach",
      "app-teal",
      true,
      "sea",
      true,
      "list",
      "full",
      "warm-paper",
      "list",
      "hide",
      "default",
      "memos,tasks",
      false,
      false,
      true,
      true,
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
      "peach",
      "app-teal",
      true,
      "sea",
      true,
      "list",
      "full",
      "warm-paper",
      "list",
      "hide",
      "default",
      "",
      false,
      false,
      true,
      true,
      "system"
    ]);
  });
});
