import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiAiMessage, ApiAiSession } from "@todo/shared";
import { useAiAssistant } from "./useAiAssistant";

const apiMock = vi.hoisted(() => ({
  aiSessions: vi.fn(),
  createAiSession: vi.fn(),
  renameAiSession: vi.fn(),
  deleteAiSession: vi.fn(),
  aiMessages: vi.fn(),
  sendAiMessage: vi.fn()
}));

vi.mock("../../api/client", () => ({ api: apiMock }));

const session: ApiAiSession = {
  id: "session-1",
  title: "工作安排",
  summary: null,
  lastMessageAt: "2026-07-10T04:00:00.000Z",
  createdAt: "2026-07-10T04:00:00.000Z",
  updatedAt: "2026-07-10T04:00:00.000Z"
};
const userMessage: ApiAiMessage = {
  id: "message-1",
  sessionId: "session-1",
  role: "USER",
  kind: "TEXT",
  content: "今天有什么待办",
  metadata: null,
  createdAt: "2026-07-10T04:00:00.000Z"
};

describe("useAiAssistant", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    apiMock.aiSessions.mockResolvedValue({ sessions: [] });
    apiMock.createAiSession.mockResolvedValue({ session });
    apiMock.aiMessages.mockResolvedValue({ messages: [], nextCursor: null });
    apiMock.renameAiSession.mockResolvedValue({ session });
    apiMock.deleteAiSession.mockResolvedValue(undefined);
    apiMock.sendAiMessage.mockResolvedValue({
      userMessage,
      assistantMessage: {
        ...userMessage,
        id: "message-2",
        role: "ASSISTANT",
        content: "没有待办"
      }
    });
  });

  it("creates the first session when none exist", async () => {
    const { result } = renderHook(() => useAiAssistant());

    await waitFor(() => expect(result.current.activeSessionId).toBe("session-1"));
    expect(apiMock.createAiSession).toHaveBeenCalledOnce();
    expect(apiMock.aiMessages).toHaveBeenCalledWith("session-1");
    expect(result.current.sessions).toEqual([session]);
  });

  it("loads existing sessions, sends messages, and updates session titles", async () => {
    apiMock.aiSessions.mockResolvedValue({ sessions: [session] });
    apiMock.aiMessages.mockResolvedValue({
      messages: [userMessage],
      nextCursor: null
    });
    const { result } = renderHook(() => useAiAssistant());
    await waitFor(() => expect(result.current.messages).toHaveLength(1));

    await act(async () => {
      await result.current.send(" 今天有什么待办 ");
    });
    expect(apiMock.sendAiMessage).toHaveBeenCalledWith("session-1", {
      content: "今天有什么待办"
    });
    expect(result.current.messages).toHaveLength(3);

    await act(async () => {
      await result.current.renameSession("session-1", "新的会话名");
    });
    expect(apiMock.renameAiSession).toHaveBeenCalledWith("session-1", {
      title: "新的会话名"
    });
  });
});
