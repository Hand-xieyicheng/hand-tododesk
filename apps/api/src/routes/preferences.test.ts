import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InjectOptions, Response } from "light-my-request";
import { buildApp } from "../app.js";
import { signAccessToken } from "../services/tokens.js";

const db = vi.hoisted(() => ({
  execute: vi.fn(),
  queryOne: vi.fn()
}));

vi.mock("../db.js", () => ({
  execute: db.execute,
  queryOne: db.queryOne
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
  appCloseBehavior: "hide",
  displaySize: "default",
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
      appCloseBehavior: "hide"
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
      "hide",
      "default",
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
      "hide",
      "default",
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
      "quit",
      "default",
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
});
