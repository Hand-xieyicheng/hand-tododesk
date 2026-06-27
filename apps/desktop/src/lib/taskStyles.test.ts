import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../styles.css"), "utf8");

function getRule(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return styles.match(new RegExp(`${escapedSelector}\\s*\\{[^}]*\\}`))?.[0] ?? "";
}

function getRuleContaining(selectorFragment: string) {
  return styles
    .split("}")
    .map((rule) => `${rule}}`)
    .find((rule) => rule.includes(selectorFragment)) ?? "";
}

describe("task styles", () => {
  it("uses gray theme text for task title hover instead of primary text", () => {
    const taskTitleHoverRule = getRule('.task-copy[role="button"]:hover h3');

    expect(taskTitleHoverRule).toContain("color: var(--color-hover-text)");
    expect(taskTitleHoverRule).not.toContain("color: var(--color-primary)");
  });

  it("keeps the tag maintenance hover label on the theme hover text color", () => {
    const tagMaintenanceHoverRule = getRuleContaining(".task-tag-maintenance-button:hover:not(:disabled)");
    const tagMaintenanceContentHoverRule = getRuleContaining(".task-tag-maintenance-button:hover:not(:disabled) > span");

    expect(tagMaintenanceHoverRule).toContain("color: var(--color-hover-text)");
    expect(tagMaintenanceHoverRule).toContain("!important");
    expect(tagMaintenanceContentHoverRule).toContain("color: inherit");
    expect(tagMaintenanceHoverRule).not.toContain("color: var(--color-on-primary)");
    expect(tagMaintenanceHoverRule).not.toContain("#fff");
  });

  it("does not use primary color directly as text because white ink primary is white", () => {
    expect(styles).not.toMatch(/(?:^|[;{]\s*)color:\s*var\(--color-primary\)/m);
  });

  it("uses a bright card background while task cards are being dragged", () => {
    const taskDraggingRule = getRule(".task-sortable.is-dragging");
    const taskDraggingCardRule = getRule(".task-sortable.is-dragging > .task-item");
    const floatingDraggingRule = getRule(".floating-task-sortable.is-dragging");
    const floatingDraggingCardRule = getRule(".floating-task-sortable.is-dragging > .floating-task");
    const floatingDraggingTitleRule = getRuleContaining(".floating-task-sortable.is-dragging .floating-task-title");

    expect(taskDraggingRule).toContain("opacity: 0.96");
    expect(floatingDraggingRule).toContain("opacity: 0.96");
    expect(taskDraggingCardRule).toContain("var(--color-task-drag-background)");
    expect(floatingDraggingCardRule).toContain("var(--floating-card-task-drag-background");
    expect(taskDraggingCardRule).not.toContain("#fff36d");
    expect(floatingDraggingCardRule).not.toContain("#fff36d");
    expect(taskDraggingCardRule).toContain("!important");
    expect(floatingDraggingCardRule).toContain("!important");
    expect(floatingDraggingTitleRule).toContain("var(--floating-card-task-drag-text");
  });
});
