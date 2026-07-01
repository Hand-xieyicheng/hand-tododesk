import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../styles.css"), "utf8");

function getRule(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return styles.match(new RegExp(`${escapedSelector}\\s*\\{[^}]*\\}`))?.[0] ?? "";
}

describe("calendar styles", () => {
  it("lets anniversary tags fill the weekday header space before the date", () => {
    const headerRule = getRule(".calendar-cell header");
    const weekdayLineRule = getRule(".calendar-weekday-line");
    const stripRule = getRule(".calendar-anniversary-strip");
    const tooltipRule = getRule(".calendar-anniversary-tooltip");
    const tagRule = getRule(".calendar-anniversary-tag");
    const dateLineRule = getRule(".calendar-date-line");

    expect(headerRule).toContain("grid-template-columns: minmax(0, 1fr) auto");
    expect(headerRule).toContain("min-height: calc(38px * var(--app-ui-scale))");
    expect(weekdayLineRule).toContain("min-width: 0");
    expect(weekdayLineRule).toContain("height: calc(24px * var(--app-ui-scale))");
    expect(stripRule).toContain("flex: 1");
    expect(stripRule).toContain("min-width: 0");
    expect(stripRule).toContain("height: calc(24px * var(--app-ui-scale))");
    expect(stripRule).toContain("align-self: center");
    expect(stripRule).toContain("padding: 0 1px");
    expect(stripRule).not.toContain("max-width");
    expect(tooltipRule).toContain("display: flex");
    expect(tooltipRule).toContain("height: calc(24px * var(--app-ui-scale))");
    expect(tagRule).toContain("display: inline-flex");
    expect(tagRule).toContain("align-items: center");
    expect(tagRule).toContain("height: calc(20px * var(--app-ui-scale))");
    expect(tagRule).toContain("padding: 0 calc(7px * var(--app-ui-scale))");
    expect(dateLineRule).toContain("justify-content: flex-end");
    expect(dateLineRule).toContain("min-height: calc(38px * var(--app-ui-scale))");
  });

  it("styles lunar labels, rest days, and adjusted workday badges without resizing cells", () => {
    const dateStackRule = getRule(".calendar-date-stack");
    const lunarLabelRule = getRule(".calendar-lunar-label");
    const festivalLabelRule = getRule(".calendar-lunar-label.is-festival-label");
    const restDayRule = getRule(".calendar-cell.is-rest-day");
    const adjustedWorkdayRule = getRule(".calendar-cell.is-adjusted-workday");
    const workdayBadgeRule = getRule(".calendar-workday-badge");

    expect(dateStackRule).toContain("display: grid");
    expect(dateStackRule).toContain("justify-items: end");
    expect(lunarLabelRule).toContain("max-width");
    expect(lunarLabelRule).toContain("white-space: nowrap");
    expect(festivalLabelRule).toContain("color: var(--color-strong-emphasis-text)");
    expect(restDayRule).toContain("background:");
    expect(restDayRule).toContain("--calendar-rest-day-bg");
    expect(adjustedWorkdayRule).toContain("--calendar-adjusted-workday-accent");
    expect(workdayBadgeRule).toContain("border-radius: 999px");
    expect(workdayBadgeRule).toContain("font-size: calc(10px * var(--app-ui-scale))");
  });
});
