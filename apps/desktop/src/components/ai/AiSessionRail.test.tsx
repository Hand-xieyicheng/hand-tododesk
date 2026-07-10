import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ApiAiSession } from "@todo/shared";
import { AiSessionRail } from "./AiSessionRail";

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
  Modal: ({ children, className, onClose, open, title }: any) => open ? (
    <div aria-label={title} className={className} role="dialog">
      <button aria-label="关闭" type="button" onClick={onClose}>关闭</button>
      {children}
    </div>
  ) : null
}));

const session: ApiAiSession = {
  id: "session-1",
  title: "工作计划",
  summary: null,
  lastMessageAt: "2026-07-10T04:00:00.000Z",
  createdAt: "2026-07-10T04:00:00.000Z",
  updatedAt: "2026-07-10T04:00:00.000Z"
};

function renderRail(overrides: Partial<Parameters<typeof AiSessionRail>[0]> = {}) {
  const props = {
    sessions: [session],
    activeSessionId: session.id,
    onCreate: vi.fn(),
    onDelete: vi.fn(),
    onRename: vi.fn(),
    onSelect: vi.fn(),
    ...overrides
  };
  render(<AiSessionRail {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "展开会话列表" }));
  return props;
}

describe("AiSessionRail", () => {
  it("renames a session through the app modal", async () => {
    const onRename = vi.fn().mockResolvedValue(undefined);
    renderRail({ onRename });

    fireEvent.click(screen.getByRole("button", { name: "重命名会话：工作计划" }));
    expect(screen.getByRole("dialog", { name: "重命名会话" })).toBeInTheDocument();
    const titleInput = screen.getByRole("textbox", { name: "会话名称" });
    expect(titleInput).toHaveValue("工作计划");

    fireEvent.change(titleInput, { target: { value: "  七月计划  " } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(onRename).toHaveBeenCalledWith("session-1", "七月计划"));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "重命名会话" })).not.toBeInTheDocument());
  });

  it("only deletes a session after confirmation", async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    renderRail({ onDelete });

    fireEvent.click(screen.getByRole("button", { name: "删除会话：工作计划" }));
    expect(screen.getByRole("dialog", { name: "删除会话" })).toHaveClass(
      "confirm-dialog",
      "ai-session-delete-dialog"
    );
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(onDelete).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "删除会话" })).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "删除会话：工作计划" }));
    fireEvent.click(screen.getByRole("button", { name: "删除" }));

    await waitFor(() => expect(onDelete).toHaveBeenCalledWith("session-1"));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "删除会话" })).not.toBeInTheDocument());
  });
});
