import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ApiTask } from "@todo/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrintShareDialog } from "./PrintShareDialog";
import { api } from "../api/client";

vi.mock("animal-island-ui", () => ({
  Button: ({ children, disabled, htmlType, icon, loading, onClick, type, ...props }: any) => (
    <button
      {...props}
      data-loading={loading ? "true" : undefined}
      data-type={type}
      disabled={disabled}
      type={htmlType ?? "button"}
      onClick={onClick}
    >
      {icon}
      {children}
    </button>
  ),
  Input: ({ onChange, value, ...props }: any) => <input {...props} value={value} onChange={onChange} />,
  Modal: ({ children, onClose, open, title }: any) => (
    open ? (
      <div aria-label={title} role="dialog">
        <button aria-label="关闭" type="button" onClick={onClose}>关闭</button>
        {children}
      </div>
    ) : null
  ),
  Select: ({ "aria-label": ariaLabel, disabled, onChange, options, value }: any) => (
    <select aria-label={ariaLabel} disabled={disabled} value={value} onChange={(event) => onChange?.(event.target.value)}>
      {options.map((option: any) => (
        <option key={option.value ?? option.key} value={option.value ?? option.key}>{option.label}</option>
      ))}
    </select>
  )
}));

vi.mock("../api/client", () => ({
  api: {
    createPrintShare: vi.fn()
  }
}));

function createTask(overrides: Partial<ApiTask> = {}): ApiTask {
  return {
    id: "task-1",
    title: "准备真实待办",
    notes: null,
    dueAt: null,
    priority: "IMPORTANT_NOT_URGENT",
    status: "TODO",
    sortOrder: null,
    createdAt: "2026-06-28T00:00:00.000Z",
    updatedAt: "2026-06-28T00:00:00.000Z",
    completedAt: null,
    recurrenceRule: null,
    tags: [],
    pomodoroCompletedCount: 0,
    pomodoroCompletedMinutes: 0,
    ...overrides
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

describe("PrintShareDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generates a task print share link with default config", async () => {
    vi.mocked(api.createPrintShare).mockResolvedValue({
      printShare: {
        id: "share-1",
        url: "https://todo.test/print-shares/share-1",
        expiresAt: "2026-06-29T00:00:00.000Z"
      }
    });

    const source = {
      tagFilter: "all",
      showCompletedTasks: false,
      viewMode: "list" as const
    };

    render(<PrintShareDialog open preview={{ tasks: [createTask()] }} source={source} sourceType="tasks" onClose={vi.fn()} />);

    expect(screen.getByLabelText("样式模版")).toHaveValue("checklist");
    expect(screen.getByRole("option", { name: "标准样式" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "清单模板" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "备忘录模板" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("纸宽")).toHaveValue("58");
    expect(screen.getByLabelText("字号")).toHaveValue("normal");
    expect(screen.getByLabelText("边距")).toHaveValue("normal");
    expect(screen.getByLabelText("有效期")).toHaveValue("24");

    fireEvent.click(screen.getByRole("button", { name: "生成链接" }));

    await waitFor(() => {
      expect(api.createPrintShare).toHaveBeenCalledWith({
        sourceType: "tasks",
        source,
        config: {
          templateId: "checklist",
          paperWidthMode: "preset",
          paperWidthMm: 58,
          fontSizeMode: "normal",
          marginMode: "normal",
          expiresInHours: 24
        }
      });
    });

    expect(screen.getByDisplayValue("https://todo.test/print-shares/share-1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "复制链接" })).toBeInTheDocument();
  });

  it("omits completed tasks from the preview and generated task source", async () => {
    vi.mocked(api.createPrintShare).mockResolvedValue({
      printShare: {
        id: "share-open-only",
        url: "https://todo.test/print-shares/share-open-only",
        expiresAt: "2026-06-29T00:00:00.000Z"
      }
    });

    const source = {
      tagFilter: "all",
      showCompletedTasks: true,
      viewMode: "list" as const
    };

    render(<PrintShareDialog
      open
      preview={{
        tasks: [
          createTask({ id: "task-open", title: "未完成打印项", status: "TODO" }),
          createTask({ id: "task-done", title: "已完成打印项", status: "COMPLETED", completedAt: "2026-06-28T01:00:00.000Z" })
        ]
      }}
      source={source}
      sourceType="tasks"
      onClose={vi.fn()}
    />);

    const preview = screen.getByRole("region", { name: "打印预览" });
    expect(preview).toHaveTextContent("未完成打印项");
    expect(preview).not.toHaveTextContent("已完成打印项");

    fireEvent.click(screen.getByRole("button", { name: "生成链接" }));

    await waitFor(() => {
      expect(api.createPrintShare).toHaveBeenCalledWith(expect.objectContaining({
        source: {
          ...source,
          showCompletedTasks: false
        }
      }));
    });
  });

  it("renders the selected paper width inside the preview paper at true scale", () => {
    const source = {
      tagFilter: "all",
      showCompletedTasks: false,
      viewMode: "list" as const
    };

    render(<PrintShareDialog open preview={{ tasks: [createTask()] }} source={source} sourceType="tasks" onClose={vi.fn()} />);

    const paper = screen.getByText("待办预览").closest(".print-share-preview-paper");
    expect(paper).toHaveStyle({ width: "116px" });
    expect(screen.getByLabelText("当前预览纸宽")).toHaveTextContent("58mm");

    fireEvent.change(screen.getByLabelText("纸宽"), { target: { value: "80" } });

    expect(paper).toHaveStyle({ width: "160px" });
    expect(screen.getByLabelText("当前预览纸宽")).toHaveTextContent("80mm");

    fireEvent.change(screen.getByLabelText("纸宽"), { target: { value: "custom" } });
    fireEvent.change(screen.getByLabelText("自定义纸宽"), { target: { value: "120" } });

    expect(paper).toHaveStyle({ width: "240px" });
    expect(screen.getByLabelText("当前预览纸宽")).toHaveTextContent("120mm");
  });

  it("places the copy action as an icon button inside the generated link field", async () => {
    vi.mocked(api.createPrintShare).mockResolvedValue({
      printShare: {
        id: "share-inline-copy",
        url: "https://todo.test/print-shares/share-inline-copy",
        expiresAt: "2026-06-29T00:00:00.000Z"
      }
    });

    const source = {
      tagFilter: "all",
      showCompletedTasks: false,
      viewMode: "list" as const
    };

    render(<PrintShareDialog open preview={{ tasks: [createTask()] }} source={source} sourceType="tasks" onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "生成链接" }));

    await waitFor(() => {
      expect(screen.getByLabelText("生成的打印分享链接")).toHaveValue("https://todo.test/print-shares/share-inline-copy");
    });

    const linkInput = screen.getByLabelText("生成的打印分享链接");
    const copyButton = screen.getByRole("button", { name: "复制链接" });
    const linkField = linkInput.closest(".print-share-link-field");

    expect(linkField).not.toBeNull();
    expect(linkField).toContainElement(copyButton);
    expect(copyButton).toHaveClass("print-share-link-copy-button");
    expect(copyButton).toHaveAttribute("title", "复制链接");
    expect(copyButton).toHaveTextContent("");
    expect(copyButton.querySelector("svg")).toBeInTheDocument();
    expect(screen.queryByText("复制链接")).not.toBeInTheDocument();
  });

  it("shows the copied feedback above the inline copy icon", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });
    vi.mocked(api.createPrintShare).mockResolvedValue({
      printShare: {
        id: "share-copy-feedback",
        url: "https://todo.test/print-shares/share-copy-feedback",
        expiresAt: "2026-06-29T00:00:00.000Z"
      }
    });

    const source = {
      tagFilter: "all",
      showCompletedTasks: false,
      viewMode: "list" as const
    };

    render(<PrintShareDialog open preview={{ tasks: [createTask()] }} source={source} sourceType="tasks" onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "生成链接" }));

    await waitFor(() => {
      expect(screen.getByLabelText("生成的打印分享链接")).toHaveValue("https://todo.test/print-shares/share-copy-feedback");
    });

    const linkInput = screen.getByLabelText("生成的打印分享链接");
    const copyButton = screen.getByRole("button", { name: "复制链接" });
    const linkField = linkInput.closest(".print-share-link-field");

    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("https://todo.test/print-shares/share-copy-feedback");
      expect(screen.getByRole("status")).toHaveTextContent("已复制");
    });

    const copyFeedback = screen.getByRole("status");
    expect(linkField).not.toBeNull();
    expect(copyFeedback).toHaveClass("print-share-copy-message");
    expect(copyFeedback.parentElement).toBe(linkField);
    expect(copyFeedback.compareDocumentPosition(copyButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("ignores a stale generated link when the source changes before the request resolves", async () => {
    const deferred = createDeferred<Awaited<ReturnType<typeof api.createPrintShare>>>();
    vi.mocked(api.createPrintShare).mockReturnValue(deferred.promise);

    const firstSource = {
      tagFilter: "all",
      showCompletedTasks: false,
      viewMode: "list" as const
    };
    const nextSource = {
      tagFilter: "work",
      showCompletedTasks: false,
      viewMode: "list" as const
    };

    const { rerender } = render(<PrintShareDialog open preview={{ tasks: [createTask()] }} source={firstSource} sourceType="tasks" onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "生成链接" }));

    await waitFor(() => expect(api.createPrintShare).toHaveBeenCalledTimes(1));

    rerender(<PrintShareDialog open preview={{ tasks: [createTask()] }} source={nextSource} sourceType="tasks" onClose={vi.fn()} />);

    await act(async () => {
      deferred.resolve({
        printShare: {
          id: "stale-share",
          url: "https://todo.test/print-shares/stale-share",
          expiresAt: "2026-06-29T00:00:00.000Z"
        }
      });
      await deferred.promise;
    });

    expect(screen.queryByDisplayValue("https://todo.test/print-shares/stale-share")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "复制链接" })).not.toBeInTheDocument();
  });

  it("creates a print share with custom paper width", async () => {
    vi.mocked(api.createPrintShare).mockResolvedValue({
      printShare: {
        id: "share-custom",
        url: "https://todo.test/print-shares/share-custom",
        expiresAt: "2026-06-29T00:00:00.000Z"
      }
    });

    const source = {
      tagFilter: "all",
      showCompletedTasks: false,
      viewMode: "list" as const
    };

    render(<PrintShareDialog open preview={{ tasks: [createTask()] }} source={source} sourceType="tasks" onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("纸宽"), { target: { value: "custom" } });
    fireEvent.change(screen.getByLabelText("自定义纸宽"), { target: { value: "62" } });
    fireEvent.click(screen.getByRole("button", { name: "生成链接" }));

    await waitFor(() => {
      expect(api.createPrintShare).toHaveBeenCalledWith(expect.objectContaining({
        config: expect.objectContaining({
          paperWidthMode: "custom",
          paperWidthMm: 62
        })
      }));
    });
  });

  it("updates the preview live and reveals the generated link below it after generation", async () => {
    vi.mocked(api.createPrintShare).mockResolvedValue({
      printShare: {
        id: "share-preview",
        url: "https://todo.test/print-shares/share-preview",
        expiresAt: "2026-06-29T00:00:00.000Z"
      }
    });

    const source = {
      tagFilter: "all",
      showCompletedTasks: false,
      viewMode: "list" as const
    };

    render(<PrintShareDialog
      open
      preview={{
        tasks: [
          createTask({ id: "task-real-1", title: "真实待办一", notes: "真实备注一" }),
          createTask({ id: "task-real-2", title: "真实待办二", status: "COMPLETED", completedAt: "2026-06-28T01:00:00.000Z" })
        ]
      }}
      source={source}
      sourceType="tasks"
      onClose={vi.fn()}
    />);

    const preview = screen.getByRole("region", { name: "打印预览" });
    expect(preview).toContainElement(screen.getByRole("heading", { name: "预览模版" }));
    expect(preview).toHaveTextContent("真实待办一");
    expect(preview).toHaveTextContent("真实备注一");
    expect(preview).not.toHaveTextContent("真实待办二");
    expect(preview).not.toHaveTextContent("准备今天的待办清单");
    expect(screen.queryByLabelText("当前预览配置")).not.toBeInTheDocument();
    expect(preview).not.toHaveTextContent("标准样式");
    expect(screen.getByLabelText("当前预览纸宽")).toHaveTextContent("58mm");
    expect(screen.queryByLabelText("生成的打印分享链接")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("样式模版"), { target: { value: "decorated" } });
    fireEvent.change(screen.getByLabelText("纸宽"), { target: { value: "custom" } });
    fireEvent.change(screen.getByLabelText("自定义纸宽"), { target: { value: "62" } });
    fireEvent.change(screen.getByLabelText("字号"), { target: { value: "large" } });
    fireEvent.change(screen.getByLabelText("边距"), { target: { value: "wide" } });

    expect(screen.queryByLabelText("当前预览配置")).not.toBeInTheDocument();
    expect(preview).not.toHaveTextContent("装饰样式");
    expect(screen.getByLabelText("当前预览纸宽")).toHaveTextContent("62mm");
    expect(preview).not.toHaveTextContent("大字");
    expect(preview).not.toHaveTextContent("宽边距");
    expect(screen.queryByLabelText("生成的打印分享链接")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "生成链接" }));

    await waitFor(() => {
      expect(screen.getByLabelText("生成的打印分享链接")).toHaveValue("https://todo.test/print-shares/share-preview");
    });
    expect(preview).toContainElement(screen.getByLabelText("生成的打印分享链接"));
  });

  it("uses the current memo title and content as preview data", () => {
    render(<PrintShareDialog
      open
      preview={{ title: "真实备忘录标题", contentHtml: "<p>第一段真实内容</p><ul><li>真实列表项</li></ul>" }}
      source={{ memoId: "memo-1" }}
      sourceType="memo"
      onClose={vi.fn()}
    />);

    const preview = screen.getByRole("region", { name: "打印预览" });

    expect(preview).toHaveTextContent("真实备忘录标题");
    expect(preview).toHaveTextContent("第一段真实内容");
    expect(preview).toHaveTextContent("真实列表项");
    expect(preview).not.toHaveTextContent("整理备忘录重点内容");
  });

  it("ignores a stale generated link when config changes before the request resolves", async () => {
    const deferred = createDeferred<Awaited<ReturnType<typeof api.createPrintShare>>>();
    vi.mocked(api.createPrintShare).mockReturnValue(deferred.promise);

    const source = {
      tagFilter: "all",
      showCompletedTasks: false,
      viewMode: "list" as const
    };

    render(<PrintShareDialog open preview={{ tasks: [createTask()] }} source={source} sourceType="tasks" onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "生成链接" }));

    await waitFor(() => expect(api.createPrintShare).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText("纸宽"), { target: { value: "80" } });

    await act(async () => {
      deferred.resolve({
        printShare: {
          id: "stale-config-share",
          url: "https://todo.test/print-shares/stale-config-share",
          expiresAt: "2026-06-29T00:00:00.000Z"
        }
      });
      await deferred.promise;
    });

    expect(screen.queryByDisplayValue("https://todo.test/print-shares/stale-config-share")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "复制链接" })).not.toBeInTheDocument();
  });
});
