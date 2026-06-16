import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, authSessionExpiredEvent } from "./client";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => {
    throw new Error("Tauri is unavailable in this test");
  })
}));

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

function authorizationHeader(init: RequestInit | undefined) {
  return new Headers(init?.headers).get("Authorization");
}

describe("api client auth refresh", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("refreshes an expired access token without sending the stale bearer to refresh", async () => {
    localStorage.setItem("tododesk.accessToken", "expired-access");
    localStorage.setItem("tododesk.refreshToken", "refresh-token");

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: "Invalid access token" }))
      .mockImplementationOnce(async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(authorizationHeader(init)).toBeNull();
        return jsonResponse(200, {
          accessToken: "fresh-access",
          refreshToken: "refresh-token",
          expiresIn: 3600
        });
      })
      .mockImplementationOnce(async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(authorizationHeader(init)).toBe("Bearer fresh-access");
        return jsonResponse(200, { tasks: [] });
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(api.tasks()).resolves.toEqual({ tasks: [] });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(localStorage.getItem("tododesk.accessToken")).toBe("fresh-access");
  });

  it("clears session and emits an event when refresh fails", async () => {
    localStorage.setItem("tododesk.accessToken", "expired-access");
    localStorage.setItem("tododesk.refreshToken", "refresh-token");
    localStorage.setItem("tododesk.user", JSON.stringify({ id: "user-1", email: "todo@example.com" }));
    const sessionExpired = vi.fn();
    window.addEventListener(authSessionExpiredEvent, sessionExpired);

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: "Invalid access token" }))
      .mockResolvedValueOnce(jsonResponse(401, { error: "Invalid refresh token" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(api.tasks()).rejects.toMatchObject({
      message: "Invalid access token",
      status: 401
    });
    expect(sessionExpired).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("tododesk.accessToken")).toBeNull();
    expect(localStorage.getItem("tododesk.refreshToken")).toBeNull();
    expect(localStorage.getItem("tododesk.user")).toBeNull();

    window.removeEventListener(authSessionExpiredEvent, sessionExpired);
  });
});
