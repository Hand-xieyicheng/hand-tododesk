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
});
