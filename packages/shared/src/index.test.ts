import { describe, expect, it } from "vitest";
import {
  appBootstrapResponseSchema,
  appCloseBehaviorValues,
  changeEmailRequestSchema,
  changePasswordRequestSchema,
  defaultAppFeatureFlags,
  displaySizeValues,
  fontFamilyValues,
  footerTypeValues,
  releaseChannelValues,
  sortTasksForDisplay,
  taskCardDisplayModeValues,
  taskViewModeValues,
  titleColorValues,
  updateThemePreferenceRequestSchema,
  updateProfileRequestSchema,
  userGenderValues
} from "./index";
import type { ApiTask } from "./index";

describe("profile schemas", () => {
  it("accepts planned gender values", () => {
    expect(userGenderValues).toEqual(["PRIVATE", "MALE", "FEMALE", "OTHER"]);
    expect(updateProfileRequestSchema.parse({ name: "Todo User", gender: "OTHER" })).toEqual({
      name: "Todo User",
      gender: "OTHER"
    });
  });

  it("normalizes email changes and validates password changes", () => {
    expect(changeEmailRequestSchema.parse({ email: " NEW@Example.COM ", currentPassword: "secret" }).email).toBe("new@example.com");
    expect(changePasswordRequestSchema.safeParse({ currentPassword: "secret", newPassword: "abc" }).success).toBe(false);
    expect(changePasswordRequestSchema.safeParse({ currentPassword: "secret", newPassword: "abc12345" }).success).toBe(true);
  });

  it("accepts persisted appearance preferences", () => {
    expect(footerTypeValues).toEqual(["sea", "tree"]);
    expect(taskViewModeValues).toEqual(["list", "quadrant"]);
    expect(taskCardDisplayModeValues).toEqual(["full", "title"]);
    expect(appCloseBehaviorValues).toEqual(["hide", "quit"]);
    expect(displaySizeValues).toEqual(["small", "default", "large"]);
    expect(fontFamilyValues).toEqual([
      "system",
      "lemi-chunxu-wanxing",
      "lemi-muhe-yuanti",
      "lemi-zhixia-qianfeng",
      "nanxi-xin-yuanti",
      "lemi-xiaonaipao",
      "baiwuchang-keke"
    ]);
    expect(titleColorValues).toEqual([
      "default",
      "app-pink",
      "purple",
      "app-blue",
      "app-yellow",
      "app-orange",
      "app-teal",
      "app-green",
      "app-red",
      "lime-green",
      "yellow-green",
      "brown",
      "warm-peach-pink"
    ]);
    expect(updateThemePreferenceRequestSchema.parse({ titleColor: "app-orange" })).toEqual({ titleColor: "app-orange" });
    expect(updateThemePreferenceRequestSchema.parse({ footerVisible: false })).toEqual({ footerVisible: false });
    expect(updateThemePreferenceRequestSchema.parse({ footerType: "tree" })).toEqual({ footerType: "tree" });
    expect(updateThemePreferenceRequestSchema.parse({ showCompletedTasks: false })).toEqual({ showCompletedTasks: false });
    expect(updateThemePreferenceRequestSchema.parse({ taskViewMode: "quadrant" })).toEqual({ taskViewMode: "quadrant" });
    expect(updateThemePreferenceRequestSchema.parse({ taskCardDisplayMode: "full" })).toEqual({ taskCardDisplayMode: "full" });
    expect(updateThemePreferenceRequestSchema.parse({ taskCardDisplayMode: "title" })).toEqual({ taskCardDisplayMode: "title" });
    expect(updateThemePreferenceRequestSchema.safeParse({ taskCardDisplayMode: "compact" }).success).toBe(false);
    expect(updateThemePreferenceRequestSchema.parse({ appCloseBehavior: "hide" })).toEqual({ appCloseBehavior: "hide" });
    expect(updateThemePreferenceRequestSchema.parse({ appCloseBehavior: "quit" })).toEqual({ appCloseBehavior: "quit" });
    expect(updateThemePreferenceRequestSchema.safeParse({ appCloseBehavior: "close" }).success).toBe(false);
    expect(updateThemePreferenceRequestSchema.parse({ displaySize: "small" })).toEqual({ displaySize: "small" });
    expect(updateThemePreferenceRequestSchema.parse({ displaySize: "default" })).toEqual({ displaySize: "default" });
    expect(updateThemePreferenceRequestSchema.parse({ displaySize: "large" })).toEqual({ displaySize: "large" });
    expect(updateThemePreferenceRequestSchema.parse({ fontFamily: "system" })).toEqual({ fontFamily: "system" });
    expect(updateThemePreferenceRequestSchema.parse({ fontFamily: "lemi-muhe-yuanti" })).toEqual({ fontFamily: "lemi-muhe-yuanti" });
    expect(updateThemePreferenceRequestSchema.parse({ fontFamily: "nanxi-xin-yuanti" })).toEqual({ fontFamily: "nanxi-xin-yuanti" });
    expect(updateThemePreferenceRequestSchema.parse({ fontFamily: "lemi-xiaonaipao" })).toEqual({ fontFamily: "lemi-xiaonaipao" });
    expect(updateThemePreferenceRequestSchema.parse({ fontFamily: "baiwuchang-keke" })).toEqual({ fontFamily: "baiwuchang-keke" });
    expect(updateThemePreferenceRequestSchema.safeParse({ fontFamily: "serif" }).success).toBe(false);
    expect(updateThemePreferenceRequestSchema.parse({ themeId: "shinchan", titleColor: "warm-peach-pink" })).toEqual({
      themeId: "shinchan",
      titleColor: "warm-peach-pink"
    });
    expect(updateThemePreferenceRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe("app bootstrap schema", () => {
  it("accepts stable desktop version metadata and feature flags", () => {
    expect(releaseChannelValues).toEqual(["stable"]);
    expect(defaultAppFeatureFlags).toEqual({
      calendar: true,
      pomodoro: true,
      taskQuadrant: true,
      floatingCard: true
    });

    expect(appBootstrapResponseSchema.parse({
      apiVersion: "0.2.3",
      releaseChannel: "stable",
      desktop: {
        minimumVersion: "0.1.0",
        latestVersion: "0.2.3",
        updateEndpoint: "https://github.com/Hand-xieyicheng/hand-tododesk/releases/latest/download/latest.json"
      },
      featureFlags: {
        calendar: true,
        pomodoro: false,
        taskQuadrant: true,
        floatingCard: true
      }
    }).featureFlags.pomodoro).toBe(false);
  });

  it("rejects unsupported release channels", () => {
    expect(appBootstrapResponseSchema.safeParse({
      apiVersion: "0.2.3",
      releaseChannel: "beta",
      desktop: {
        minimumVersion: "0.1.0",
        latestVersion: "0.2.3",
        updateEndpoint: "https://github.com/Hand-xieyicheng/hand-tododesk/releases/latest/download/latest.json"
      },
      featureFlags: defaultAppFeatureFlags
    }).success).toBe(false);
  });
});

describe("task display sorting", () => {
  it("puts unfinished tasks first and sorts each group by created date ascending", () => {
    const tasks = [
      { id: "done-new", status: "COMPLETED", createdAt: "2026-06-04T00:00:00.000Z" },
      { id: "todo-new", status: "TODO", createdAt: "2026-06-03T00:00:00.000Z" },
      { id: "done-old", status: "COMPLETED", createdAt: "2026-06-01T00:00:00.000Z" },
      { id: "todo-old", status: "TODO", createdAt: "2026-06-02T00:00:00.000Z" }
    ] satisfies Array<Pick<ApiTask, "id" | "status" | "createdAt">>;

    expect(sortTasksForDisplay(tasks).map((task) => task.id)).toEqual([
      "todo-old",
      "todo-new",
      "done-old",
      "done-new"
    ]);
    expect(tasks.map((task) => task.id)).toEqual(["done-new", "todo-new", "done-old", "todo-old"]);
  });
});
