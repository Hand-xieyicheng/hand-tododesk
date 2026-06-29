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
