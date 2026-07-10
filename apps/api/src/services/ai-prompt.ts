import type { AiAction } from "@todo/shared";

function formatInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return [
    [values.get("year"), values.get("month"), values.get("day")].join("-"),
    [values.get("hour"), values.get("minute"), values.get("second")].join(":")
  ].join(" ");
}

const actionExamples = [
  ["TASK CREATE", {
    clientId: "task-create-1",
    objectType: "TASK",
    actionType: "CREATE",
    targetId: null,
    input: {
      title: "明天买咖啡豆",
      notes: null,
      startAt: null,
      dueAt: "2026-07-11T15:59:00.000Z",
      priority: "IMPORTANT_NOT_URGENT",
      status: "TODO",
      tagId: null,
      recurrenceRule: null
    }
  }],
  ["TASK UPDATE", {
    clientId: "task-update-1",
    objectType: "TASK",
    actionType: "UPDATE",
    targetId: "task-id",
    input: { status: "COMPLETED" }
  }],
  ["TASK DELETE", {
    clientId: "task-delete-1",
    objectType: "TASK",
    actionType: "DELETE",
    targetId: "task-id",
    input: {}
  }],
  ["ANNIVERSARY CREATE", {
    clientId: "anniversary-create-1",
    objectType: "ANNIVERSARY",
    actionType: "CREATE",
    targetId: null,
    input: {
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
    }
  }],
  ["ANNIVERSARY UPDATE", {
    clientId: "anniversary-update-1",
    objectType: "ANNIVERSARY",
    actionType: "UPDATE",
    targetId: "anniversary-id",
    input: { title: "妈妈生日" }
  }],
  ["ANNIVERSARY DELETE", {
    clientId: "anniversary-delete-1",
    objectType: "ANNIVERSARY",
    actionType: "DELETE",
    targetId: "anniversary-id",
    input: {}
  }],
  ["HABIT CREATE", {
    clientId: "habit-create-1",
    objectType: "HABIT",
    actionType: "CREATE",
    targetId: null,
    input: {
      title: "每天喝水",
      notes: null,
      icon: "GlassWater",
      color: "mint",
      frequency: "DAILY",
      interval: 1,
      weekDays: [],
      monthDays: [],
      startDate: "2026-07-10",
      endDate: null
    }
  }],
  ["HABIT UPDATE", {
    clientId: "habit-update-1",
    objectType: "HABIT",
    actionType: "UPDATE",
    targetId: "habit-id",
    input: { title: "每天喝八杯水" }
  }],
  ["HABIT DELETE", {
    clientId: "habit-delete-1",
    objectType: "HABIT",
    actionType: "DELETE",
    targetId: "habit-id",
    input: {}
  }],
  ["HABIT ARCHIVE", {
    clientId: "habit-archive-1",
    objectType: "HABIT",
    actionType: "ARCHIVE",
    targetId: "habit-id",
    input: {}
  }],
  ["HABIT RESTORE", {
    clientId: "habit-restore-1",
    objectType: "HABIT",
    actionType: "RESTORE",
    targetId: "habit-id",
    input: {}
  }],
  ["HABIT_CHECKIN CHECK_IN", {
    clientId: "habit-check-in-1",
    objectType: "HABIT_CHECKIN",
    actionType: "CHECK_IN",
    targetId: "habit-id",
    input: { date: "2026-07-10", note: "已完成" }
  }],
  ["HABIT_CHECKIN CANCEL_CHECK_IN", {
    clientId: "habit-cancel-check-in-1",
    objectType: "HABIT_CHECKIN",
    actionType: "CANCEL_CHECK_IN",
    targetId: "habit-id",
    input: { date: "2026-07-10" }
  }]
] as const satisfies ReadonlyArray<readonly [string, AiAction]>;

export const AI_STRUCTURED_OUTPUT_CONTRACT = [
  "Return exactly one JSON object matching one of these top-level shapes:",
  'ANSWER: {"type":"answer","text":"...","records":[{"objectType":"TASK|ANNIVERSARY|HABIT|HABIT_CHECKIN","id":"observed-id"}]}',
  'CLARIFICATION: {"type":"clarification","prompt":"...","candidates":[{"objectType":"TASK|ANNIVERSARY|HABIT|HABIT_CHECKIN","id":"observed-id","label":"..."}]}',
  'PROPOSAL: {"type":"proposal","summary":"...","actions":[ACTION,...]}',
  "Every ACTION must contain exactly clientId, objectType, actionType, targetId, and input.",
  "Use targetId=null only for CREATE. For every other action, targetId must be an observed record id.",
  "Use an empty input object for DELETE, ARCHIVE, and RESTORE.",
  "Never use action/taskId/data or other alias fields. Copy the canonical field names exactly.",
  "Canonical ACTION examples:",
  ...actionExamples.map(([label, action]) => `${label}: ${JSON.stringify(action)}`)
].join("\n");

export function buildAiSystemPrompt(now: Date) {
  const beijingNow = formatInTimeZone(now, "Asia/Shanghai");
  return [
    "You are the todoDesk transaction assistant.",
    "Only handle tasks, anniversaries, habits, and habit check-ins.",
    "You may call read-only tools. Never claim a write succeeded.",
    "For every create, update, delete, archive, restore, check-in, or cancel-check-in intent, return type=proposal. The server will ask the user to confirm before any write.",
    "For ambiguous targets, return type=clarification and candidates from tool results.",
    "Updates and deletes may target only records returned by tools in this request.",
    "Interpret relative dates in Asia/Shanghai and include absolute dates or times in proposal inputs.",
    `Current time: ${beijingNow} Asia/Shanghai.`,
    AI_STRUCTURED_OUTPUT_CONTRACT
  ].join("\n");
}
