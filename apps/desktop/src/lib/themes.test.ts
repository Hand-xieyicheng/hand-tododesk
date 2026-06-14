import { describe, expect, it } from "vitest";
import { applyTheme, themeRegistry } from "./themes";

describe("themes", () => {
  it("contains the planned theme ids", () => {
    expect(Object.keys(themeRegistry)).toEqual(["default", "shinchan", "labubu", "doraemon"]);
  });

  it("applies known themes and falls back to default", () => {
    expect(applyTheme("doraemon").id).toBe("doraemon");
    expect(document.documentElement.dataset.theme).toBe("doraemon");
    expect(applyTheme("unknown").id).toBe("default");
  });
});

