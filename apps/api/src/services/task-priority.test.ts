import { describe, expect, it } from "vitest";
import { normalizeTaskPriority } from "./task-priority.js";

describe("normalizeTaskPriority", () => {
  it("keeps quadrant priorities unchanged", () => {
    expect(normalizeTaskPriority("IMPORTANT_URGENT")).toBe("IMPORTANT_URGENT");
    expect(normalizeTaskPriority("NOT_IMPORTANT_NOT_URGENT")).toBe("NOT_IMPORTANT_NOT_URGENT");
  });

  it("maps legacy priorities to quadrants", () => {
    expect(normalizeTaskPriority("URGENT")).toBe("IMPORTANT_URGENT");
    expect(normalizeTaskPriority("HIGH")).toBe("IMPORTANT_NOT_URGENT");
    expect(normalizeTaskPriority("MEDIUM")).toBe("NOT_IMPORTANT_URGENT");
    expect(normalizeTaskPriority("LOW")).toBe("NOT_IMPORTANT_NOT_URGENT");
  });
});
