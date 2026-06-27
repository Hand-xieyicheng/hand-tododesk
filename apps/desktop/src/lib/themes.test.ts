import { describe, expect, it } from "vitest";
import { applyTheme, themeRegistry } from "./themes";

describe("themes", () => {
  it("contains the planned theme ids", () => {
    expect(Object.keys(themeRegistry)).toEqual([
      "warm-paper",
      "white-ink",
      "black-snow",
      "cream",
      "blush",
      "peach",
      "lemon",
      "mint",
      "sage",
      "sky",
      "aqua",
      "lavender",
      "coral",
      "teal",
      "navy"
    ]);
  });

  it("applies known themes and normalizes legacy theme ids", () => {
    expect(applyTheme("black-snow").id).toBe("black-snow");
    expect(document.documentElement.dataset.theme).toBe("black-snow");
    expect(document.documentElement.style.getPropertyValue("--color-background")).toBe("#111827");
    expect(document.documentElement.style.getPropertyValue("--color-surface-strong")).toBe("#374151");
    expect(document.documentElement.style.getPropertyValue("--color-secondary")).toBe("#c4b5fd");
    expect(document.documentElement.style.getPropertyValue("--color-on-primary")).toBe("#111827");
    expect(applyTheme("doraemon").id).toBe("sky");
    expect(applyTheme("unknown").id).toBe("warm-paper");
  });

  it("keeps the white ink theme preview colors in a white grayscale range", () => {
    expect(themeRegistry["white-ink"].palette).toMatchObject({
      primary: "#ffffff",
      secondary: "#f8fafc",
      accent: "#111827",
      warning: "#e5e7eb",
      onPrimary: "#111827",
      shadow: "#ffffff",
      softShadow: "#ffffff",
      activeNavText: "#6b7280",
      activeNavShadow: "#ffffff",
      hoverText: "#6b7280",
      emphasisText: "#6b7280",
      strongEmphasisText: "#6b7280"
    });
    applyTheme("white-ink");
    expect(document.documentElement.style.getPropertyValue("--color-primary")).toBe("#ffffff");
    expect(document.documentElement.style.getPropertyValue("--color-secondary")).toBe("#f8fafc");
    expect(document.documentElement.style.getPropertyValue("--color-accent")).toBe("#111827");
    expect(document.documentElement.style.getPropertyValue("--color-warning")).toBe("#e5e7eb");
    expect(document.documentElement.style.getPropertyValue("--color-on-primary")).toBe("#111827");
    expect(document.documentElement.style.getPropertyValue("--color-shadow")).toBe("#ffffff");
    expect(document.documentElement.style.getPropertyValue("--color-soft-shadow")).toBe("#ffffff");
    expect(document.documentElement.style.getPropertyValue("--color-active-nav-text")).toBe("#6b7280");
    expect(document.documentElement.style.getPropertyValue("--color-active-nav-shadow")).toBe("#ffffff");
    expect(document.documentElement.style.getPropertyValue("--color-hover-text")).toBe("#6b7280");
    expect(document.documentElement.style.getPropertyValue("--color-emphasis-text")).toBe("#6b7280");
    expect(document.documentElement.style.getPropertyValue("--color-strong-emphasis-text")).toBe("#6b7280");
  });

  it("exports a theme-specific drag background for every task theme", () => {
    const dragBackgrounds = new Set(Object.values(themeRegistry).map((theme) => theme.palette.taskDragBackground));

    expect(dragBackgrounds.size).toBe(Object.keys(themeRegistry).length);
    expect(themeRegistry["warm-paper"].palette.taskDragBackground).toBe("#b9fff4");
    expect(themeRegistry["black-snow"].palette.taskDragBackground).toBe("#2f6ea8");
    expect(themeRegistry["lemon"].palette.taskDragBackground).toBe("#fff36d");
    expect(themeRegistry["navy"].palette.taskDragBackground).toBe("#bfdbfe");
    expect(Object.values(themeRegistry).every((theme) => theme.palette.taskDragText && theme.palette.taskDragShadow)).toBe(true);

    applyTheme("teal");
    expect(document.documentElement.style.getPropertyValue("--color-task-drag-background")).toBe("#99f6e4");
    expect(document.documentElement.style.getPropertyValue("--color-task-drag-text")).toBe("#053b36");
    expect(document.documentElement.style.getPropertyValue("--color-task-drag-shadow")).toBe("rgba(153, 246, 228, 0.34)");
  });
});
