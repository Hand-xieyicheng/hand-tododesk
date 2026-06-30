import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultVisibleSidebarModules, type ApiMemo, type ApiThemePreference } from "@todo/shared";
import { desktopSyncBrowserEventName } from "../lib/desktopSync";
import { memoStore } from "../stores/memoStore";
import { MemoFloatingCard } from "./MemoFloatingCard";

const apiMock = vi.hoisted(() => ({
  getThemePreference: vi.fn(),
  memo: vi.fn(),
  updateMemo: vi.fn()
}));

const tauriCoreMock = vi.hoisted(() => ({
  invoke: vi.fn()
}));

const windowMock = vi.hoisted(() => ({
  close: vi.fn(),
  isAlwaysOnTop: vi.fn(),
  setAlwaysOnTop: vi.fn(),
  startDragging: vi.fn()
}));

vi.mock("../api/client", () => ({
  api: apiMock
}));

vi.mock("@tauri-apps/api/core", () => tauriCoreMock);

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => windowMock
}));

vi.mock("animal-island-ui", () => ({
  Button: ({ children, className, disabled, htmlType, icon, loading, onClick, title, ...props }: any) => (
    <button aria-label={props["aria-label"]} className={className} disabled={disabled || loading} type={htmlType ?? "button"} title={title} onClick={onClick}>
      {icon}
      {children}
    </button>
  ),
  Card: ({ children, className }: any) => <section className={className}>{children}</section>
}));

const memoDetail: ApiMemo = {
  id: "memo-1",
  title: "测试备忘录",
  excerpt: "富文本摘要",
  isPinned: false,
  archivedAt: null,
  createdAt: "2026-06-17T08:00:00.000Z",
  updatedAt: "2026-06-17T08:00:00.000Z",
  contentHtml: "<p>正文</p>",
  assets: []
};

const themePreference: ApiThemePreference = {
  themeId: "warm-paper",
  titleColor: "app-teal",
  footerVisible: true,
  footerType: "sea",
  printButtonEnabled: false,
  floatingCardHabitCheckInEnabled: true,
  showCompletedTasks: true,
  taskViewMode: "list",
  taskCardDisplayMode: "title",
  floatingCardThemeId: "black-snow",
  floatingCardViewMode: "list",
  appCloseBehavior: "hide",
  displaySize: "default",
  visibleSidebarModules: defaultVisibleSidebarModules,
  sidebarCollapsed: false,
  fontFamily: "system"
};

describe("MemoFloatingCard", () => {
  let alwaysOnTop = false;

  beforeEach(() => {
    vi.clearAllMocks();
    memoStore.reset();
    localStorage.clear();
    alwaysOnTop = false;
    apiMock.memo.mockResolvedValue({ memo: memoDetail });
    apiMock.getThemePreference.mockResolvedValue(themePreference);
    apiMock.updateMemo.mockImplementation(async (_id: string, input: any) => ({
      memo: {
        ...memoDetail,
        ...input,
        contentHtml: "<p>服务端返回的清洗后内容</p>",
        excerpt: "服务端摘要",
        updatedAt: "2026-06-17T08:01:00.000Z"
      }
    }));
    tauriCoreMock.invoke.mockResolvedValue(undefined);
    windowMock.isAlwaysOnTop.mockImplementation(async () => alwaysOnTop);
    windowMock.setAlwaysOnTop.mockImplementation(async (value: boolean) => {
      alwaysOnTop = value;
    });
  });

  it("loads a memo and applies synced floating card theme variables", async () => {
    const { container } = render(<MemoFloatingCard memoId="memo-1" />);

    await waitFor(() => expect(apiMock.memo).toHaveBeenCalledWith("memo-1"));

    expect(screen.getByLabelText("备忘录标题")).toHaveValue("测试备忘录");
    expect(screen.getByRole("textbox", { name: "备忘录正文" }).innerHTML).toBe("<p>正文</p>");
    const card = container.querySelector(".memo-floating-card");
    expect(card).toHaveStyle("--floating-card-background: #111827");
    expect(card).toHaveStyle("--floating-card-text: #ffffff");
  });

  it("autosaves lightweight edits without replacing the local editor DOM", async () => {
    render(<MemoFloatingCard memoId="memo-1" />);

    const editor = await screen.findByRole("textbox", { name: "备忘录正文" });
    await waitFor(() => expect(editor.innerHTML).toBe("<p>正文</p>"));

    const nextHtml = "<table><tbody><tr><td>本地编辑</td></tr></tbody></table><p>继续写</p>";
    editor.innerHTML = nextHtml;
    fireEvent.input(editor);

    await waitFor(() => expect(apiMock.updateMemo).toHaveBeenCalledWith("memo-1", {
      title: "测试备忘录",
      contentHtml: nextHtml
    }), { timeout: 3000 });

    expect(editor.innerHTML).toBe(nextHtml);
    expect(screen.queryByText("保存中")).not.toBeInTheDocument();
  });

  it("shows refresh errors without clearing the current memo", async () => {
    render(<MemoFloatingCard memoId="memo-1" />);

    await waitFor(() => expect(screen.getByLabelText("备忘录标题")).toHaveValue("测试备忘录"));
    apiMock.memo.mockRejectedValueOnce(new Error("刷新失败"));

    fireEvent.click(screen.getByRole("button", { name: "刷新备忘录" }));

    expect(await screen.findByText("刷新失败")).toBeInTheDocument();
    expect(screen.getByLabelText("备忘录标题")).toHaveValue("测试备忘录");
  });

  it("uses shared floating header controls", async () => {
    render(<MemoFloatingCard memoId="memo-1" />);

    const pinButton = await screen.findByRole("button", { name: "固定在最前" });
    fireEvent.click(pinButton);
    await waitFor(() => expect(windowMock.setAlwaysOnTop).toHaveBeenCalledWith(true));

    fireEvent.click(screen.getByRole("button", { name: "打开桌面" }));
    await waitFor(() => expect(tauriCoreMock.invoke).toHaveBeenCalledWith("show_main_window"));

    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    await waitFor(() => expect(windowMock.close).toHaveBeenCalled());
  });

  it("emits a memo upsert sync event after autosaving lightweight edits", async () => {
    const rawListener = vi.fn();
    window.addEventListener(desktopSyncBrowserEventName, rawListener);
    render(<MemoFloatingCard memoId="memo-1" />);

    const editor = await screen.findByRole("textbox", { name: "备忘录正文" });
    await waitFor(() => expect(editor.innerHTML).toBe("<p>正文</p>"));

    editor.innerHTML = "<p>浮窗保存后同步</p>";
    fireEvent.input(editor);

    await waitFor(() => expect(rawListener).toHaveBeenCalledWith(expect.objectContaining({
      detail: expect.objectContaining({
        memo: expect.objectContaining({
          id: "memo-1",
          contentHtml: "<p>浮窗保存后同步</p>"
        }),
        type: "memo:upserted"
      })
    })), { timeout: 3000 });

    window.removeEventListener(desktopSyncBrowserEventName, rawListener);
  });

  it("applies an external memo upsert when there is no unsaved local draft", async () => {
    render(<MemoFloatingCard memoId="memo-1" />);

    const editor = await screen.findByRole("textbox", { name: "备忘录正文" });
    await waitFor(() => expect(editor.innerHTML).toBe("<p>正文</p>"));

    await act(async () => {
      window.dispatchEvent(new CustomEvent(desktopSyncBrowserEventName, {
        detail: {
          memo: {
            ...memoDetail,
            title: "外部浮窗更新",
            contentHtml: "<p>外部浮窗正文</p>",
            updatedAt: "2026-06-17T08:02:00.000Z"
          },
          sourceId: "main-window",
          type: "memo:upserted"
        }
      }));
    });

    await waitFor(() => expect(screen.getByLabelText("备忘录标题")).toHaveValue("外部浮窗更新"));
    expect(editor.innerHTML).toBe("<p>外部浮窗正文</p>");
  });

  it("does not replace the editor DOM when an external memo upsert arrives during a local draft", async () => {
    render(<MemoFloatingCard memoId="memo-1" />);

    const editor = await screen.findByRole("textbox", { name: "备忘录正文" });
    await waitFor(() => expect(editor.innerHTML).toBe("<p>正文</p>"));

    editor.innerHTML = "<p>本地未保存</p>";
    fireEvent.input(editor);

    await act(async () => {
      window.dispatchEvent(new CustomEvent(desktopSyncBrowserEventName, {
        detail: {
          memo: {
            ...memoDetail,
            title: "外部更新不覆盖",
            contentHtml: "<p>外部正文不覆盖</p>",
            updatedAt: "2026-06-17T08:02:00.000Z"
          },
          sourceId: "main-window",
          type: "memo:upserted"
        }
      }));
    });

    expect(editor.innerHTML).toBe("<p>本地未保存</p>");
  });

  it("shows an unavailable state when the current memo is deleted externally", async () => {
    render(<MemoFloatingCard memoId="memo-1" />);

    await waitFor(() => expect(screen.getByLabelText("备忘录标题")).toHaveValue("测试备忘录"));

    await act(async () => {
      window.dispatchEvent(new CustomEvent(desktopSyncBrowserEventName, {
        detail: {
          memoId: "memo-1",
          sourceId: "main-window",
          type: "memo:deleted"
        }
      }));
    });

    await waitFor(() => expect(screen.queryByLabelText("备忘录标题")).not.toBeInTheDocument());
    expect(screen.getByText("备忘录已删除或不可用")).toBeInTheDocument();
  });
});
