import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../styles.css"), "utf8");

function getRule(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return styles.match(new RegExp(`${escapedSelector}\\s*\\{[^}]*\\}`))?.[0] ?? "";
}

describe("anniversary styles", () => {
  it("keeps wrapped card rows packed with the same gap as columns", () => {
    const gridRule = getRule(".anniversary-grid");

    expect(gridRule).toContain("gap: calc(12px * var(--app-ui-scale))");
    expect(gridRule).toContain("align-content: start");
    expect(gridRule).not.toContain("align-content: stretch");
  });
});
