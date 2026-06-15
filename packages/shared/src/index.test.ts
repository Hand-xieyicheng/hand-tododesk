import { describe, expect, it } from "vitest";
import {
  changeEmailRequestSchema,
  changePasswordRequestSchema,
  displaySizeValues,
  footerTypeValues,
  taskViewModeValues,
  titleColorValues,
  updateThemePreferenceRequestSchema,
  updateProfileRequestSchema,
  userGenderValues
} from "./index";

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
    expect(displaySizeValues).toEqual(["small", "default", "large"]);
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
    expect(updateThemePreferenceRequestSchema.parse({ displaySize: "small" })).toEqual({ displaySize: "small" });
    expect(updateThemePreferenceRequestSchema.parse({ displaySize: "default" })).toEqual({ displaySize: "default" });
    expect(updateThemePreferenceRequestSchema.parse({ displaySize: "large" })).toEqual({ displaySize: "large" });
    expect(updateThemePreferenceRequestSchema.parse({ themeId: "shinchan", titleColor: "warm-peach-pink" })).toEqual({
      themeId: "shinchan",
      titleColor: "warm-peach-pink"
    });
    expect(updateThemePreferenceRequestSchema.safeParse({}).success).toBe(false);
  });
});
