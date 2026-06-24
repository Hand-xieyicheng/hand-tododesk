import { describe, expect, it } from "vitest";
import { floatingCardThemeOptions, getFloatingCardThemeStyle, normalizeFloatingCardThemeId } from "./floatingCardThemes";

describe("floating card themes", () => {
  it("contains the planned floating card themes", () => {
    expect(floatingCardThemeOptions.map((theme) => theme.id)).toEqual([
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

  it("falls back to the warm paper theme", () => {
    expect(normalizeFloatingCardThemeId("custom")).toBe("warm-paper");
    expect(getFloatingCardThemeStyle("black-snow")).toMatchObject({
      "--floating-card-background": "#111827",
      "--floating-card-text": "#ffffff"
    });
  });

  it("uses light form control icons for white text themes", () => {
    expect(getFloatingCardThemeStyle("navy")).toMatchObject({
      "--floating-card-control-color-scheme": "dark",
      "--floating-card-control-icon-filter": "brightness(0) invert(1)"
    });
    expect(getFloatingCardThemeStyle("white-ink")).toMatchObject({
      "--floating-card-control-color-scheme": "light",
      "--floating-card-control-icon-filter": "none"
    });
  });
});
