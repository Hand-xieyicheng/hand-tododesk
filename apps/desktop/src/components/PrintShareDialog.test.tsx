import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
  Select: ({ onChange, options, value }: any) => (
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map((option: any) => {
        const optionValue = option.value ?? option.key;
        return <option key={optionValue} value={optionValue}>{option.label}</option>;
      })}
    </select>
  )
}));

vi.mock("../api/client", () => ({
  api: {
    createPrintShare: vi.fn()
  }
}));

describe("PrintShareDialog", () => {
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
});
