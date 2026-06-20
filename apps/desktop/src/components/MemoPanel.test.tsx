import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoPanel } from "./MemoPanel";

const apiMock = vi.hoisted(() => ({
  createMemo: vi.fn(),
  deleteMemo: vi.fn(),
  memo: vi.fn(),
  memos: vi.fn(),
  updateMemo: vi.fn(),
  uploadMemoAsset: vi.fn()
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
    apiMock.memos.mockResolvedValue({ memos: [memoListItem] });
    apiMock.memo.mockResolvedValue({ memo: memoDetail });
  });

  it("uses a compact search input with icon-only label and updated placeholder", () => {
    render(<MemoPanel />);

    expect(screen.getByPlaceholderText("搜索标题或正文")).toBeInTheDocument();
    expect(screen.queryByText("搜索")).not.toBeInTheDocument();
  });

  it("renders archive and create actions in the page topbar", async () => {
    const topbar = document.createElement("div");
    topbar.className = "topbar-actions";
    document.body.appendChild(topbar);

    render(<MemoPanel />);

    await waitFor(() => expect(topbar.querySelectorAll("button")).toHaveLength(2));
    const topbarButtons = Array.from(topbar.querySelectorAll("button"));
    const [archiveButton, createButton] = topbarButtons as [HTMLButtonElement, HTMLButtonElement];
    expect(topbarButtons.map((button) => button.textContent)).toEqual(["当前", "新建"]);
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
      "插入图片"
    ]));
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
});
