import { describe, expect, it, vi } from "vitest";
import { normalizeResetPasswordHashRoute } from "./routing";

describe("routing", () => {
  it("converts legacy reset-password path links to the hash route", () => {
    const replaceState = vi.fn();
    const redirected = normalizeResetPasswordHashRoute(
      { hash: "", pathname: "/reset-password", search: "?token=reset-token" },
      { replaceState }
    );

    expect(redirected).toBe(true);
    expect(replaceState).toHaveBeenCalledWith(null, "", "/#/reset-password?token=reset-token");
  });

  it("keeps existing hash routes unchanged", () => {
    const replaceState = vi.fn();
    const redirected = normalizeResetPasswordHashRoute(
      { hash: "#/reset-password?token=reset-token", pathname: "/", search: "" },
      { replaceState }
    );

    expect(redirected).toBe(false);
    expect(replaceState).not.toHaveBeenCalled();
  });
});
