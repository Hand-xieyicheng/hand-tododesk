import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiAiMessage, ApiAiProposal, ApiAiSession } from "@todo/shared";
import { AiAssistant } from "./AiAssistant";

const apiMock = vi.hoisted(() => ({
  aiSessions: vi.fn(),
  createAiSession: vi.fn(),
  renameAiSession: vi.fn(),
  deleteAiSession: vi.fn(),
  aiMessages: vi.fn(),
  sendAiMessage: vi.fn(),
  updateAiProposal: vi.fn(),
  confirmAiProposal: vi.fn(),
  retryAiProposal: vi.fn(),
  cancelAiProposal: vi.fn()
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

function taskProposal(patch: Partial<ApiAiProposal> = {}): ApiAiProposal {
  return {
    id: "proposal-1",
    sessionId: "session-1",
    messageId: "message-proposal",
    status: "PENDING_CONFIRMATION",
    version: 1,
    expiresAt: "2026-07-10T04:30:00.000Z",
    createdAt: "2026-07-10T04:00:00.000Z",
    updatedAt: "2026-07-10T04:00:00.000Z",
    items: ["买咖啡豆", "交周报"].map((title, position) => ({
      id: `action-${position + 1}`,
      position,
      objectType: "TASK" as const,
      actionType: "CREATE" as const,
      targetId: null,
      input: {
        title,
        notes: null,
        startAt: null,
        dueAt: position === 0 ? "2026-07-11T06:00:00.000Z" : "2026-07-11T09:00:00.000Z",
        priority: "IMPORTANT_NOT_URGENT",
        status: "TODO",
        tagId: null,
        recurrenceRule: null
      },
      targetSnapshot: null,
      status: "PENDING" as const,
      result: null,
      errorCode: null,
      errorMessage: null
    })),
    ...patch
  };
}

function proposalMessage(proposal = taskProposal()): ApiAiMessage {
  return textMessage({
    id: "message-proposal",
    kind: "PROPOSAL",
    content: "准备创建两个待办",
    metadata: { proposal }
  });
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
    apiMock.updateAiProposal.mockImplementation(async (_proposalId, input) => ({
      proposal: taskProposal({
        version: input.version + 1,
        items: input.actions.map((action: any, position: number) => ({
          ...taskProposal().items[position],
          objectType: action.objectType,
          actionType: action.actionType,
          targetId: action.targetId,
          input: action.input
        }))
      })
    }));
    apiMock.confirmAiProposal.mockResolvedValue({
      proposal: taskProposal({
        status: "SUCCEEDED",
        version: 3,
        items: taskProposal().items.map((item) => ({
          ...item,
          status: "SUCCEEDED",
          result: { id: `created-${item.id}` }
        }))
      }),
      changedDomains: ["tasks"]
    });
    apiMock.retryAiProposal.mockResolvedValue({
      proposal: taskProposal({ status: "SUCCEEDED", version: 4 }),
      changedDomains: ["tasks"]
    });
    apiMock.cancelAiProposal.mockResolvedValue({
      proposal: taskProposal({ status: "CANCELLED", version: 2 })
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

  it("drives a batch proposal through edit, confirmation, results, and domain refresh", async () => {
    const onDomainsChanged = vi.fn();
    apiMock.aiSessions.mockResolvedValue({ sessions: [session] });
    apiMock.sendAiMessage.mockResolvedValue({
      userMessage: textMessage({
        id: "message-user",
        role: "USER",
        content: "明天下午买咖啡豆，周五交周报"
      }),
      assistantMessage: proposalMessage()
    });

    const { container } = render(<AiAssistant enabled onDomainsChanged={onDomainsChanged} />);
    fireEvent.click(screen.getByRole("button", { name: "打开 AI 助手" }));
    const composer = await screen.findByRole("textbox", { name: "给 AI 助手发送消息" });
    fireEvent.change(composer, {
      target: { value: "明天下午买咖啡豆，周五交周报" }
    });
    fireEvent.click(screen.getByRole("button", { name: "发送消息" }));

    const titleInputs = await screen.findAllByLabelText("待办标题");
    expect(titleInputs).toHaveLength(2);
    fireEvent.change(titleInputs[1]!, { target: { value: "提交并发送周报" } });
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));
    await waitFor(() => expect(apiMock.updateAiProposal).toHaveBeenCalledWith(
      "proposal-1",
      expect.objectContaining({
        version: 1,
        actions: expect.arrayContaining([
          expect.objectContaining({ input: expect.objectContaining({ title: "提交并发送周报" }) })
        ])
      })
    ));

    const confirm = screen.getByRole("button", { name: "确认执行" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    await waitFor(() => expect(apiMock.confirmAiProposal).toHaveBeenCalledTimes(1));
    expect(apiMock.confirmAiProposal).toHaveBeenCalledWith(
      "proposal-1",
      expect.objectContaining({ version: 2, idempotencyKey: expect.any(String) })
    );
    await waitFor(() => expect(container.querySelectorAll(".ai-action-result.is-success")).toHaveLength(2));
    expect(onDomainsChanged).toHaveBeenCalledWith(["tasks"]);
  });

  it("renders partial failures and retries only through the explicit retry control", async () => {
    const onDomainsChanged = vi.fn();
    const partial = taskProposal({
      status: "PARTIAL_FAILED",
      version: 3,
      items: taskProposal().items.map((item, index) => index === 0 ? {
        ...item,
        status: "SUCCEEDED",
        result: { id: "created-task" }
      } : {
        ...item,
        status: "FAILED",
        errorCode: "ACTION_FAILED",
        errorMessage: "暂时无法创建周报"
      })
    });
    apiMock.aiSessions.mockResolvedValue({ sessions: [session] });
    apiMock.aiMessages.mockResolvedValue({
      messages: [proposalMessage(partial)],
      nextCursor: null
    });
    apiMock.retryAiProposal.mockResolvedValue({
      proposal: taskProposal({
        status: "SUCCEEDED",
        version: 5,
        items: partial.items.map((item) => ({
          ...item,
          status: "SUCCEEDED",
          errorCode: null,
          errorMessage: null
        }))
      }),
      changedDomains: ["tasks"]
    });

    render(<AiAssistant enabled onDomainsChanged={onDomainsChanged} />);
    fireEvent.click(screen.getByRole("button", { name: "打开 AI 助手" }));

    expect(await screen.findByText("暂时无法创建周报")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重试失败项" }));

    await waitFor(() => expect(apiMock.retryAiProposal).toHaveBeenCalledWith(
      "proposal-1",
      expect.objectContaining({ version: 3, idempotencyKey: expect.any(String) })
    ));
    expect(onDomainsChanged).toHaveBeenCalledWith(["tasks"]);
  });
});
