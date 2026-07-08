import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../styles.css"), "utf8");

function getRule(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return styles.match(new RegExp(`${escapedSelector}\\s*\\{[^}]*\\}`))?.[0] ?? "";
}

describe("profile styles", () => {
  it("keeps selected profile option borders visible when the theme primary is white", () => {
    const whiteInkRootRule = getRule(':root[data-theme="white-ink"]');
    const themeTileRule = getRule(".theme-tile.is-active");
    const titleColorRule = getRule(".title-color-swatch.is-active");
    const fontFamilyRule = getRule(".font-family-option.is-active");

    expect(styles).toContain("--profile-selected-option-border: color-mix(in srgb, var(--color-primary) 72%, var(--color-border))");
    expect(whiteInkRootRule).toContain("--profile-selected-option-border: color-mix(in srgb, var(--color-accent) 72%, var(--color-border))");
    expect(themeTileRule).toContain("border-color: var(--profile-selected-option-border)");
    expect(titleColorRule).toContain("border-color: var(--profile-selected-option-border)");
    expect(fontFamilyRule).toContain("border-color: var(--profile-selected-option-border)");
  });

  it("assigns dedicated colors to anniversary and habit display module cards", () => {
    const anniversaryRule = getRule('.module-option[data-sidebar-module="anniversaries"]');
    const habitRule = getRule('.module-option[data-sidebar-module="habits"]');

    expect(anniversaryRule).toContain("--module-color: #a78bfa");
    expect(habitRule).toContain("--module-color: #5fcf94");
  });

  it("keeps avatar upload controls constrained within the overview card", () => {
    const editorRule = getRule(".avatar-editor");
    const cropStageRule = getRule(".avatar-crop-stage");
    const zoomRule = getRule(".avatar-zoom");
    const zoomInputRule = getRule('.avatar-zoom input[type="range"]');

    expect(editorRule).toContain("min-width: 0");
    expect(editorRule).toContain("max-width: 100%");
    expect(cropStageRule).toContain("box-sizing: border-box");
    expect(cropStageRule).toContain("max-width: 100%");
    expect(zoomRule).toContain("display: grid");
    expect(zoomRule).toContain("min-width: 0");
    expect(zoomRule).toContain("max-width: 100%");
    expect(zoomInputRule).toContain("min-width: 0");
    expect(zoomInputRule).toContain("max-width: 100%");
  });
});
