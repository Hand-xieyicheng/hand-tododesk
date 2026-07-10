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
    "Return exactly one JSON object matching answer, clarification, or proposal.",
    "answer example: {\"type\":\"answer\",\"text\":\"...\",\"records\":[]}",
    "clarification example: {\"type\":\"clarification\",\"prompt\":\"...\",\"candidates\":[]}",
    "proposal example: {\"type\":\"proposal\",\"summary\":\"...\",\"actions\":[...]}."
  ].join("\n");
}
