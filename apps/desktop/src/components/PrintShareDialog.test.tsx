import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrintShareDialog } from "./PrintShareDialog";
import { api } from "../api/client";

vi.mock("animal-island-ui", () => ({
  Button: ({ children, disabled, htmlType, loading, onClick, type }: any) => (
    <button
      data-loading={loading ? "true" : undefined}
      data-type={type}
      disabled={disabled}
      type={htmlType ?? "button"}
      onClick={onClick}
    >
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
  Select: ({ options, value }: any) => (
    <div data-value={value}>
      {options.find((option: any) => (option.value ?? option.key) === value)?.label}
    </div>
  )
}));

vi.mock("../api/client", () => ({
  api: {
    createPrintShare: vi.fn()
  }
}));

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

    render(<PrintShareDialog open source={source} sourceType="tasks" onClose={vi.fn()} />);

    expect(screen.getByLabelText("模板")).toHaveValue("checklist");
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

    const { rerender } = render(<PrintShareDialog open source={firstSource} sourceType="tasks" onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "生成链接" }));

    await waitFor(() => expect(api.createPrintShare).toHaveBeenCalledTimes(1));

    rerender(<PrintShareDialog open source={nextSource} sourceType="tasks" onClose={vi.fn()} />);

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

  it("ignores a stale generated link when config changes before the request resolves", async () => {
    const deferred = createDeferred<Awaited<ReturnType<typeof api.createPrintShare>>>();
    vi.mocked(api.createPrintShare).mockReturnValue(deferred.promise);

    const source = {
      tagFilter: "all",
      showCompletedTasks: false,
      viewMode: "list" as const
    };

    render(<PrintShareDialog open source={source} sourceType="tasks" onClose={vi.fn()} />);

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
