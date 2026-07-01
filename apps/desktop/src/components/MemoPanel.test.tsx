import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { desktopSyncBrowserEventName } from "../lib/desktopSync";
import { memoStore } from "../stores/memoStore";
import { MemoPanel } from "./MemoPanel";

const apiMock = vi.hoisted(() => ({
  createMemo: vi.fn(),
  deleteMemo: vi.fn(),
  memo: vi.fn(),
  memos: vi.fn(),
  updateMemo: vi.fn(),
  uploadMemoAsset: vi.fn()
}));

const tauriCoreMock = vi.hoisted(() => ({
  invoke: vi.fn()
}));

vi.mock("animal-island-ui", () => ({
  Button: ({ children, className, danger, disabled, icon, loading, onClick, type, ...props }: any) => (
    <button
      aria-label={props["aria-label"]}
      className={className}
      data-button-type={type}
      data-danger={danger ? "true" : undefined}
      data-loading={loading ? "true" : undefined}
      disabled={disabled}
      type="button"
      onClick={onClick}
    >
      {icon}
      {children}
    </button>
  ),
  Card: ({ children, className }: any) => <section className={className}>{children}</section>,
  Input: ({ onChange, placeholder, value }: any) => <input placeholder={placeholder} value={value} onChange={onChange} />,
  Modal: ({ children, onClose, open, title }: any) => (
    open ? (
      <div aria-label={typeof title === "string" ? title : undefined} role="dialog">
        <button aria-label="关闭" type="button" onClick={onClose}>关闭</button>
        {children}
      </div>
    ) : null
  ),
  Tooltip: ({ children, className, title }: any) => (
    <span className={className}>
      {children}
      <span role="tooltip">{title}</span>
    </span>
  )
}));

vi.mock("../api/client", () => ({
  api: apiMock
}));

vi.mock("@tauri-apps/api/core", () => tauriCoreMock);

vi.mock("./PrintShareDialog", () => ({
  PrintShareDialog: ({ open, source }: any) => open ? <div role="dialog" aria-label="便签打印">memo:{source.memoId}</div> : null
}));

const memoListItem = {
  id: "memo-1",
  title: "测试备忘录",
  excerpt: "富文本摘要",
  isPinned: false,
  archivedAt: null,
  createdAt: "2026-06-17T08:00:00.000Z",
  updatedAt: "2026-06-17T08:00:00.000Z"
};

const memoDetail = {
  ...memoListItem,
  contentHtml: "<p>正文</p>",
  assets: []
};

const secondMemoListItem = {
  id: "memo-2",
  title: "第二备忘录",
  excerpt: "第二摘要",
  isPinned: false,
  archivedAt: null,
  createdAt: "2026-06-17T08:05:00.000Z",
  updatedAt: "2026-06-17T08:05:00.000Z"
};

const secondMemoDetail = {
  ...secondMemoListItem,
  contentHtml: "<p>第二正文</p>",
  assets: []
};

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

describe("MemoPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    memoStore.reset();
    apiMock.memos.mockResolvedValue({ memos: [memoListItem] });
    apiMock.memo.mockResolvedValue({ memo: memoDetail });
    tauriCoreMock.invoke.mockResolvedValue(undefined);
  });

  it("uses a compact search input with icon-only label and updated placeholder", () => {
    render(<MemoPanel />);

    expect(screen.getByPlaceholderText("搜索标题或正文")).toBeInTheDocument();
    expect(screen.queryByText("搜索")).not.toBeInTheDocument();
  });

  it("shows only the editor no-data image when there are no memos", async () => {
    apiMock.memos.mockResolvedValue({ memos: [] });

    const { container } = render(<MemoPanel />);

    await waitFor(() => expect(apiMock.memos).toHaveBeenCalled());

    const placeholders = screen.getAllByAltText("暂无数据");
    expect(placeholders).toHaveLength(1);
    expect(container.querySelector(".memo-list-scroll .no-data-placeholder img")).not.toBeInTheDocument();
    expect(container.querySelector(".memo-empty-editor.no-data-placeholder img")).toBe(placeholders[0]);
    expect(container.querySelector(".memo-list-scroll")).toHaveClass("is-empty");
    placeholders.forEach((placeholder) => {
      expect(placeholder).toHaveClass("no-data-placeholder-image");
      expect(placeholder).toHaveStyle({ opacity: "0.5" });
    });
  });

  it("renders archive and create actions in the page topbar", async () => {
    const topbar = document.createElement("div");
    topbar.className = "topbar-actions";
    document.body.appendChild(topbar);

    render(<MemoPanel printButtonEnabled />);

    await waitFor(() => expect(topbar.querySelectorAll("button")).toHaveLength(3));
    const topbarButtons = Array.from(topbar.querySelectorAll("button"));
    const [archiveButton, , createButton] = topbarButtons as [HTMLButtonElement, HTMLButtonElement, HTMLButtonElement];
    expect(topbarButtons.map((button) => button.textContent || button.getAttribute("aria-label"))).toEqual(["当前", "便签打印", "新建"]);
    expect(createButton).toHaveAttribute("data-button-type", "default");
    expect(document.querySelector(".memo-sidebar-panel")).not.toContainElement(archiveButton);
    expect(document.querySelector(".memo-sidebar-panel")).not.toContainElement(createButton);
  });

  it("shows tooltip labels for icon-only memo actions and rich text toolbar buttons", async () => {
    render(<MemoPanel />);

    await waitFor(() => expect(apiMock.memo).toHaveBeenCalledWith("memo-1"));

    const tooltipTexts = screen.getAllByRole("tooltip").map((tooltip) => tooltip.textContent);
    expect(tooltipTexts).toEqual(expect.arrayContaining([
      "置顶",
      "归档",
      "删除",
      "一级标题",
      "二级标题",
      "三级标题",
      "四级标题",
      "五级标题",
      "六级标题",
      "加粗",
      "插入表格",
      "插入图片",
      "固定到桌面"
    ]));
  });

  it("saves the current memo before opening it as a desktop card", async () => {
    apiMock.updateMemo.mockImplementation(async (_id: string, input: any) => ({
      memo: {
        ...memoDetail,
        ...input,
        excerpt: "更新摘要",
        updatedAt: "2026-06-17T08:01:00.000Z"
      }
    }));

    render(<MemoPanel />);

    const editor = await screen.findByRole("textbox", { name: "备忘录正文" });
    await waitFor(() => expect(apiMock.memo).toHaveBeenCalledWith("memo-1"));

    const nextHtml = "<p>固定前先保存</p>";
    editor.innerHTML = nextHtml;
    fireEvent.input(editor);
    fireEvent.click(screen.getByRole("button", { name: "固定到桌面" }));

    await waitFor(() => expect(apiMock.updateMemo).toHaveBeenCalledWith("memo-1", expect.objectContaining({
      contentHtml: nextHtml
    })));
    await waitFor(() => expect(tauriCoreMock.invoke).toHaveBeenCalledWith("open_memo_floating_card", { memoId: "memo-1" }));
  });

  it("saves the selected memo before opening print dialog", async () => {
    apiMock.updateMemo.mockImplementation(async (_id: string, input: any) => ({
      memo: { ...memoDetail, ...input, excerpt: "更新摘要", updatedAt: "2026-06-17T08:01:00.000Z" }
    }));

    render(<MemoPanel printButtonEnabled />);

    const editor = await screen.findByRole("textbox", { name: "备忘录正文" });
    await waitFor(() => expect(apiMock.memo).toHaveBeenCalledWith("memo-1"));

    editor.innerHTML = "<p>打印前保存</p>";
    fireEvent.input(editor);
    fireEvent.click(screen.getByRole("button", { name: "便签打印" }));

    await waitFor(() => expect(apiMock.updateMemo).toHaveBeenCalledWith("memo-1", expect.objectContaining({
      contentHtml: "<p>打印前保存</p>"
    })));
    expect(await screen.findByRole("dialog", { name: "便签打印" })).toHaveTextContent("memo:memo-1");
  });

  it("opens an independent browser window when the native memo card command is unavailable", async () => {
    const openMock = vi.spyOn(window, "open").mockReturnValue({ focus: vi.fn() } as unknown as Window);
    tauriCoreMock.invoke.mockRejectedValueOnce(new Error("Tauri is unavailable"));

    render(<MemoPanel />);

    await waitFor(() => expect(apiMock.memo).toHaveBeenCalledWith("memo-1"));
    fireEvent.click(screen.getByRole("button", { name: "固定到桌面" }));

    await waitFor(() => expect(openMock).toHaveBeenCalledWith(
      "/?window=memo&memoId=memo-1",
      "tododesk-memo-memo-1",
      "width=380,height=520"
    ));

    openMock.mockRestore();
  });

  it("keeps memo list content in place while search refresh is pending", async () => {
    const { container } = render(<MemoPanel />);

    await waitFor(() => expect(apiMock.memo).toHaveBeenCalledWith("memo-1"));

    const refresh = createDeferred<{ memos: Array<typeof memoListItem> }>();
    apiMock.memos.mockReturnValueOnce(refresh.promise);

    fireEvent.change(screen.getByPlaceholderText("搜索标题或正文"), { target: { value: "正文" } });

    await waitFor(() => expect(apiMock.memos).toHaveBeenLastCalledWith("正文", false), { timeout: 1000 });

    expect(screen.getByText("测试备忘录")).toBeInTheDocument();
    expect(container.querySelector(".memo-sidebar-panel > .inline-muted")).not.toBeInTheDocument();
    expect(container.querySelector(".memo-list-scroll .query-loading-indicator")).not.toBeInTheDocument();
    expect(screen.queryByText("加载中...")).not.toBeInTheDocument();

    refresh.resolve({ memos: [memoListItem] });
    await waitFor(() => expect(apiMock.memos).toHaveBeenCalledTimes(2));
  });

  it("confirms before deleting the selected memo", async () => {
    apiMock.deleteMemo.mockResolvedValue(undefined);

    render(<MemoPanel />);

    await waitFor(() => expect(apiMock.memo).toHaveBeenCalledWith("memo-1"));

    fireEvent.click(screen.getByRole("button", { name: "删除" }));

    const dialog = await screen.findByRole("dialog", { name: "删除备忘录" });
    expect(dialog).toHaveTextContent("确定删除「测试备忘录」？删除后无法恢复。");
    expect(apiMock.deleteMemo).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));
    expect(screen.queryByRole("dialog", { name: "删除备忘录" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    const reopenedDialog = await screen.findByRole("dialog", { name: "删除备忘录" });
    fireEvent.click(within(reopenedDialog).getByRole("button", { name: "删除" }));

    await waitFor(() => expect(apiMock.deleteMemo).toHaveBeenCalledWith("memo-1"));
  });

  it("hydrates saved rich text before switching memos", async () => {
    apiMock.memos.mockResolvedValue({ memos: [memoListItem, secondMemoListItem] });
    apiMock.memo.mockImplementation(async (id: string) => ({
      memo: id === "memo-2" ? secondMemoDetail : memoDetail
    }));

    render(<MemoPanel />);

    const editor = await screen.findByRole("textbox", { name: "备忘录正文" });
    await waitFor(() => expect(editor.innerHTML).toBe("<p>正文</p>"));
    expect(screen.queryByText(/张图片/)).not.toBeInTheDocument();

    const secondMemoButton = screen.getByText("第二备忘录").closest("button");
    expect(secondMemoButton).not.toBeNull();
    fireEvent.click(secondMemoButton!);

    await waitFor(() => expect(apiMock.memo).toHaveBeenCalledWith("memo-2"));
    await waitFor(() => expect(editor.innerHTML).toBe("<p>第二正文</p>"));
    expect(apiMock.updateMemo).not.toHaveBeenCalled();
  });

  it("keeps the rich editor DOM unchanged after autosave returns", async () => {
    apiMock.updateMemo.mockImplementation(async (_id: string, input: any) => ({
      memo: {
        ...memoDetail,
        ...input,
        contentHtml: "<p>服务端返回的清洗后内容</p>",
        excerpt: "服务端摘要",
        updatedAt: "2026-06-17T08:01:00.000Z"
      }
    }));

    render(<MemoPanel />);

    const editor = await screen.findByRole("textbox", { name: "备忘录正文" });
    await waitFor(() => expect(apiMock.memo).toHaveBeenCalledWith("memo-1"));

    const tableHtml = "<table><tbody><tr><td>正在编辑的单元格</td></tr></tbody></table><p>本地内容</p>";
    editor.innerHTML = tableHtml;
    fireEvent.input(editor);

    await waitFor(() => expect(apiMock.updateMemo).toHaveBeenCalledWith("memo-1", expect.objectContaining({
      contentHtml: tableHtml
    })), { timeout: 3000 });

    expect(editor.innerHTML).toBe(tableHtml);
    expect(screen.queryByText("保存中")).not.toBeInTheDocument();
    expect(screen.queryByText("已保存")).not.toBeInTheDocument();
  });

  it("emits a memo upsert sync event after saving edits", async () => {
    const rawListener = vi.fn();
    window.addEventListener(desktopSyncBrowserEventName, rawListener);
    apiMock.updateMemo.mockImplementation(async (_id: string, input: any) => ({
      memo: {
        ...memoDetail,
        ...input,
        excerpt: "同步摘要",
        updatedAt: "2026-06-17T08:01:00.000Z"
      }
    }));

    render(<MemoPanel />);

    const editor = await screen.findByRole("textbox", { name: "备忘录正文" });
    await waitFor(() => expect(apiMock.memo).toHaveBeenCalledWith("memo-1"));

    editor.innerHTML = "<p>保存后同步</p>";
    fireEvent.input(editor);

    await waitFor(() => expect(rawListener).toHaveBeenCalledWith(expect.objectContaining({
      detail: expect.objectContaining({
        memo: expect.objectContaining({
          id: "memo-1",
          contentHtml: "<p>保存后同步</p>"
        }),
        type: "memo:upserted"
      })
    })), { timeout: 3000 });

    window.removeEventListener(desktopSyncBrowserEventName, rawListener);
  });

  it("applies an external memo upsert to the active editor", async () => {
    render(<MemoPanel />);

    const editor = await screen.findByRole("textbox", { name: "备忘录正文" });
    await waitFor(() => expect(editor.innerHTML).toBe("<p>正文</p>"));

    await act(async () => {
      window.dispatchEvent(new CustomEvent(desktopSyncBrowserEventName, {
        detail: {
          memo: {
            ...memoDetail,
            title: "外部更新",
            contentHtml: "<p>外部正文</p>",
            excerpt: "外部摘要",
            updatedAt: "2026-06-17T08:02:00.000Z"
          },
          sourceId: "memo-card",
          type: "memo:upserted"
        }
      }));
    });

    expect(screen.getByLabelText("备忘录标题")).toHaveValue("外部更新");
    expect(editor.innerHTML).toBe("<p>外部正文</p>");
    expect(screen.getByText("外部更新")).toBeInTheDocument();
  });

  it("applies an external memo delete to the list and active editor", async () => {
    render(<MemoPanel />);

    await waitFor(() => expect(screen.getByText("测试备忘录")).toBeInTheDocument());

    await act(async () => {
      window.dispatchEvent(new CustomEvent(desktopSyncBrowserEventName, {
        detail: {
          memoId: "memo-1",
          sourceId: "memo-card",
          type: "memo:deleted"
        }
      }));
    });

    expect(screen.queryByText("测试备忘录")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("备忘录标题")).not.toBeInTheDocument();
    expect(screen.getAllByAltText("暂无数据").length).toBeGreaterThan(0);
  });
});
