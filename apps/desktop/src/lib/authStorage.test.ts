import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteRefreshToken, getRefreshToken, getRememberedPassword, saveRefreshToken, saveRememberedPassword } from "./authStorage";

const tauri = vi.hoisted(() => {
  const state = {
    refreshToken: null as string | null,
    rememberedPasswords: new Map<string, string>()
  };

  return {
    state,
    invoke: vi.fn(async (command: string, args?: Record<string, string>) => {
      switch (command) {
        case "save_refresh_token":
          state.refreshToken = args?.token ?? null;
          return null;
        case "load_refresh_token":
          return state.refreshToken;
        case "delete_refresh_token":
          state.refreshToken = null;
          return null;
        case "save_remembered_password":
          if (args?.email && args.password) {
            state.rememberedPasswords.set(args.email, args.password);
          }
          return null;
        case "load_remembered_password":
          return args?.email ? state.rememberedPasswords.get(args.email) ?? null : null;
        case "delete_remembered_password":
          if (args?.email) {
            state.rememberedPasswords.delete(args.email);
          }
          return null;
        default:
          throw new Error(`Unexpected command: ${command}`);
      }
    })
  };
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: tauri.invoke
}));

describe("authStorage", () => {
  beforeEach(() => {
    localStorage.clear();
    tauri.state.refreshToken = null;
    tauri.state.rememberedPasswords.clear();
    tauri.invoke.mockClear();
  });

  it("keeps a local refresh token mirror when saving to keychain", async () => {
    await saveRefreshToken("refresh-token");
    expect(localStorage.getItem("tododesk.refreshToken")).toBe("refresh-token");

    tauri.state.refreshToken = null;
    await expect(getRefreshToken()).resolves.toBe("refresh-token");

    await deleteRefreshToken();
    expect(localStorage.getItem("tododesk.refreshToken")).toBeNull();
  });

  it("keeps a local remembered password mirror when saving to keychain", async () => {
    await saveRememberedPassword("Todo@Example.COM", "Password123");
    expect(localStorage.getItem("tododesk.rememberedPasswordEmail")).toBe("todo@example.com");
    expect(localStorage.getItem("tododesk.rememberedPassword.todo@example.com")).toBe("Password123");

    tauri.state.rememberedPasswords.clear();
    await expect(getRememberedPassword("todo@example.com")).resolves.toBe("Password123");
    await expect(getRememberedPassword("other@example.com")).resolves.toBeNull();
  });
});
