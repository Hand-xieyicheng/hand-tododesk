import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiAiMessage, ApiAiProposal, ApiAiSession } from "@todo/shared";
import { AiAssistant } from "./AiAssistant";

class PointerEventMock extends MouseEvent {
  readonly pointerId: number;

  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 0;
  }
}

Object.defineProperty(window, "PointerEvent", {
  configurable: true,
  value: PointerEventMock
});

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

vi.mock("animal-island-ui", () => ({
  Button: ({ children, danger, disabled, loading, onClick, type, ...props }: any) => (
    <button
      {...props}
      data-danger={danger ? "true" : undefined}
      data-loading={loading ? "true" : undefined}
      data-type={type}
      disabled={disabled}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  ),
  Modal: ({ children, onClose, open, title }: any) => open ? (
    <div aria-label={title} role="dialog">
      <button aria-label="关闭" type="button" onClick={onClose}>关闭</button>
      {children}
    </div>
  ) : null
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

const secondSession: ApiAiSession = {
  ...session,
  id: "session-2",
  title: "项目会话",
  lastMessageAt: "2026-07-10T05:00:00.000Z",
  updatedAt: "2026-07-10T05:00:00.000Z"
};

function mockMessageAreaScroll(container: HTMLElement, scrollHeight: number) {
  const messageArea = container.querySelector<HTMLElement>(".ai-assistant-message-area");
  if (!messageArea) {
    throw new Error("AI message area was not rendered");
  }
  Object.defineProperty(messageArea, "scrollHeight", {
    configurable: true,
    value: scrollHeight
  });
  messageArea.scrollTop = 0;
  return messageArea;
}

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
    window.localStorage.clear();
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
    const composer = screen.getByRole("textbox", { name: "给 AI 助手发送消息" });
    expect(composer).toHaveValue("我今天有哪些待办？");
    expect(composer).toHaveAttribute(
      "placeholder",
      "输入待办、纪念日或打卡记录…\nEnter 发送 · Shift+Enter 换行"
    );
    expect(composer).toHaveAttribute("rows", "3");
    expect(screen.queryByText("Enter 发送 · Shift+Enter 换行")).not.toBeInTheDocument();
    expect(apiMock.sendAiMessage).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "关闭 AI 助手弹窗" }));
    expect(screen.queryByRole("dialog", { name: "AI 助手" })).not.toBeInTheDocument();
  });

  it("drags the floating trigger, snaps right, and restores its persisted position", () => {
    const { container, unmount } = render(<AiAssistant enabled onDomainsChanged={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: "打开 AI 助手" });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
    Object.defineProperty(trigger, "setPointerCapture", { configurable: true, value: vi.fn() });
    Object.defineProperty(trigger, "releasePointerCapture", { configurable: true, value: vi.fn() });
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({
      x: 1130,
      y: 700,
      left: 1130,
      top: 700,
      right: 1178,
      bottom: 748,
      width: 48,
      height: 48,
      toJSON: () => ({})
    });

    fireEvent.pointerDown(trigger, { button: 0, clientX: 1154, clientY: 724, pointerId: 1 });
    fireEvent.pointerMove(trigger, { clientX: 324, clientY: 224, pointerId: 1 });
    expect(trigger).toHaveStyle({ left: "300px", top: "200px" });
    fireEvent.pointerUp(trigger, { clientX: 324, clientY: 224, pointerId: 1 });

    expect(trigger).toHaveStyle({ left: "1130px", top: "200px" });
    expect(window.localStorage.getItem("tododesk.ai-assistant.trigger-position.v1")).toBe(
      JSON.stringify({ x: 1130, y: 200 })
    );
    fireEvent.click(trigger);
    expect(container.querySelector(".ai-assistant-panel")).not.toBeInTheDocument();

    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "AI 助手" })).toBeInTheDocument();

    unmount();
    render(<AiAssistant enabled onDomainsChanged={vi.fn()} />);
    expect(screen.getByRole("button", { name: "打开 AI 助手" })).toHaveStyle({
      left: "1130px",
      top: "200px"
    });
  });

  it("drags the assistant panel within the viewport and persists its top-left position", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
    const { unmount } = render(<AiAssistant enabled onDomainsChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "打开 AI 助手" }));
    const panel = await screen.findByRole("dialog", { name: "AI 助手" });
    const header = panel.querySelector<HTMLElement>(".ai-assistant-header")!;
    Object.defineProperty(header, "setPointerCapture", { configurable: true, value: vi.fn() });
    Object.defineProperty(header, "releasePointerCapture", { configurable: true, value: vi.fn() });
    vi.spyOn(panel, "getBoundingClientRect").mockReturnValue({
      x: 560,
      y: 220,
      left: 560,
      top: 220,
      right: 1200,
      bottom: 740,
      width: 640,
      height: 520,
      toJSON: () => ({})
    });

    fireEvent.pointerDown(header, { button: 0, clientX: 600, clientY: 250, pointerId: 2 });
    fireEvent.pointerMove(header, { clientX: 104, clientY: 54, pointerId: 2 });
    expect(panel).toHaveStyle({ left: "64px", top: "24px" });
    fireEvent.pointerUp(header, { clientX: 104, clientY: 54, pointerId: 2 });

    expect(window.localStorage.getItem("tododesk.ai-assistant.panel-position.v1")).toBe(
      JSON.stringify({ x: 64, y: 24 })
    );

    unmount();
    render(<AiAssistant enabled onDomainsChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "打开 AI 助手" }));
    expect(await screen.findByRole("dialog", { name: "AI 助手" })).toHaveStyle({
      left: "64px",
      top: "24px"
    });
  });

  it("keeps the dragged assistant panel inside every viewport edge", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
    render(<AiAssistant enabled onDomainsChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "打开 AI 助手" }));
    const panel = await screen.findByRole("dialog", { name: "AI 助手" });
    const header = panel.querySelector<HTMLElement>(".ai-assistant-header")!;
    Object.defineProperty(header, "setPointerCapture", { configurable: true, value: vi.fn() });
    Object.defineProperty(header, "releasePointerCapture", { configurable: true, value: vi.fn() });
    vi.spyOn(panel, "getBoundingClientRect").mockReturnValue({
      x: 280,
      y: 140,
      left: 280,
      top: 140,
      right: 920,
      bottom: 660,
      width: 640,
      height: 520,
      toJSON: () => ({})
    });

    fireEvent.pointerDown(header, { button: 0, clientX: 320, clientY: 170, pointerId: 3 });
    fireEvent.pointerMove(header, { clientX: -500, clientY: -500, pointerId: 3 });
    expect(panel).toHaveStyle({ left: "0px", top: "0px" });

    fireEvent.pointerMove(header, { clientX: 2000, clientY: 1600, pointerId: 3 });
    expect(panel).toHaveStyle({ left: "560px", top: "280px" });
    fireEvent.pointerUp(header, { clientX: 2000, clientY: 1600, pointerId: 3 });
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

  it("scrolls to the newest content after switching sessions", async () => {
    apiMock.aiSessions.mockResolvedValue({ sessions: [session, secondSession] });
    apiMock.aiMessages.mockImplementation(async (sessionId: string) => ({
      messages: [textMessage(sessionId === secondSession.id ? {
        id: "message-session-2",
        sessionId: secondSession.id,
        content: "第二个会话的最新消息"
      } : {
        id: "message-session-1",
        content: "第一个会话的最新消息"
      })],
      nextCursor: null
    }));

    const { container } = render(<AiAssistant enabled onDomainsChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "打开 AI 助手" }));
    await screen.findByText("第一个会话的最新消息");
    const messageArea = mockMessageAreaScroll(container, 720);

    fireEvent.click(screen.getByRole("button", { name: "切换到会话：项目会话" }));

    await screen.findByText("第二个会话的最新消息");
    await waitFor(() => expect(messageArea.scrollTop).toBe(720));
  });

  it("scrolls to the newest content immediately after sending", async () => {
    let resolveSend: ((value: {
      userMessage: ApiAiMessage;
      assistantMessage: ApiAiMessage;
    }) => void) | undefined;
    apiMock.sendAiMessage.mockReturnValue(new Promise((resolve) => {
      resolveSend = resolve;
    }));

    const { container } = render(<AiAssistant enabled onDomainsChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "打开 AI 助手" }));
    const composer = await screen.findByRole("textbox", { name: "给 AI 助手发送消息" });
    const messageArea = mockMessageAreaScroll(container, 840);
    fireEvent.change(composer, { target: { value: "发送后滚动到底部" } });
    fireEvent.click(screen.getByRole("button", { name: "发送消息" }));

    await screen.findByText("发送后滚动到底部");
    await waitFor(() => expect(messageArea.scrollTop).toBe(840));

    await act(async () => {
      resolveSend?.({
        userMessage: textMessage({
          id: "message-user-scroll",
          role: "USER",
          content: "发送后滚动到底部"
        }),
        assistantMessage: textMessage({
          id: "message-answer-scroll",
          content: "已收到"
        })
      });
    });
  });

  it("shows the sent message immediately with thinking status directly below it", async () => {
    let resolveSend: ((value: {
      userMessage: ApiAiMessage;
      assistantMessage: ApiAiMessage;
    }) => void) | undefined;
    apiMock.sendAiMessage.mockReturnValue(new Promise((resolve) => {
      resolveSend = resolve;
    }));

    const { container } = render(<AiAssistant enabled onDomainsChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "打开 AI 助手" }));
    const composer = await screen.findByRole("textbox", { name: "给 AI 助手发送消息" });
    fireEvent.change(composer, { target: { value: "我今天喝咖啡了" } });
    fireEvent.click(screen.getByRole("button", { name: "发送消息" }));

    await waitFor(() => expect(container.querySelector<HTMLElement>(".ai-message.is-user")).not.toBeNull());
    const messageArticle = container.querySelector<HTMLElement>(".ai-message.is-user")!;
    expect(within(messageArticle).getByText("我今天喝咖啡了")).toBeInTheDocument();
    expect(within(messageArticle).getByText("思考中(0s)...")).toBeInTheDocument();
    expect(screen.queryByText("正在思考…")).not.toBeInTheDocument();
    expect(composer).toHaveValue("");
    expect(composer).toBeEnabled();
    const sendButton = screen.getByRole("button", { name: "发送消息" });
    expect(sendButton).toBeDisabled();

    fireEvent.change(composer, { target: { value: "下一条消息" } });
    fireEvent.keyDown(composer, { key: "Enter" });
    expect(apiMock.sendAiMessage).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveSend?.({
        userMessage: textMessage({
          id: "message-user",
          role: "USER",
          content: "我今天喝咖啡了"
        }),
        assistantMessage: textMessage({
          id: "message-answer",
          content: "已记录"
        })
      });
    });

    expect(await screen.findByText("已记录")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/思考中/)).not.toBeInTheDocument());
    expect(composer).toHaveValue("下一条消息");
    expect(sendButton).toBeEnabled();
    expect(screen.getAllByText("我今天喝咖啡了")).toHaveLength(1);
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
