import { taskPriorityValues, type TaskPriority } from "@todo/shared";

type LegacyTaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

const legacyPriorityMap: Record<LegacyTaskPriority, TaskPriority> = {
  URGENT: "IMPORTANT_URGENT",
  HIGH: "IMPORTANT_NOT_URGENT",
  MEDIUM: "NOT_IMPORTANT_URGENT",
  LOW: "NOT_IMPORTANT_NOT_URGENT"
};

export function normalizeTaskPriority(value: unknown): TaskPriority {
  if (typeof value === "string" && (taskPriorityValues as readonly string[]).includes(value)) {
    return value as TaskPriority;
  }

  if (typeof value === "string" && value in legacyPriorityMap) {
    return legacyPriorityMap[value as LegacyTaskPriority];
  }

  return "IMPORTANT_NOT_URGENT";
}
