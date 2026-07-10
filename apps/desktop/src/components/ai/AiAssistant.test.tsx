import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiAiMessage, ApiAiSession } from "@todo/shared";
import { AiAssistant } from "./AiAssistant";

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
  title: "新会话",
  summary: null,
  lastMessageAt: "2026-07-10T04:00:00.000Z",
  createdAt: "2026-07-10T04:00:00.000Z",
  updatedAt: "2026-07-10T04:00:00.000Z"
};

function textMessage(patch: Partial<ApiAiMessage> = {}): ApiAiMessage {
  return {
    id: "message-1",
    sessionId: "session-1",
    role: "ASSISTANT",
    kind: "TEXT",
    content: "你好",
    metadata: null,
    createdAt: "2026-07-10T04:00:00.000Z",
    ...patch
  };
}

describe("AiAssistant", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    apiMock.aiSessions.mockResolvedValue({ sessions: [] });
    apiMock.createAiSession.mockResolvedValue({ session });
    apiMock.aiMessages.mockResolvedValue({ messages: [], nextCursor: null });
    apiMock.renameAiSession.mockResolvedValue({ session });
    apiMock.deleteAiSession.mockResolvedValue(undefined);
    apiMock.sendAiMessage.mockResolvedValue({
      userMessage: textMessage({ id: "message-user", role: "USER", content: "今天有什么待办" }),
      assistantMessage: textMessage({ id: "message-answer", content: "没有待办" })
    });
  });

  it("toggles the compact panel and fills suggestions without sending", async () => {
    render(<AiAssistant enabled onDomainsChanged={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "打开 AI 助手" }));
    await screen.findByRole("dialog", { name: "AI 助手" });
    await screen.findByRole("button", { name: "我今天有哪些待办？" });

    fireEvent.click(screen.getByRole("button", { name: "我今天有哪些待办？" }));
    expect(screen.getByRole("textbox", { name: "给 AI 助手发送消息" })).toHaveValue("我今天有哪些待办？");
    expect(apiMock.sendAiMessage).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "关闭 AI 助手" }));
    expect(screen.queryByRole("dialog", { name: "AI 助手" })).not.toBeInTheDocument();
  });

  it("sends with Enter but keeps Shift+Enter as a newline", async () => {
    render(<AiAssistant enabled onDomainsChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "打开 AI 助手" }));
    const composer = await screen.findByRole("textbox", { name: "给 AI 助手发送消息" });

    fireEvent.change(composer, { target: { value: "第一行" } });
    fireEvent.keyDown(composer, { key: "Enter", shiftKey: true });
    expect(apiMock.sendAiMessage).not.toHaveBeenCalled();

    fireEvent.keyDown(composer, { key: "Enter" });
    await waitFor(() => expect(apiMock.sendAiMessage).toHaveBeenCalledTimes(1));
  });

  it("renders query result records", async () => {
    apiMock.aiSessions.mockResolvedValue({ sessions: [session] });
    apiMock.aiMessages.mockResolvedValue({
      messages: [textMessage({
        kind: "QUERY_RESULT",
        content: "找到 1 个待办",
        metadata: {
          records: [{
            objectType: "TASK",
            id: "task-1",
            data: { title: "交周报", dueAt: "2026-07-10T09:00:00.000Z" }
          }]
        }
      })],
      nextCursor: null
    });

    render(<AiAssistant enabled onDomainsChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "打开 AI 助手" }));

    expect(await screen.findByText("交周报")).toBeInTheDocument();
    expect(screen.getByText("找到 1 个待办")).toBeInTheDocument();
  });
});
