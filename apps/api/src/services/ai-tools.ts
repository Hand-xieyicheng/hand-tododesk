import { z } from "zod";
import {
  anniversaryCategoryValues,
  taskStatusValues,
  type AiObjectType,
  type ApiAnniversaryEvent,
  type ApiHabit,
  type ApiHabitDetail,
  type ApiTask
} from "@todo/shared";
import { listAnniversaries } from "./anniversary-domain.js";
import { getHabitDetail, listHabits } from "./habit-domain.js";
import { listTasks } from "./task-domain.js";

const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const taskSearchDateKeySchema = dateKeySchema.refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
});
const taskSearchBoundarySchema = z.union([
  taskSearchDateKeySchema,
  z.string().datetime({ offset: true })
]);

function normalizeTaskSearchBoundary(
  value: string | null,
  edge: "start" | "end"
) {
  if (!value) {
    return null;
  }
  if (dateKeySchema.safeParse(value).success) {
    const time = edge === "start" ? "00:00:00.000" : "23:59:59.999";
    return new Date(`${value}T${time}+08:00`).toISOString();
  }
  return new Date(value).toISOString();
}

const searchTasksArgsSchema = z.object({
  query: z.string().trim().max(160),
  statuses: z.array(z.enum(taskStatusValues)).max(taskStatusValues.length),
  from: taskSearchBoundarySchema.nullable(),
  to: taskSearchBoundarySchema.nullable(),
  limit: z.number().int().min(1).max(50)
}).strict().transform((value) => ({
  ...value,
  from: normalizeTaskSearchBoundary(value.from, "start"),
  to: normalizeTaskSearchBoundary(value.to, "end")
})).refine((value) => !value.from || !value.to || value.from <= value.to, {
  message: "from must not be after to"
});

const searchAnniversariesArgsSchema = z.object({
  query: z.string().trim().max(160),
  categories: z.array(z.enum(anniversaryCategoryValues)).max(anniversaryCategoryValues.length),
  from: dateKeySchema.nullable(),
  to: dateKeySchema.nullable(),
  limit: z.number().int().min(1).max(50)
}).strict().refine((value) => !value.from || !value.to || value.from <= value.to, {
  message: "from must not be after to"
});

const searchHabitsArgsSchema = z.object({
  query: z.string().trim().max(160),
  includeArchived: z.boolean(),
  limit: z.number().int().min(1).max(50)
}).strict();

const getHabitCheckInsArgsSchema = z.object({
  habitId: z.string().min(1),
  from: dateKeySchema,
  to: dateKeySchema,
  limit: z.number().int().min(1).max(50)
}).strict().refine((value) => value.from <= value.to, {
  message: "from must not be after to"
});

export const AI_READ_TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "search_tasks",
      description: "Search the authenticated user's todoDesk tasks.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          statuses: {
            type: "array",
            items: { type: "string", enum: taskStatusValues }
          },
          from: { anyOf: [{ type: "string", format: "date" }, { type: "string", format: "date-time" }, { type: "null" }] },
          to: { anyOf: [{ type: "string", format: "date" }, { type: "string", format: "date-time" }, { type: "null" }] },
          limit: { type: "integer", minimum: 1, maximum: 50 }
        },
        required: ["query", "statuses", "from", "to", "limit"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_anniversaries",
      description: "Search the authenticated user's anniversaries, birthdays, holidays, and countdowns.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          categories: {
            type: "array",
            items: { type: "string", enum: anniversaryCategoryValues }
          },
          from: { anyOf: [{ type: "string" }, { type: "null" }] },
          to: { anyOf: [{ type: "string" }, { type: "null" }] },
          limit: { type: "integer", minimum: 1, maximum: 50 }
        },
        required: ["query", "categories", "from", "to", "limit"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_habits",
      description: "Search the authenticated user's habits.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          includeArchived: { type: "boolean" },
          limit: { type: "integer", minimum: 1, maximum: 50 }
        },
        required: ["query", "includeArchived", "limit"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_habit_checkins",
      description: "Read check-ins for one observed habit owned by the authenticated user.",
      parameters: {
        type: "object",
        properties: {
          habitId: { type: "string" },
          from: { type: "string" },
          to: { type: "string" },
          limit: { type: "integer", minimum: 1, maximum: 50 }
        },
        required: ["habitId", "from", "to", "limit"],
        additionalProperties: false
      }
    }
  }
] as const;

export interface ObservedRecord {
  objectType: AiObjectType;
  id: string;
  updatedAt: string;
  snapshot: Record<string, unknown>;
}

export class ObservedRecordRegistry {
  private readonly records = new Map<string, ObservedRecord>();

  add(record: ObservedRecord) {
    this.records.set(this.key(record.objectType, record.id), record);
  }

  get(objectType: AiObjectType, id: string) {
    return this.records.get(this.key(objectType, id));
  }

  has(objectType: AiObjectType, id: string) {
    return this.records.has(this.key(objectType, id));
  }

  snapshotMap() {
    return new Map(this.records);
  }

  private key(objectType: AiObjectType, id: string) {
    return [objectType, id].join(":");
  }
}

export interface AiTaskReadDomain {
  listTasks(userId: string): Promise<ApiTask[]>;
}

export interface AiAnniversaryReadDomain {
  listAnniversaries(userId: string): Promise<ApiAnniversaryEvent[]>;
}

export interface AiHabitReadDomain {
  listHabits(userId: string, includeArchived?: boolean): Promise<ApiHabit[]>;
  getHabitDetail(
    userId: string,
    habitId: string,
    month?: string
  ): Promise<ApiHabitDetail | null>;
}

export interface AiToolContext<
  TTaskDomain extends AiTaskReadDomain = AiTaskReadDomain,
  TAnniversaryDomain extends AiAnniversaryReadDomain = AiAnniversaryReadDomain,
  THabitDomain extends AiHabitReadDomain = AiHabitReadDomain
> {
  userId: string;
  taskDomain: TTaskDomain;
  anniversaryDomain: TAnniversaryDomain;
  habitDomain: THabitDomain;
  observed: ObservedRecordRegistry;
}

export function createAiToolContext<
  TTaskDomain extends AiTaskReadDomain,
  TAnniversaryDomain extends AiAnniversaryReadDomain,
  THabitDomain extends AiHabitReadDomain
>(input: {
  userId: string;
  taskDomain: TTaskDomain;
  anniversaryDomain: TAnniversaryDomain;
  habitDomain: THabitDomain;
  observed?: ObservedRecordRegistry;
}): AiToolContext<TTaskDomain, TAnniversaryDomain, THabitDomain> {
  return {
    ...input,
    observed: input.observed ?? new ObservedRecordRegistry()
  };
}

export function createDefaultAiToolContext(
  userId: string,
  observed = new ObservedRecordRegistry()
): AiToolContext {
  return createAiToolContext({
    userId,
    taskDomain: { listTasks },
    anniversaryDomain: { listAnniversaries },
    habitDomain: { listHabits, getHabitDetail },
    observed
  });
}

export class AiToolError extends Error {
  constructor(
    public readonly code: "INVALID_ARGUMENTS" | "UNKNOWN_TOOL" | "UNOBSERVED_TARGET",
    message: string
  ) {
    super(message);
    this.name = "AiToolError";
  }
}

export interface AiToolRecord extends Record<string, unknown> {
  objectType: AiObjectType;
  id: string;
}

export interface AiToolResult {
  records: AiToolRecord[];
}

function parseArguments<T>(rawArguments: string, schema: z.ZodType<T>): T {
  let value: unknown;
  try {
    value = JSON.parse(rawArguments);
  } catch {
    throw new AiToolError("INVALID_ARGUMENTS", "AI tool arguments are invalid");
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new AiToolError("INVALID_ARGUMENTS", "AI tool arguments are invalid");
  }
  return parsed.data;
}

function matchesQuery(query: string, ...values: Array<string | null | undefined>) {
  const normalized = query.trim().toLocaleLowerCase("zh-CN");
  if (!normalized) {
    return true;
  }
  return values.some((value) => value?.toLocaleLowerCase("zh-CN").includes(normalized));
}

function observe(
  context: AiToolContext,
  objectType: AiObjectType,
  id: string,
  updatedAt: string,
  snapshot: AiToolRecord
) {
  context.observed.add({
    objectType,
    id,
    updatedAt,
    snapshot: { ...snapshot }
  });
}

async function searchTasks(
  rawArguments: string,
  context: AiToolContext
): Promise<AiToolResult> {
  const args = parseArguments(rawArguments, searchTasksArgsSchema);
  const tasks = await context.taskDomain.listTasks(context.userId);
  const records = tasks
    .filter((task) => matchesQuery(args.query, task.title, task.notes))
    .filter((task) => args.statuses.length === 0 || args.statuses.includes(task.status))
    .filter((task) => {
      if (!args.from && !args.to) {
        return true;
      }
      if (!task.dueAt) {
        return false;
      }
      return (!args.from || task.dueAt >= args.from) && (!args.to || task.dueAt <= args.to);
    })
    .slice(0, args.limit)
    .map((task): AiToolRecord => ({
      objectType: "TASK",
      id: task.id,
      title: task.title,
      notes: task.notes,
      startAt: task.startAt,
      dueAt: task.dueAt,
      priority: task.priority,
      status: task.status,
      tags: task.tags,
      recurrenceRule: task.recurrenceRule,
      updatedAt: task.updatedAt
    }));

  for (const record of records) {
    observe(context, "TASK", record.id, String(record.updatedAt), record);
  }
  return { records };
}

async function searchAnniversaries(
  rawArguments: string,
  context: AiToolContext
): Promise<AiToolResult> {
  const args = parseArguments(rawArguments, searchAnniversariesArgsSchema);
  const anniversaries = await context.anniversaryDomain.listAnniversaries(context.userId);
  const records = anniversaries
    .filter((event) => matchesQuery(args.query, event.title, event.notes))
    .filter((event) => args.categories.length === 0 || args.categories.includes(event.category))
    .filter((event) => (
      (!args.from || event.displayDate >= args.from) &&
      (!args.to || event.displayDate <= args.to)
    ))
    .slice(0, args.limit)
    .map((event): AiToolRecord => ({
      objectType: "ANNIVERSARY",
      id: event.id,
      title: event.title,
      notes: event.notes,
      category: event.category,
      date: event.date,
      repeat: event.repeat,
      direction: event.direction,
      calendarType: event.calendarType,
      lunarMonth: event.lunarMonth,
      lunarDay: event.lunarDay,
      solarTerm: event.solarTerm,
      displayDate: event.displayDate,
      displayValue: event.displayValue,
      updatedAt: event.updatedAt
    }));

  for (const record of records) {
    observe(context, "ANNIVERSARY", record.id, String(record.updatedAt), record);
  }
  return { records };
}

async function searchHabits(
  rawArguments: string,
  context: AiToolContext
): Promise<AiToolResult> {
  const args = parseArguments(rawArguments, searchHabitsArgsSchema);
  const habits = await context.habitDomain.listHabits(
    context.userId,
    args.includeArchived
  );
  const records = habits
    .filter((habit) => matchesQuery(args.query, habit.title, habit.notes))
    .slice(0, args.limit)
    .map((habit): AiToolRecord => ({
      objectType: "HABIT",
      id: habit.id,
      title: habit.title,
      notes: habit.notes,
      icon: habit.icon,
      color: habit.color,
      frequency: habit.frequency,
      interval: habit.interval,
      weekDays: habit.weekDays,
      monthDays: habit.monthDays,
      startDate: habit.startDate,
      endDate: habit.endDate,
      archivedAt: habit.archivedAt,
      todayPlanned: habit.todayPlanned,
      todayChecked: habit.todayChecked,
      stats: habit.stats,
      updatedAt: habit.updatedAt
    }));

  for (const record of records) {
    observe(context, "HABIT", record.id, String(record.updatedAt), record);
  }
  return { records };
}

function monthKeysBetween(from: string, to: string) {
  const [fromYear, fromMonth] = from.slice(0, 7).split("-").map(Number);
  const [toYear, toMonth] = to.slice(0, 7).split("-").map(Number);
  let cursor = (fromYear ?? 0) * 12 + (fromMonth ?? 1) - 1;
  const end = (toYear ?? 0) * 12 + (toMonth ?? 1) - 1;
  const months: string[] = [];
  while (cursor <= end && months.length <= 24) {
    const year = Math.floor(cursor / 12);
    const month = cursor % 12 + 1;
    months.push([year, String(month).padStart(2, "0")].join("-"));
    cursor += 1;
  }
  if (cursor <= end) {
    throw new AiToolError("INVALID_ARGUMENTS", "Habit check-in range is too large");
  }
  return months;
}

async function getHabitCheckIns(
  rawArguments: string,
  context: AiToolContext
): Promise<AiToolResult> {
  const args = parseArguments(rawArguments, getHabitCheckInsArgsSchema);
  if (!context.observed.has("HABIT", args.habitId)) {
    throw new AiToolError(
      "UNOBSERVED_TARGET",
      "Habit must be observed before reading check-ins"
    );
  }

  const details = await Promise.all(monthKeysBetween(args.from, args.to).map(
    (month) => context.habitDomain.getHabitDetail(context.userId, args.habitId, month)
  ));
  const logs = details
    .flatMap((detail) => detail?.logs ?? [])
    .filter((log, index, all) => all.findIndex((candidate) => candidate.id === log.id) === index)
    .filter((log) => log.date >= args.from && log.date <= args.to)
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, args.limit);
  const records = logs.map((log): AiToolRecord => ({
    objectType: "HABIT_CHECKIN",
    id: [args.habitId, log.date].join(":"),
    habitId: args.habitId,
    checkInId: log.id,
    date: log.date,
    note: log.note,
    createdAt: log.createdAt,
    updatedAt: log.updatedAt
  }));

  for (const record of records) {
    observe(
      context,
      "HABIT_CHECKIN",
      record.id,
      String(record.updatedAt),
      record
    );
  }
  return { records };
}

export async function executeAiReadTool(
  name: string,
  rawArguments: string,
  context: AiToolContext
): Promise<AiToolResult> {
  switch (name) {
    case "search_tasks":
      return searchTasks(rawArguments, context);
    case "search_anniversaries":
      return searchAnniversaries(rawArguments, context);
    case "search_habits":
      return searchHabits(rawArguments, context);
    case "get_habit_checkins":
      return getHabitCheckIns(rawArguments, context);
    default:
      throw new AiToolError("UNKNOWN_TOOL", "AI tool is not supported");
  }
}
