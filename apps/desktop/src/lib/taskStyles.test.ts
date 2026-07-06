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

  it("keeps the task print button aligned with topbar action sizing", () => {
    const printButtonRule = getRuleContaining(".task-print-button,");
    const printButtonContentRule = getRule(".task-print-button > span");
    const printButtonIconRule = getRuleContaining('.task-print-button [class*="animal-btn-icon"]');

    expect(printButtonRule).toContain("height: var(--topbar-action-height)");
    expect(printButtonRule).toContain("min-height: var(--topbar-action-height)");
    expect(printButtonRule).toContain("padding: 0 calc(11px * var(--app-ui-scale))");
    expect(printButtonRule).toContain("font-size: calc(13px * var(--app-ui-scale))");
    expect(printButtonContentRule).toContain("gap: calc(6px * var(--app-ui-scale))");
    expect(printButtonIconRule).toContain("width: calc(15px * var(--app-ui-scale))");
    expect(printButtonIconRule).toContain("height: calc(15px * var(--app-ui-scale))");
  });

  it("keeps the print share dialog full width with equal columns", () => {
    const dialogRule = getRule(".print-share-dialog");
    const modalBodyRule = getRuleContaining('.print-share-modal [class*="animal-body"]');

    expect(modalBodyRule).toContain("width: 100%");
    expect(dialogRule).toContain("width: 100%");
    expect(dialogRule).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
  });

  it("allows print share select popups to escape modal and preview clipping", () => {
    const modalClipRule = getRuleContaining('.print-share-modal [class*="animal-modalClipped"]');
    const modalClipBackgroundRule = getRuleContaining('.print-share-modal [class*="animal-modalClipped"]::before');
    const configRule = getRule(".print-share-config");
    const resultRule = getRule(".print-share-result");

    expect(modalClipRule).toContain("overflow: visible");
    expect(modalClipRule).toContain("clip-path: none");
    expect(modalClipBackgroundRule).toContain('clip-path: url("#animal-modal-clip")');
    expect(configRule).toContain("position: relative");
    expect(configRule).toContain("z-index: 2");
    expect(resultRule).toContain("position: relative");
    expect(resultRule).toContain("z-index: 1");
  });

  it("keeps the print share copy action inside the generated link field", () => {
    const linkFieldRule = getRule(".print-share-link-field");
    const linkFieldInputRule = getRule(".print-share-link-field input");
    const copyButtonRule = getRuleContaining(".print-share-link-copy-button,");

    expect(linkFieldRule).toContain("position: relative");
    expect(linkFieldInputRule).toContain("padding-right:");
    expect(copyButtonRule).toContain("position: absolute");
    expect(copyButtonRule).toContain("right:");
    expect(copyButtonRule).toContain("top: 50%");
    expect(copyButtonRule).toContain("transform: translateY(-50%)");
  });

  it("slides the print share copy feedback upward above the inline icon", () => {
    const copyMessageRule = getRule(".print-share-copy-message");
    const keyframesRule = getRuleContaining("@keyframes print-share-copy-message-rise");

    expect(copyMessageRule).toContain("position: absolute");
    expect(copyMessageRule).toContain("right:");
    expect(copyMessageRule).toContain("bottom: calc(100% +");
    expect(copyMessageRule).toContain("transform:");
    expect(copyMessageRule).toContain("pointer-events: none");
    expect(copyMessageRule).toContain("animation: print-share-copy-message-rise");
    expect(keyframesRule).toContain("translateY(");
    expect(keyframesRule).toContain("opacity:");
  });

  it("lets the print share preview fill remaining height and scroll overflowing data", () => {
    const dialogRule = getRule(".print-share-dialog");
    const resultRule = getRule(".print-share-result");
    const previewRule = getRule(".print-share-preview");
    const paperRule = getRule(".print-share-preview-paper");
    const scrollRule = getRule(".print-share-preview-scroll");

    expect(dialogRule).toContain("min-height: 0");
    expect(dialogRule).toContain("height: min(");
    expect(dialogRule).toContain("100dvh");
    expect(resultRule).toContain("grid-template-rows: minmax(0, 1fr) auto");
    expect(resultRule).toContain("min-height: 0");
    expect(resultRule).toContain("overflow: hidden");
    expect(previewRule).toContain("grid-template-rows: auto minmax(0, 1fr)");
    expect(previewRule).toContain("min-height: 0");
    expect(previewRule).toContain("overflow: hidden");
    expect(paperRule).toContain("width: 100%");
    expect(paperRule).toContain("max-width: 100%");
    expect(paperRule).toContain("height: 100%");
    expect(paperRule).toContain("overflow: hidden");
    expect(scrollRule).toContain("flex: 1 1 auto");
    expect(scrollRule).toContain("min-height: 0");
    expect(scrollRule).toContain("overflow-y: auto");
    expect(styles).not.toContain(".print-share-preview-meta");
  });

  it("does not keep removed paper width ruler styles", () => {
    expect(styles).not.toContain(".print-share-paper-width-ruler");
  });

  it("does not use primary color directly as text because white ink primary is white", () => {
    expect(styles).not.toMatch(/(?:^|[;{]\s*)color:\s*var\(--color-primary\)/m);
  });

  it("uses a dedicated warm red for overdue unfinished task titles", () => {
    const rootRule = getRule(":root");
    const taskOverdueRule = getRuleContaining(".task-item.is-overdue .task-title-row h3");
    const floatingOverdueRule = getRuleContaining(".floating-task.is-overdue .floating-task-title");
    const calendarOverdueRule = getRule(".calendar-task.is-overdue");

    expect(rootRule).toContain("--task-overdue-text: #d84a4a");
    expect(taskOverdueRule).toContain("color: var(--task-overdue-text)");
    expect(floatingOverdueRule).toContain("color: var(--floating-card-task-overdue-text");
    expect(calendarOverdueRule).toContain("color: var(--task-overdue-text)");
    expect(taskOverdueRule).not.toContain("color: var(--color-primary)");
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

  it("keeps floating toolbar controls on one row at narrow card widths", () => {
    const iconButtonRule = getRule(".floating-toolbar > button:not(.floating-toolbar-primary)");
    const mediaStart = styles.indexOf("@media (max-width: 620px)");
    const nextMediaStart = styles.indexOf("@media", mediaStart + 1);
    const narrowToolbarRule = mediaStart >= 0
      ? styles.slice(mediaStart, nextMediaStart >= 0 ? nextMediaStart : undefined)
      : "";

    expect(iconButtonRule).toContain("width: calc(38px * var(--app-ui-scale))");
    expect(iconButtonRule).toContain("min-width: calc(38px * var(--app-ui-scale))");
    expect(iconButtonRule).toContain("height: calc(38px * var(--app-ui-scale))");
    expect(iconButtonRule).toContain("min-height: calc(38px * var(--app-ui-scale))");
    expect(narrowToolbarRule).toContain(".floating-toolbar");
    expect(narrowToolbarRule).toContain("grid-template-columns: minmax(0, 1fr) repeat(3, calc(34px * var(--app-ui-scale)))");
    expect(narrowToolbarRule).toContain(".floating-toolbar-primary");
    expect(narrowToolbarRule).toContain(".floating-toolbar > button:not(.floating-toolbar-primary)");
    expect(narrowToolbarRule).toContain("width: calc(34px * var(--app-ui-scale))");
    expect(narrowToolbarRule).toContain("min-width: calc(34px * var(--app-ui-scale))");
    expect(narrowToolbarRule).toContain("height: calc(34px * var(--app-ui-scale))");
    expect(narrowToolbarRule).toContain("min-height: calc(34px * var(--app-ui-scale))");
    expect(narrowToolbarRule).not.toContain("grid-column: 1 / -1");
  });

  it("keeps task date filters aligned with their neighboring status tags", () => {
    const topbarRule = getRule(".topbar-date-filter");
    const topbarTriggerRule = getRuleContaining('.topbar-date-filter [class*="animal-trigger"]');
    const floatingRule = getRule(".floating-date-filter");
    const floatingTriggerRule = getRuleContaining('.floating-date-filter [class*="animal-trigger"]');

    expect(topbarRule).toContain("height: var(--topbar-action-height)");
    expect(topbarTriggerRule).toContain("height: var(--topbar-action-height) !important");
    expect(floatingRule).toContain("height: calc(28px * var(--app-ui-scale))");
    expect(floatingTriggerRule).toContain("border-radius: 999px !important");
  });

  it("keeps floating habit shortcut tooltip text constrained inside the card window", () => {
    const tooltipRule = getRule('.floating-habit-shortcut-tooltip [role="tooltip"]');
    const contentRule = getRuleContaining('.floating-habit-shortcut-tooltip [class*="animal-content"]');

    expect(tooltipRule).toContain("max-width: min(calc(220px * var(--app-ui-scale)), calc(100vw - 24px))");
    expect(contentRule).toContain("white-space: normal");
    expect(contentRule).toContain("overflow-wrap: anywhere");
  });
});
