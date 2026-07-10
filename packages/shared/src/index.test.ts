import { describe, expect, it } from "vitest";
import {
  aiActionSchema,
  aiModelResultSchema,
  anniversaryCardStyleValues,
  anniversaryCategoryValues,
  anniversaryDirectionValues,
  anniversaryRepeatValues,
  appBootstrapResponseSchema,
  appCloseBehaviorValues,
  calculateAnniversaryDisplay,
  changeEmailRequestSchema,
  changePasswordRequestSchema,
  confirmAiProposalRequestSchema,
  createAnniversaryRequestSchema,
  createHabitRequestSchema,
	  createMemoRequestSchema,
  createPrintShareRequestSchema,
	  createTagRequestSchema,
	  createTaskRequestSchema,
	  defaultAppFeatureFlags,
	  defaultThemeId,
	  displaySizeValues,
  expandAnniversaryOccurrenceDates,
	  floatingCardThemeIdValues,
	  floatingCardViewModeValues,
	  fontFamilyValues,
  footerTypeValues,
  getCalendarDayMetadata,
  habitColorValues,
  habitFrequencyValues,
  habitRecommendedIconValues,
  isTaskOverdue,
  lunarDateToSolarKey,
  printFontSizeModeValues,
  printMarginModeValues,
  printTemplateIdValues,
	  releaseChannelValues,
	  legacyThemeIdMap,
	  normalizeThemeId,
	  sortTasksForDisplay,
  taskDateFilterOptions,
  taskMatchesDateFilter,
  solarDateToLunarParts,
	  taskCardDisplayModeValues,
  taskViewModeValues,
	  themeIdValues,
	  titleColorValues,
  resolveBuiltInAnniversaryTemplate,
	  updateAiProposalRequestSchema,
	  updateAnniversaryOrderRequestSchema,
	  updateAnniversaryRequestSchema,
	  updateHabitRequestSchema,
  updateTagOrderRequestSchema,
  updateTaskOrderRequestSchema,
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
    expect(floatingCardViewModeValues).toEqual(["list", "quadrant", "tag"]);
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
    expect(updateThemePreferenceRequestSchema.parse({ printButtonEnabled: true })).toEqual({ printButtonEnabled: true });
    expect(updateThemePreferenceRequestSchema.parse({ printButtonEnabled: false })).toEqual({ printButtonEnabled: false });
    expect(updateThemePreferenceRequestSchema.parse({ floatingCardHabitCheckInEnabled: true })).toEqual({ floatingCardHabitCheckInEnabled: true });
    expect(updateThemePreferenceRequestSchema.parse({ floatingCardHabitCheckInEnabled: false })).toEqual({ floatingCardHabitCheckInEnabled: false });
    expect(updateThemePreferenceRequestSchema.parse({ pageAnimationEnabled: true })).toEqual({ pageAnimationEnabled: true });
    expect(updateThemePreferenceRequestSchema.parse({ pageAnimationEnabled: false })).toEqual({ pageAnimationEnabled: false });
    expect(updateThemePreferenceRequestSchema.parse({ showCompletedTasks: false })).toEqual({ showCompletedTasks: false });
    expect(updateThemePreferenceRequestSchema.parse({ taskViewMode: "quadrant" })).toEqual({ taskViewMode: "quadrant" });
    expect(updateThemePreferenceRequestSchema.parse({ taskViewMode: "kanban" })).toEqual({ taskViewMode: "kanban" });
    expect(updateThemePreferenceRequestSchema.safeParse({ taskViewMode: "board" }).success).toBe(false);
    expect(updateThemePreferenceRequestSchema.parse({ taskCardDisplayMode: "full" })).toEqual({ taskCardDisplayMode: "full" });
    expect(updateThemePreferenceRequestSchema.parse({ taskCardDisplayMode: "title" })).toEqual({ taskCardDisplayMode: "title" });
    expect(updateThemePreferenceRequestSchema.safeParse({ taskCardDisplayMode: "compact" }).success).toBe(false);
    expect(updateThemePreferenceRequestSchema.parse({ floatingCardThemeId: "black-snow" })).toEqual({ floatingCardThemeId: "black-snow" });
    expect(updateThemePreferenceRequestSchema.safeParse({ floatingCardThemeId: "custom" }).success).toBe(false);
    expect(updateThemePreferenceRequestSchema.parse({ floatingCardViewMode: "quadrant" })).toEqual({ floatingCardViewMode: "quadrant" });
    expect(updateThemePreferenceRequestSchema.parse({ floatingCardViewMode: "tag" })).toEqual({ floatingCardViewMode: "tag" });
    expect(updateThemePreferenceRequestSchema.safeParse({ floatingCardViewMode: "board" }).success).toBe(false);
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

describe("print share schemas", () => {
  it("accepts supported print templates and layout options without paper width", () => {
    expect(printTemplateIdValues).toEqual(["checklist", "memo", "compact", "decorated"]);
    expect(printFontSizeModeValues).toEqual(["small", "normal", "large", "custom"]);
    expect(printMarginModeValues).toEqual(["narrow", "normal", "wide"]);

    const taskShare = createPrintShareRequestSchema.parse({
      sourceType: "tasks",
      source: {
        tagFilter: "__all__",
        showCompletedTasks: false,
        viewMode: "kanban"
      },
      config: {
        templateId: "checklist",
        fontSizeMode: "normal",
        marginMode: "normal",
        expiresInHours: 24
      }
    });

    expect(taskShare).toMatchObject({
      sourceType: "tasks",
      source: {
        tagFilter: "__all__",
        showCompletedTasks: false,
        viewMode: "kanban"
      },
      config: {
        templateId: "checklist",
        expiresInHours: 24
      }
    });
    expect(taskShare.config).not.toHaveProperty("paperWidthMode");
    expect(taskShare.config).not.toHaveProperty("paperWidthMm");

    const memoShare = createPrintShareRequestSchema.parse({
      sourceType: "memo",
      source: { memoId: "memo-1" },
      config: {
        templateId: "decorated",
        maxHeightMm: 160,
        fontSizeMode: "custom",
        customFontSizePx: 15,
        marginMode: "wide",
        expiresInHours: 168
      }
    });
    expect(memoShare.config).toMatchObject({
      customFontSizePx: 15
    });
    expect(memoShare.config).not.toHaveProperty("paperWidthMode");
    expect(memoShare.config).not.toHaveProperty("paperWidthMm");
  });

  it("rejects invalid print share requests", () => {
    expect(createPrintShareRequestSchema.safeParse({
      sourceType: "tasks",
      source: {
        tagFilter: "__all__",
        showCompletedTasks: true,
        viewMode: "board"
      },
      config: {
        templateId: "checklist",
        fontSizeMode: "normal",
        marginMode: "normal",
        expiresInHours: 24
      }
    }).success).toBe(false);

    expect(createPrintShareRequestSchema.safeParse({
      sourceType: "memo",
      source: { memoId: "memo-1" },
      config: {
        templateId: "memo",
        fontSizeMode: "custom",
        marginMode: "normal",
        expiresInHours: 999
      }
    }).success).toBe(false);
  });
});

describe("AI assistant contracts", () => {
  it("parses answers, clarifications, batch proposals, edits, and confirmations", () => {
    expect(aiModelResultSchema.parse({
      type: "answer",
      text: "你今天有一个待办",
      records: [{ objectType: "TASK", id: "task-1" }]
    })).toMatchObject({ type: "answer", records: [{ id: "task-1" }] });

    expect(aiModelResultSchema.parse({
      type: "clarification",
      prompt: "你指的是哪一个阅读习惯？",
      candidates: [
        { objectType: "HABIT", id: "habit-1", label: "阅读" },
        { objectType: "HABIT", id: "habit-2", label: "英文阅读" }
      ]
    }).candidates).toHaveLength(2);

    const proposal = aiModelResultSchema.parse({
      type: "proposal",
      summary: "创建两个待办",
      actions: [
        {
          clientId: "action-1",
          objectType: "TASK",
          actionType: "CREATE",
          targetId: null,
          input: {
            title: "买咖啡豆",
            startAt: null,
            dueAt: "2026-07-11T06:00:00.000Z",
            priority: "IMPORTANT_NOT_URGENT",
            status: "TODO",
            recurrenceRule: null,
            tagId: null
          }
        },
        {
          clientId: "action-2",
          objectType: "HABIT_CHECKIN",
          actionType: "CHECK_IN",
          targetId: "habit-1",
          input: { date: "2026-07-10", note: "今天喝咖啡了" }
        }
      ]
    });
    expect(proposal.type).toBe("proposal");
    if (proposal.type === "proposal") {
      expect(proposal.actions).toHaveLength(2);
    }

    expect(updateAiProposalRequestSchema.parse({
      version: 2,
      actions: [{
        clientId: "action-1",
        objectType: "TASK",
        actionType: "UPDATE",
        targetId: "task-1",
        input: { title: "买两包咖啡豆" }
      }]
    }).version).toBe(2);

    expect(confirmAiProposalRequestSchema.parse({
      version: 3,
      idempotencyKey: "86b5957a-3d25-4d74-8b4f-cd49566baf2f"
    })).toEqual({
      version: 3,
      idempotencyKey: "86b5957a-3d25-4d74-8b4f-cd49566baf2f"
    });
  });

  it("requires targets for updates and forbids targets for creates", () => {
    expect(aiActionSchema.safeParse({
      clientId: "bad-update",
      objectType: "TASK",
      actionType: "UPDATE",
      targetId: null,
      input: { title: "缺少目标" }
    }).success).toBe(false);

    expect(aiActionSchema.safeParse({
      clientId: "bad-create",
      objectType: "TASK",
      actionType: "CREATE",
      targetId: "task-1",
      input: { title: "不应有目标" }
    }).success).toBe(false);
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
      habits: true,
      aiAssistant: true
    });

    expect(appBootstrapResponseSchema.parse({
      apiVersion: "0.2.29",
      releaseChannel: "stable",
      desktop: {
        minimumVersion: "0.1.0",
        latestVersion: "0.2.29",
        updateEndpoint: "https://github.com/Hand-xieyicheng/hand-tododesk/releases/latest/download/latest.json"
      },
      featureFlags: {
        calendar: true,
        pomodoro: false,
        taskQuadrant: true,
        floatingCard: true,
        anniversaries: true,
        habits: true,
        aiAssistant: true
      }
    }).featureFlags.pomodoro).toBe(false);
  });

  it("rejects unsupported release channels", () => {
    expect(appBootstrapResponseSchema.safeParse({
      apiVersion: "0.2.29",
      releaseChannel: "beta",
      desktop: {
        minimumVersion: "0.1.0",
        latestVersion: "0.2.29",
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

  it("expands anniversary occurrence dates inside calendar ranges", () => {
    expect(expandAnniversaryOccurrenceDates({
      category: "BIRTHDAY",
      date: "2020-07-10",
      repeat: "YEARLY",
      direction: "AUTO",
      calendarType: "SOLAR"
    }, "2026-07-01", "2026-08-01")).toEqual(["2026-07-10"]);

    expect(expandAnniversaryOccurrenceDates({
      category: "COUNTDOWN",
      date: "2026-01-31",
      repeat: "MONTHLY",
      direction: "COUNTDOWN",
      calendarType: "SOLAR"
    }, "2026-02-01", "2026-03-01")).toEqual(["2026-02-28"]);
  });

  it("derives lunar labels and official rest-day metadata for calendar cells", () => {
    expect(getCalendarDayMetadata("2026-07-01")).toMatchObject({
      lunarLabel: "五月十七",
      displayLabel: "五月十七",
      legalHolidayName: null,
      isWeekend: false,
      isLegalRestDay: false,
      isAdjustedWorkday: false,
      isRestDay: false
    });

    expect(getCalendarDayMetadata("2026-01-01")).toMatchObject({
      displayLabel: "元旦节",
      legalHolidayName: "元旦节",
      isLegalRestDay: true,
      isAdjustedWorkday: false,
      isRestDay: true
    });

    expect(getCalendarDayMetadata("2026-09-25")).toMatchObject({
      displayLabel: "中秋节",
      legalHolidayName: "中秋节",
      isLegalRestDay: true,
      isAdjustedWorkday: false,
      isRestDay: true
    });

    expect(getCalendarDayMetadata("2026-10-01")).toMatchObject({
      displayLabel: "国庆节",
      legalHolidayName: "国庆节",
      isLegalRestDay: true,
      isAdjustedWorkday: false,
      isRestDay: true
    });
  });

  it("converts anniversary dates between solar and lunar calendars", () => {
    expect(solarDateToLunarParts("2026-07-02")).toEqual({
      year: 2026,
      month: 5,
      day: 18
    });

    expect(lunarDateToSolarKey(2026, 5, 7)).toBe("2026-06-21");
    expect(solarDateToLunarParts(lunarDateToSolarKey(2026, 5, 7))).toEqual({
      year: 2026,
      month: 5,
      day: 7
    });
  });

  it("treats adjusted weekend workdays as workdays and regular weekends as rest days", () => {
    for (const dateKey of ["2026-01-04", "2026-02-14", "2026-02-28", "2026-10-10"]) {
      expect(getCalendarDayMetadata(dateKey)).toMatchObject({
        isWeekend: true,
        isLegalRestDay: false,
        isAdjustedWorkday: true,
        isRestDay: false
      });
    }

    expect(getCalendarDayMetadata("2026-07-04")).toMatchObject({
      lunarLabel: "五月二十",
      isWeekend: true,
      isLegalRestDay: false,
      isAdjustedWorkday: false,
      isRestDay: true
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
      startAt: "2026-06-10T01:30:00.000Z",
      dueAt: "2026-06-10T10:30:00.000Z",
      tagId: "tag-1"
    })).toMatchObject({
      title: "写计划",
      startAt: "2026-06-10T01:30:00.000Z",
      dueAt: "2026-06-10T10:30:00.000Z",
      tagId: "tag-1"
    });
    expect(createTaskRequestSchema.parse({
      title: "无标签任务",
      tagId: null
    }).tagId).toBeNull();
    expect(updateTaskRequestSchema.parse({ startAt: null, tagId: null })).toEqual({ startAt: null, tagId: null });
    expect(createTaskRequestSchema.safeParse({
      title: "错误时间",
      startAt: "2026-06-11T01:30:00.000Z",
      dueAt: "2026-06-10T10:30:00.000Z"
    }).success).toBe(false);
    expect(createTaskRequestSchema.parse({ title: "旧格式", tagNames: ["工作"] })).not.toHaveProperty("tagNames");
    expect(createTagRequestSchema.parse({ name: " 工作 " })).toEqual({ name: "工作" });
    expect(updateTagRequestSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("accepts manual task order requests", () => {
    expect(updateTaskOrderRequestSchema.parse({ orderedIds: ["task-2", "task-1"] })).toEqual({
      orderedIds: ["task-2", "task-1"]
    });
    expect(updateTaskOrderRequestSchema.safeParse({ orderedIds: [] }).success).toBe(false);
    expect(updateTaskOrderRequestSchema.safeParse({ orderedIds: ["task-1", "task-1"] }).success).toBe(false);
  });

  it("accepts manual tag order requests", () => {
    expect(updateTagOrderRequestSchema.parse({ orderedIds: ["tag-2", "tag-1"] })).toEqual({
      orderedIds: ["tag-2", "tag-1"]
    });
    expect(updateTagOrderRequestSchema.safeParse({ orderedIds: [] }).success).toBe(false);
    expect(updateTagOrderRequestSchema.safeParse({ orderedIds: ["tag-1", "tag-1"] }).success).toBe(false);
  });

  it("marks only unfinished tasks with past due dates as overdue", () => {
    const now = new Date("2026-07-02T12:00:00.000Z");

    expect(isTaskOverdue({ dueAt: "2026-07-02T11:59:59.000Z", status: "TODO" }, now)).toBe(true);
    expect(isTaskOverdue({ dueAt: "2026-07-02T12:00:00.000Z", status: "TODO" }, now)).toBe(false);
    expect(isTaskOverdue({ dueAt: "2026-07-01T12:00:00.000Z", status: "COMPLETED" }, now)).toBe(false);
    expect(isTaskOverdue({ dueAt: null, status: "TODO" }, now)).toBe(false);
  });

  it("exposes the planned task date filter labels", () => {
    expect(taskDateFilterOptions.map((option) => option.label)).toEqual([
      "全部时间",
      "今日",
      "明日",
      "本周",
      "本月",
      "无时间"
    ]);
  });

  it("matches tasks by local date filter ranges", () => {
    const now = new Date("2026-07-06T10:00:00+08:00");
    const todayTask = { startAt: null, dueAt: "2026-07-06T07:00:00.000Z" };
    const tomorrowTask = { startAt: null, dueAt: "2026-07-07T07:00:00.000Z" };
    const weekTask = { startAt: null, dueAt: "2026-07-12T07:00:00.000Z" };
    const monthTask = { startAt: null, dueAt: "2026-07-31T07:00:00.000Z" };
    const nextMonthTask = { startAt: null, dueAt: "2026-08-01T07:00:00.000Z" };
    const noTimeTask = { startAt: null, dueAt: null };
    const rangeTask = {
      startAt: "2026-07-06T01:00:00.000Z",
      dueAt: "2026-07-08T10:00:00.000Z"
    };

    expect(taskMatchesDateFilter(todayTask, "all", now)).toBe(true);
    expect(taskMatchesDateFilter(noTimeTask, "all", now)).toBe(true);
    expect(taskMatchesDateFilter(todayTask, "today", now)).toBe(true);
    expect(taskMatchesDateFilter(tomorrowTask, "today", now)).toBe(false);
    expect(taskMatchesDateFilter(tomorrowTask, "tomorrow", now)).toBe(true);
    expect(taskMatchesDateFilter(rangeTask, "today", now)).toBe(true);
    expect(taskMatchesDateFilter(todayTask, "week", now)).toBe(true);
    expect(taskMatchesDateFilter(tomorrowTask, "week", now)).toBe(true);
    expect(taskMatchesDateFilter(weekTask, "week", now)).toBe(true);
    expect(taskMatchesDateFilter(nextMonthTask, "week", now)).toBe(false);
    expect(taskMatchesDateFilter(monthTask, "month", now)).toBe(true);
    expect(taskMatchesDateFilter(nextMonthTask, "month", now)).toBe(false);
    expect(taskMatchesDateFilter(noTimeTask, "none", now)).toBe(true);
    expect(taskMatchesDateFilter(todayTask, "none", now)).toBe(false);
  });

  it("keeps completed tasks below open tasks, then uses manual order and created date", () => {
    const tasks = [
      { id: "done-manual-first", status: "COMPLETED", createdAt: "2026-06-04T00:00:00.000Z", sortOrder: 1000 },
      { id: "todo-default-new", status: "TODO", createdAt: "2026-06-03T00:00:00.000Z", sortOrder: null },
      { id: "done-default-old", status: "COMPLETED", createdAt: "2026-06-01T00:00:00.000Z", sortOrder: null },
      { id: "todo-default-same-time-b", status: "TODO", createdAt: "2026-06-02T00:00:00.000Z", sortOrder: null },
      { id: "todo-default-same-time-a", status: "TODO", createdAt: "2026-06-02T00:00:00.000Z", sortOrder: null },
      { id: "todo-manual-second", status: "TODO", createdAt: "2026-06-05T00:00:00.000Z", sortOrder: 2000 }
    ] satisfies Array<Pick<ApiTask, "id" | "status" | "createdAt" | "sortOrder">>;

    expect(sortTasksForDisplay(tasks).map((task) => task.id)).toEqual([
      "todo-manual-second",
      "todo-default-same-time-a",
      "todo-default-same-time-b",
      "todo-default-new",
      "done-manual-first",
      "done-default-old"
    ]);
    expect(tasks.map((task) => task.id)).toEqual([
      "done-manual-first",
      "todo-default-new",
      "done-default-old",
      "todo-default-same-time-b",
      "todo-default-same-time-a",
      "todo-manual-second"
    ]);
  });
});
