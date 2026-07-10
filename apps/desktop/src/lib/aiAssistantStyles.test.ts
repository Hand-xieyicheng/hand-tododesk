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

describe("AI assistant styles", () => {
  it("keeps the assistant above application modals and its own dialogs above the assistant", () => {
    const rootRule = getRule(":root");
    const assistantRule = getRule(".ai-assistant");
    const assistantDialogMaskRule = getRuleContaining(":has(.ai-session-rename-dialog)");

    expect(rootRule).toContain("--app-ai-assistant-z-index: calc(var(--app-modal-z-index) + 100)");
    expect(assistantRule).toContain("z-index: var(--app-ai-assistant-z-index)");
    expect(assistantDialogMaskRule).toContain(":has(.ai-session-delete-dialog)");
    expect(assistantDialogMaskRule).toContain("z-index: calc(var(--app-ai-assistant-z-index) + 10)");
  });
});
