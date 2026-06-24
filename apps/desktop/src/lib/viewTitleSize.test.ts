import { describe, expect, it } from "vitest";
import { getViewTitleSize } from "./viewTitleSize";

describe("getViewTitleSize", () => {
  it("uses a small page title for small and default display sizes", () => {
    expect(getViewTitleSize("small")).toBe("small");
    expect(getViewTitleSize("default")).toBe("small");
  });

  it("uses the component default page title size for the large display size", () => {
    expect(getViewTitleSize("large")).toBe("middle");
  });
});
