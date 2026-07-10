import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ApiAnniversaryEvent,
  ApiHabit,
  ApiHabitDetail,
  ApiTask
} from "@todo/shared";
import {
  AI_READ_TOOL_DEFINITIONS,
  createAiToolContext,
  executeAiReadTool
} from "./ai-tools.js";

const task = {
  id: "task-1",
  title: "交周报",
  notes: "周五前完成",
  startAt: null,
  dueAt: "2026-07-10T09:00:00.000Z",
  priority: "IMPORTANT_URGENT",
  status: "TODO",
  sortOrder: 1000,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-09T00:00:00.000Z",
  completedAt: null,
  recurrenceRule: null,
  tags: [],
  pomodoroCompletedCount: 0,
  pomodoroCompletedMinutes: 0
} satisfies ApiTask;

const anniversary = {
  id: "anniversary-1",
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
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-09T00:00:00.000Z",
  displayDirection: "COUNTDOWN",
  displayDate: "2027-03-12",
  displayValue: "245天",
  displaySubtext: "距离 2027/3/12 还有",
  daysDelta: 245
} satisfies ApiAnniversaryEvent;

const habit = {
  id: "habit-1",
  title: "喝咖啡",
  notes: null,
  icon: "Coffee",
  color: "mint",
  frequency: "DAILY",
  interval: 1,
  weekDays: [],
  monthDays: [],
  startDate: "2026-07-01",
  endDate: null,
  sortOrder: 1000,
  archivedAt: null,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-09T00:00:00.000Z",
  todayPlanned: true,
  todayChecked: true,
  stats: {
    monthCheckIns: 1,
    monthPlanned: 10,
    monthCompletionRate: 10,
    totalCheckIns: 1,
    currentStreak: 1,
    currentStreakUnit: "天"
  }
} satisfies ApiHabit;

function createContext() {
  return createAiToolContext({
    userId: "user-1",
    taskDomain: {
      listTasks: vi.fn().mockResolvedValue([task])
    },
    anniversaryDomain: {
      listAnniversaries: vi.fn().mockResolvedValue([anniversary])
    },
    habitDomain: {
      listHabits: vi.fn().mockResolvedValue([habit]),
      getHabitDetail: vi.fn().mockResolvedValue({
        habit,
        month: "2026-07",
        stats: habit.stats,
        calendarDays: [],
        logs: [{
          id: "check-1",
          date: "2026-07-10",
          note: "已完成",
          createdAt: "2026-07-10T01:00:00.000Z",
          updatedAt: "2026-07-10T01:00:00.000Z"
        }]
      } satisfies ApiHabitDetail)
    }
  });
}

describe("read-only AI tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("never exposes an authoritative user id in tool definitions", () => {
    expect(JSON.stringify(AI_READ_TOOL_DEFINITIONS)).not.toContain("userId");
  });

  it("advertises task search bounds as date or date-time strings", () => {
    const taskTool = AI_READ_TOOL_DEFINITIONS.find((tool) => tool.function.name === "search_tasks");
    const serialized = JSON.stringify(taskTool);

    expect(serialized).toContain('"format":"date"');
    expect(serialized).toContain('"format":"date-time"');
  });

  it("searches tasks through the authenticated context and observes results", async () => {
    const context = createContext();
    const result = await executeAiReadTool("search_tasks", JSON.stringify({
      query: "周报",
      statuses: ["TODO"],
      from: null,
      to: null,
      limit: 10
    }), context);

    expect(context.taskDomain.listTasks).toHaveBeenCalledWith("user-1");
    expect(result.records).toEqual([
      expect.objectContaining({
        objectType: "TASK",
        id: "task-1",
        title: "交周报",
        tagId: null
      })
    ]);
    expect(context.observed.get("TASK", "task-1")?.updatedAt).toBe(task.updatedAt);
  });

  it("treats date-only task search bounds as a full Beijing calendar day", async () => {
    const context = createContext();

    const result = await executeAiReadTool("search_tasks", JSON.stringify({
      query: "",
      statuses: ["TODO"],
      from: "2026-07-10",
      to: "2026-07-10",
      limit: 10
    }), context);

    expect(result.records).toEqual([
      expect.objectContaining({ objectType: "TASK", id: "task-1" })
    ]);
  });

  it("filters anniversaries and habits and caps returned records at 50", async () => {
    const context = createContext();
    context.habitDomain.listHabits.mockResolvedValue(
      Array.from({ length: 60 }, (_, index) => ({
        ...habit,
        id: `habit-${index}`,
        title: `咖啡 ${index}`
      }))
    );

    const anniversaryResult = await executeAiReadTool("search_anniversaries", JSON.stringify({
      query: "生日",
      categories: ["BIRTHDAY"],
      from: "2027-01-01",
      to: "2027-12-31",
      limit: 10
    }), context);
    const habitResult = await executeAiReadTool("search_habits", JSON.stringify({
      query: "咖啡",
      includeArchived: false,
      limit: 50
    }), context);

    expect(context.anniversaryDomain.listAnniversaries).toHaveBeenCalledWith("user-1");
    expect(anniversaryResult.records).toEqual([
      expect.objectContaining({
        objectType: "ANNIVERSARY",
        id: "anniversary-1",
        cardStyle: "lavender"
      })
    ]);
    expect(context.habitDomain.listHabits).toHaveBeenCalledWith("user-1", false);
    expect(habitResult.records).toHaveLength(50);
    expect(context.observed.has("HABIT", "habit-49")).toBe(true);
    expect(context.observed.has("HABIT", "habit-50")).toBe(false);
  });

  it("requires an observed habit before reading and observing check-ins", async () => {
    const context = createContext();
    const args = JSON.stringify({
      habitId: "habit-1",
      from: "2026-07-01",
      to: "2026-07-31",
      limit: 10
    });

    await expect(executeAiReadTool("get_habit_checkins", args, context)).rejects.toMatchObject({
      code: "UNOBSERVED_TARGET"
    });

    await executeAiReadTool("search_habits", JSON.stringify({
      query: "咖啡",
      includeArchived: false,
      limit: 10
    }), context);
    const result = await executeAiReadTool("get_habit_checkins", args, context);

    expect(context.habitDomain.getHabitDetail).toHaveBeenCalledWith("user-1", "habit-1", "2026-07");
    expect(result.records).toEqual([
      expect.objectContaining({
        objectType: "HABIT_CHECKIN",
        id: "habit-1:2026-07-10",
        habitId: "habit-1",
        date: "2026-07-10"
      })
    ]);
    expect(context.observed.has("HABIT_CHECKIN", "habit-1:2026-07-10")).toBe(true);
  });

  it("rejects invalid JSON arguments", async () => {
    await expect(executeAiReadTool("search_tasks", "{invalid", createContext())).rejects.toMatchObject({
      code: "INVALID_ARGUMENTS"
    });
  });

  it("rejects invalid task search calendar dates as invalid arguments", async () => {
    await expect(executeAiReadTool("search_tasks", JSON.stringify({
      query: "",
      statuses: [],
      from: "2026-13-40",
      to: null,
      limit: 10
    }), createContext())).rejects.toMatchObject({
      code: "INVALID_ARGUMENTS"
    });
  });
});
