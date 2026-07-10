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

describe("AI assistant api client", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("tododesk.accessToken", "access-token");
    vi.unstubAllGlobals();
  });

  it("sends messages to the selected session", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {
      userMessage: { id: "message-1" },
      assistantMessage: { id: "message-2" }
    }));
    vi.stubGlobal("fetch", fetchMock);

    await api.sendAiMessage("session/1", { content: " 明天买咖啡豆 " });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/ai/sessions/session%2F1/messages"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ content: "明天买咖啡豆" })
      })
    );
  });

  it("sends versioned proposal edits", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {
      proposal: { id: "proposal-1" }
    }));
    vi.stubGlobal("fetch", fetchMock);

    await api.updateAiProposal("proposal-1", {
      version: 2,
      actions: [{
        clientId: "action-1",
        objectType: "TASK",
        actionType: "UPDATE",
        targetId: "task-1",
        input: { title: "提交周报" }
      }]
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/ai/proposals/proposal-1"),
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          version: 2,
          actions: [{
            clientId: "action-1",
            objectType: "TASK",
            actionType: "UPDATE",
            targetId: "task-1",
            input: { title: "提交周报" }
          }]
        })
      })
    );
  });

  it("confirms proposals with a version and idempotency key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {
      proposal: { id: "proposal-1", status: "SUCCEEDED" },
      changedDomains: ["tasks"]
    }));
    vi.stubGlobal("fetch", fetchMock);

    await api.confirmAiProposal("proposal-1", {
      version: 2,
      idempotencyKey: "86b5957a-3d25-4d74-8b4f-cd49566baf2f"
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/ai/proposals/proposal-1/confirm"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          version: 2,
          idempotencyKey: "86b5957a-3d25-4d74-8b4f-cd49566baf2f"
        })
      })
    );
  });
});
