import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const styles = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../styles.css"),
  "utf8"
);

function getRule(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return styles.match(new RegExp(`${escapedSelector}\\s*\\{[^}]*\\}`))?.[0] ?? "";
}

describe("landing styles", () => {
  it("pins the landing page to the default palette instead of inherited user theme colors", () => {
    const landingPageRule = getRule(".landing-page");

    expect(landingPageRule).toContain("--color-background: #fffdf1");
    expect(landingPageRule).toContain("--color-surface: #fffdf1");
    expect(landingPageRule).toContain("--color-text: #725d42");
    expect(landingPageRule).toContain("--color-primary: #19c8b9");
    expect(landingPageRule).toContain("--color-secondary: #e59266");
    expect(landingPageRule).toContain("--color-border: #c4b89e");
    expect(landingPageRule).toContain("--color-dots: rgba(114, 93, 66, 0.08)");
    expect(landingPageRule).toContain(
      "--island-paper-dots: radial-gradient(circle, var(--color-dots) 1px, transparent 1.6px)"
    );
    expect(landingPageRule).toContain("--animal-primary-color: var(--color-primary)");
    expect(landingPageRule).toContain("--animal-text-color: var(--color-text)");
  });

  it("starts the internal dotted paper texture below the hero banner", () => {
    const landingPageRule = getRule(".landing-page");
    const heroOverlayRule = getRule(".landing-hero::before");
    const dotLayerIndex = landingPageRule.indexOf("var(--island-paper-dots)");
    const firstGradientIndex = landingPageRule.indexOf("linear-gradient");

    expect(dotLayerIndex).toBeGreaterThanOrEqual(0);
    expect(firstGradientIndex).toBeGreaterThanOrEqual(0);
    expect(dotLayerIndex).toBeLessThan(firstGradientIndex);
    expect(heroOverlayRule).not.toContain("var(--island-paper-dots)");
  });

  it("stacks the advantage heading above the horizontal card marquee", () => {
    const advantageSectionRule = getRule(".landing-advantage-section");

    expect(advantageSectionRule).toContain("grid-template-columns: 1fr");
    expect(advantageSectionRule).not.toContain("minmax(280px, 0.42fr)");
  });

  it("centers the ICP filing footer at the bottom of the landing page", () => {
    const filingFooterRule = getRule(".landing-icp-footer");
    const filingLinkRule = getRule(".landing-icp-link");

    expect(filingFooterRule).toContain("text-align: center");
    expect(filingFooterRule).toContain("margin: 0 auto");
    expect(filingLinkRule).toContain("text-decoration: none");
  });
});
