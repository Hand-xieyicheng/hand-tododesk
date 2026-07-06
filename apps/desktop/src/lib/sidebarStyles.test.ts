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
  const escapedSelector = selectorFragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return styles.match(new RegExp(`[^{}]*${escapedSelector}[^{}]*\\{[^}]*\\}`))?.[0] ?? "";
}

describe("sidebar styles", () => {
  it("uses dedicated active menu theme variables instead of primary color shadows", () => {
    const activeButtonRule = getRule(".nav-button.is-active");
    const activeIconRule = getRule(".nav-button.is-active .nav-button-icon");
    const collapsedActiveIconRule = getRule(".app-shell.is-sidebar-collapsed .nav-button.is-active .nav-button-icon");
    const activeLabelRule = getRule(".nav-button.is-active .nav-button-label");

    expect(activeButtonRule).toContain("color: var(--color-active-nav-text)");
    expect(activeButtonRule).not.toContain("color: var(--color-primary)");
    expect(activeIconRule).toContain("box-shadow: 0 3px 0 var(--color-active-nav-shadow)");
    expect(collapsedActiveIconRule).toContain("box-shadow: 0 3px 0 var(--color-active-nav-shadow)");
    expect(activeLabelRule).toContain("font-weight: 900");
  });

  it("removes gray mixed background gradients from the white ink sidebar while preserving its box shadow", () => {
    const whiteInkSidebarRule = getRule(':root[data-theme="white-ink"] .sidebar');
    const whiteInkCollapsedSidebarRule = getRule(':root[data-theme="white-ink"] .app-shell.is-sidebar-collapsed .sidebar');

    expect(whiteInkSidebarRule).toContain("linear-gradient(180deg, #ffffff 0%, #ffffff 100%)");
    expect(whiteInkSidebarRule).not.toContain("color-mix");
    expect(whiteInkSidebarRule).not.toContain("--color-accent");
    expect(whiteInkSidebarRule).not.toContain("--color-surface-strong");
    expect(whiteInkSidebarRule).toContain("box-shadow: inset -1px 0 0 #ffffff, 8px 0 28px rgba(17, 24, 39, 0.12)");
    expect(whiteInkCollapsedSidebarRule).toContain("box-shadow: inset -1px 0 0 #ffffff, 10px 0 24px rgba(17, 24, 39, 0.12)");
  });

  it("keeps the logo visible when the sidebar is collapsed", () => {
    const collapsedLogoRule = getRule(".app-shell.is-sidebar-collapsed .sidebar-brand-logo");

    expect(styles).not.toContain(".sidebar-collapse-button");
    expect(collapsedLogoRule).toContain("display: block");
    expect(collapsedLogoRule).toContain("opacity: 1");
    expect(collapsedLogoRule).not.toContain("display: none");
  });

  it("keeps the expanded sidebar logo inside a visually balanced padded slot", () => {
    const expandedBrandButtonRule = getRule(".app-shell:not(.is-sidebar-collapsed) .sidebar-brand-button");
    const sidebarLogoRule = getRule(".sidebar-brand-logo");
    const collapsedBrandButtonRule = getRule(".app-shell.is-sidebar-collapsed .sidebar-brand-button");

    expect(expandedBrandButtonRule).toContain("width: calc(132px * var(--app-ui-scale))");
    expect(expandedBrandButtonRule).toContain("height: calc(140px * var(--app-ui-scale))");
    expect(expandedBrandButtonRule).toContain("padding: calc(17px * var(--app-ui-scale)) calc(13px * var(--app-ui-scale))");
    expect(sidebarLogoRule).toContain("aspect-ratio: 1");
    expect(collapsedBrandButtonRule).toContain("width: calc(52px * var(--app-ui-scale))");
    expect(collapsedBrandButtonRule).toContain("height: calc(52px * var(--app-ui-scale))");
  });

  it("runs logo animations every 4 seconds while keeping only the button hover lift", () => {
    const eyeRule = getRule(".sidebar-logo-eye");
    const browRule = getRule(".sidebar-logo-brow");
    const checkRule = getRule(".sidebar-logo-check");
    const brandButtonRule = getRule(".sidebar-brand-button");
    const brandButtonHoverRule = getRule(".sidebar-brand-button:hover");

    expect(eyeRule).toContain("animation: sidebar-logo-blink 4s ease-in-out infinite");
    expect(browRule).not.toContain("animation:");
    expect(styles).not.toContain("sidebar-logo-brow-raise");
    expect(checkRule).toContain("animation: sidebar-logo-check-draw 4s ease-in-out infinite");
    expect(styles).toContain("84%,\n  100% {\n    stroke-dashoffset: 1;");
    expect(styles).toContain("animation: sidebar-logo-left-ear-wiggle 4s ease-in-out infinite");
    expect(styles).toContain("animation: sidebar-logo-right-ear-wiggle 4s ease-in-out infinite");
    expect(styles).not.toContain(".sidebar-brand-button:hover .sidebar-logo");
    expect(styles).not.toContain(".sidebar-brand-button:focus-visible .sidebar-logo");
    expect(brandButtonRule).toContain("transition: transform 160ms ease, filter 160ms ease");
    expect(brandButtonHoverRule).toContain("filter: saturate(1.04)");
    expect(brandButtonHoverRule).toContain("transform: translateY(-1px)");
  });

  it("matches the default macOS desktop collapsed sidebar width and logo placement", () => {
    const defaultMacCollapsedShellRule = getRuleContaining(':root[data-display-size="default"] .app-shell.is-macos-desktop.is-sidebar-collapsed');
    const fallbackMacCollapsedShellRule = getRuleContaining(":root:not([data-display-size]) .app-shell.is-macos-desktop.is-sidebar-collapsed");
    const macCollapsedBrandRule = getRuleContaining(".app-shell.is-macos-desktop.is-sidebar-collapsed .app-brand");

    expect(defaultMacCollapsedShellRule).toContain("--app-sidebar-collapsed-width: calc(82px * var(--app-ui-scale))");
    expect(fallbackMacCollapsedShellRule).toContain("--app-sidebar-collapsed-width: calc(82px * var(--app-ui-scale))");
    expect(macCollapsedBrandRule).toContain("justify-content: flex-end");
  });

  it("routes interactive text colors through theme variables instead of direct primary mixes", () => {
    const navHoverRule = getRule(".nav-button:hover");
    const collapsedNavIconHoverRule = getRule(".app-shell.is-sidebar-collapsed .nav-button:hover .nav-button-icon");
    const taskViewHoverRule = getRuleContaining(".task-view-toggle button:hover:not(:disabled)");
    const segmentedControlHoverRule = getRuleContaining(".segmented-control button:hover:not(:disabled)");

    expect(styles).not.toMatch(/(?:^|[;{]\s*)color:\s*color-mix\(in srgb, var\(--color-primary\)/m);
    expect(navHoverRule).toContain("color: var(--color-hover-text)");
    expect(collapsedNavIconHoverRule).toContain("color: var(--color-hover-text)");
    expect(taskViewHoverRule).toContain("color: var(--color-hover-text)");
    expect(segmentedControlHoverRule).toContain("color: var(--color-strong-emphasis-text)");
  });
});
