import { describe, expect, it } from "vitest";
import {
  anniversaryCardStyleValues,
  anniversaryCategoryValues,
  anniversaryDirectionValues,
  anniversaryRepeatValues,
  appBootstrapResponseSchema,
  appCloseBehaviorValues,
  calculateAnniversaryDisplay,
  changeEmailRequestSchema,
  changePasswordRequestSchema,
  createAnniversaryRequestSchema,
  createHabitRequestSchema,
	  createMemoRequestSchema,
	  createTagRequestSchema,
	  createTaskRequestSchema,
	  defaultAppFeatureFlags,
	  defaultThemeId,
	  displaySizeValues,
	  floatingCardThemeIdValues,
	  fontFamilyValues,
  footerTypeValues,
  habitColorValues,
  habitFrequencyValues,
  habitRecommendedIconValues,
	  releaseChannelValues,
	  legacyThemeIdMap,
	  normalizeThemeId,
	  sortTasksForDisplay,
	  taskCardDisplayModeValues,
	  taskViewModeValues,
	  themeIdValues,
	  titleColorValues,
  resolveBuiltInAnniversaryTemplate,
  updateAnniversaryOrderRequestSchema,
  updateAnniversaryRequestSchema,
  updateHabitRequestSchema,
  updateMemoRequestSchema,
  updateTagRequestSchema,
  updateThemePreferenceRequestSchema,
  updateTaskRequestSchema,
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
	    const expectedThemeIds = [
	      "warm-paper",
	      "white-ink",
	      "black-snow",
	      "cream",
	      "blush",
	      "peach",
	      "lemon",
	      "mint",
	      "sage",
	      "sky",
	      "aqua",
	      "lavender",
	      "coral",
	      "teal",
	      "navy"
	    ];
	    expect(footerTypeValues).toEqual(["sea", "tree"]);
	    expect(themeIdValues).toEqual(expectedThemeIds);
	    expect(defaultThemeId).toBe("warm-paper");
	    expect(legacyThemeIdMap).toMatchObject({
	      default: "warm-paper",
	      shinchan: "peach",
	      labubu: "lavender",
	      doraemon: "sky"
	    });
	    expect(normalizeThemeId("doraemon")).toBe("sky");
	    expect(normalizeThemeId("unknown")).toBe("warm-paper");
	    expect(taskViewModeValues).toEqual(["list", "quadrant", "kanban"]);
	    expect(taskCardDisplayModeValues).toEqual(["full", "title"]);
	    expect(floatingCardThemeIdValues).toEqual(expectedThemeIds);
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
    expect(updateThemePreferenceRequestSchema.parse({ taskViewMode: "kanban" })).toEqual({ taskViewMode: "kanban" });
    expect(updateThemePreferenceRequestSchema.safeParse({ taskViewMode: "board" }).success).toBe(false);
    expect(updateThemePreferenceRequestSchema.parse({ taskCardDisplayMode: "full" })).toEqual({ taskCardDisplayMode: "full" });
    expect(updateThemePreferenceRequestSchema.parse({ taskCardDisplayMode: "title" })).toEqual({ taskCardDisplayMode: "title" });
    expect(updateThemePreferenceRequestSchema.safeParse({ taskCardDisplayMode: "compact" }).success).toBe(false);
    expect(updateThemePreferenceRequestSchema.parse({ floatingCardThemeId: "black-snow" })).toEqual({ floatingCardThemeId: "black-snow" });
    expect(updateThemePreferenceRequestSchema.safeParse({ floatingCardThemeId: "custom" }).success).toBe(false);
    expect(updateThemePreferenceRequestSchema.parse({ appCloseBehavior: "hide" })).toEqual({ appCloseBehavior: "hide" });
    expect(updateThemePreferenceRequestSchema.parse({ appCloseBehavior: "quit" })).toEqual({ appCloseBehavior: "quit" });
    expect(updateThemePreferenceRequestSchema.safeParse({ appCloseBehavior: "close" }).success).toBe(false);
    expect(updateThemePreferenceRequestSchema.parse({ displaySize: "small" })).toEqual({ displaySize: "small" });
    expect(updateThemePreferenceRequestSchema.parse({ displaySize: "default" })).toEqual({ displaySize: "default" });
    expect(updateThemePreferenceRequestSchema.parse({ displaySize: "large" })).toEqual({ displaySize: "large" });
    expect(updateThemePreferenceRequestSchema.parse({ sidebarCollapsed: true })).toEqual({ sidebarCollapsed: true });
    expect(updateThemePreferenceRequestSchema.parse({ sidebarCollapsed: false })).toEqual({ sidebarCollapsed: false });
    expect(updateThemePreferenceRequestSchema.parse({ fontFamily: "system" })).toEqual({ fontFamily: "system" });
    expect(updateThemePreferenceRequestSchema.parse({ fontFamily: "lemi-muhe-yuanti" })).toEqual({ fontFamily: "lemi-muhe-yuanti" });
    expect(updateThemePreferenceRequestSchema.parse({ fontFamily: "nanxi-xin-yuanti" })).toEqual({ fontFamily: "nanxi-xin-yuanti" });
    expect(updateThemePreferenceRequestSchema.parse({ fontFamily: "lemi-xiaonaipao" })).toEqual({ fontFamily: "lemi-xiaonaipao" });
    expect(updateThemePreferenceRequestSchema.parse({ fontFamily: "baiwuchang-keke" })).toEqual({ fontFamily: "baiwuchang-keke" });
    expect(updateThemePreferenceRequestSchema.safeParse({ fontFamily: "serif" }).success).toBe(false);
	    expect(updateThemePreferenceRequestSchema.parse({ themeId: "peach", titleColor: "warm-peach-pink" })).toEqual({
	      themeId: "peach",
	      titleColor: "warm-peach-pink"
	    });
	    expect(updateThemePreferenceRequestSchema.safeParse({ themeId: "shinchan" }).success).toBe(false);
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
      floatingCard: true,
      anniversaries: true,
      habits: true
    });

    expect(appBootstrapResponseSchema.parse({
      apiVersion: "0.2.16",
      releaseChannel: "stable",
      desktop: {
        minimumVersion: "0.1.0",
        latestVersion: "0.2.16",
        updateEndpoint: "https://github.com/Hand-xieyicheng/hand-tododesk/releases/latest/download/latest.json"
      },
      featureFlags: {
        calendar: true,
        pomodoro: false,
        taskQuadrant: true,
        floatingCard: true,
        anniversaries: true,
        habits: true
      }
    }).featureFlags.pomodoro).toBe(false);
  });

  it("rejects unsupported release channels", () => {
    expect(appBootstrapResponseSchema.safeParse({
      apiVersion: "0.2.16",
      releaseChannel: "beta",
      desktop: {
        minimumVersion: "0.1.0",
        latestVersion: "0.2.16",
        updateEndpoint: "https://github.com/Hand-xieyicheng/hand-tododesk/releases/latest/download/latest.json"
      },
      featureFlags: defaultAppFeatureFlags
    }).success).toBe(false);
  });
});

describe("memo schemas", () => {
  it("accepts rich text memo input and rejects empty updates", () => {
    expect(createMemoRequestSchema.parse({
      title: " 周会记录 ",
      contentHtml: "<h2>周会记录</h2><table><tbody><tr><td>A</td><td>B</td></tr></tbody></table>",
      isPinned: true
    })).toEqual({
      title: "周会记录",
      contentHtml: "<h2>周会记录</h2><table><tbody><tr><td>A</td><td>B</td></tr></tbody></table>",
      isPinned: true
    });
    expect(updateMemoRequestSchema.parse({ archived: true })).toEqual({ archived: true });
    expect(updateMemoRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe("anniversary schemas and display", () => {
  it("accepts planned anniversary values and rejects invalid ones", () => {
    expect(anniversaryCategoryValues).toEqual(["ANNIVERSARY", "COUNTDOWN", "BIRTHDAY", "HOLIDAY"]);
    expect(anniversaryRepeatValues).toEqual(["NONE", "WEEKLY", "MONTHLY", "YEARLY"]);
    expect(anniversaryDirectionValues).toEqual(["AUTO", "ELAPSED", "COUNTDOWN"]);
    expect(anniversaryCardStyleValues).toEqual(["lavender", "sunrise", "mint", "ocean", "rose", "classic"]);

    expect(createAnniversaryRequestSchema.parse({
      title: " 周末 ",
      category: "COUNTDOWN",
      date: "2026-06-20",
      repeat: "NONE",
      direction: "AUTO",
      cardStyle: "lavender",
      calendarType: "SOLAR"
    })).toEqual({
      title: "周末",
      category: "COUNTDOWN",
      date: "2026-06-20",
      repeat: "NONE",
      direction: "AUTO",
      cardStyle: "lavender",
      calendarType: "SOLAR"
    });
    expect(updateAnniversaryRequestSchema.parse({ cardStyle: "mint" })).toEqual({ cardStyle: "mint" });
    expect(updateAnniversaryOrderRequestSchema.parse({ orderedIds: ["a", "b"] })).toEqual({ orderedIds: ["a", "b"] });
    expect(updateAnniversaryOrderRequestSchema.safeParse({ orderedIds: [] }).success).toBe(false);
    expect(createAnniversaryRequestSchema.safeParse({
      title: "错误日期",
      category: "COUNTDOWN",
      date: "2026-02-30"
    }).success).toBe(false);
    expect(updateAnniversaryRequestSchema.safeParse({}).success).toBe(false);
  });

  it("formats countdown days and elapsed year-month-day values", () => {
    expect(calculateAnniversaryDisplay({
      category: "COUNTDOWN",
      date: "2026-06-20",
      repeat: "NONE",
      direction: "AUTO",
      calendarType: "SOLAR"
    }, "2026-06-18")).toMatchObject({
      displayDirection: "COUNTDOWN",
      displayDate: "2026-06-20",
      displayValue: "2天",
      displaySubtext: "距离 2026/6/20 还有",
      daysDelta: 2
    });

    expect(calculateAnniversaryDisplay({
      category: "ANNIVERSARY",
      date: "2019-12-09",
      repeat: "NONE",
      direction: "AUTO",
      calendarType: "SOLAR"
    }, "2026-06-18")).toMatchObject({
      displayDirection: "ELAPSED",
      displayDate: "2019-12-09",
      displayValue: "6年6月9天",
      displaySubtext: "距离 2019/12/9 已经",
      daysDelta: -2383
    });
  });

  it("resolves the next Spring Festival template date", () => {
    expect(resolveBuiltInAnniversaryTemplate("spring-festival", "2026-06-18")).toMatchObject({
      title: "春节",
      category: "HOLIDAY",
      date: "2027-02-06",
      repeat: "YEARLY",
      direction: "COUNTDOWN",
      calendarType: "LUNAR",
      lunarMonth: 1,
      lunarDay: 1
    });
  });
});

describe("habit schemas", () => {
  it("accepts planned habit values and icon/color options", () => {
    expect(habitFrequencyValues).toEqual(["DAILY", "WEEKLY", "MONTHLY"]);
    expect(habitRecommendedIconValues).toContain("BookOpen");
    expect(habitColorValues).toContain("mint");

    expect(createHabitRequestSchema.parse({
      title: " 学习日语 ",
      icon: "BookOpen",
      color: "mint",
      frequency: "DAILY",
      interval: 1,
      startDate: "2026-06-01"
    })).toEqual({
      title: "学习日语",
      icon: "BookOpen",
      color: "mint",
      frequency: "DAILY",
      interval: 1,
      weekDays: [],
      monthDays: [],
      startDate: "2026-06-01"
    });
    expect(createHabitRequestSchema.parse({
      title: "自定义图标",
      icon: "AlarmClockCheck",
      color: "blue",
      frequency: "DAILY",
      startDate: "2026-06-01"
    }).icon).toBe("AlarmClockCheck");
  });

  it("requires weekly weekdays and monthly days", () => {
    expect(createHabitRequestSchema.safeParse({
      title: "跑步",
      frequency: "WEEKLY",
      interval: 1,
      weekDays: [],
      startDate: "2026-06-01"
    }).success).toBe(false);

    expect(createHabitRequestSchema.safeParse({
      title: "复盘",
      frequency: "MONTHLY",
      interval: 1,
      monthDays: [],
      startDate: "2026-06-01"
    }).success).toBe(false);

    expect(createHabitRequestSchema.parse({
      title: "复盘",
      frequency: "MONTHLY",
      interval: 1,
      monthDays: [31],
      startDate: "2026-06-01"
    }).monthDays).toEqual([31]);
  });

  it("rejects invalid date ranges and empty updates", () => {
    expect(createHabitRequestSchema.safeParse({
      title: "错误日期",
      frequency: "DAILY",
      startDate: "2026-06-10",
      endDate: "2026-06-01"
    }).success).toBe(false);
    expect(updateHabitRequestSchema.parse({ archived: true })).toEqual({ archived: true });
    expect(updateHabitRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe("task display sorting", () => {
  it("accepts a single task tag id and tag maintenance names", () => {
    expect(createTaskRequestSchema.parse({
      title: " 写计划 ",
      tagId: "tag-1"
    })).toMatchObject({
      title: "写计划",
      tagId: "tag-1"
    });
    expect(createTaskRequestSchema.parse({
      title: "无标签任务",
      tagId: null
    }).tagId).toBeNull();
    expect(updateTaskRequestSchema.parse({ tagId: null })).toEqual({ tagId: null });
    expect(createTaskRequestSchema.parse({ title: "旧格式", tagNames: ["工作"] })).not.toHaveProperty("tagNames");
    expect(createTagRequestSchema.parse({ name: " 工作 " })).toEqual({ name: "工作" });
    expect(updateTagRequestSchema.safeParse({ name: "" }).success).toBe(false);
  });

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
