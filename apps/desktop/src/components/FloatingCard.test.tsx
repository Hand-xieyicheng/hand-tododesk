import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiTask, ApiThemePreference } from "@todo/shared";
import { FloatingCard } from "./FloatingCard";

const apiMock = vi.hoisted(() => ({
  createTask: vi.fn(),
  getThemePreference: vi.fn(),
  setThemePreference: vi.fn(),
  tasks: vi.fn(),
  updateTask: vi.fn()
}));

vi.mock("../api/client", () => ({
  api: apiMock
}));

vi.mock("animal-island-ui", () => ({
  Button: ({ children, disabled, htmlType, icon, loading, onClick, title, ...props }: any) => (
    <button aria-label={props["aria-label"]} disabled={disabled || loading} type={htmlType ?? "button"} title={title} onClick={onClick}>
      {icon}
      {children}
    </button>
  ),
  Card: ({ children, className }: any) => <section className={className}>{children}</section>,
  Input: ({ onChange, value }: any) => <input value={value} onChange={onChange} />,
  Select: ({ onChange, options, value }: any) => (
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map((option: any) => {
        const optionValue = option.value ?? option.key;
        return <option key={optionValue} value={optionValue}>{option.label}</option>;
      })}
    </select>
  ),
  Tooltip: ({ children, className, title }: any) => (
    <div className={className}>
      {children}
      <div role="tooltip">{title}</div>
    </div>
  )
}));

const task: ApiTask = {
  id: "task-1",
  title: "整理票据",
  notes: "补齐报销附件",
  dueAt: null,
  priority: "IMPORTANT_NOT_URGENT",
  status: "TODO",
  createdAt: "2026-06-14T00:00:00.000Z",
  updatedAt: "2026-06-14T00:00:00.000Z",
  completedAt: null,
  recurrenceRule: null,
  tags: [{ id: "tag-1", name: "财务" }],
  pomodoroCompletedCount: 1,
  pomodoroCompletedMinutes: 25
};

const titlePreference: ApiThemePreference = {
  themeId: "shinchan",
  titleColor: "app-teal",
  footerVisible: true,
  footerType: "sea",
  showCompletedTasks: true,
  taskViewMode: "list",
  taskCardDisplayMode: "title",
  displaySize: "default"
};

describe("FloatingCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.tasks.mockResolvedValue({ tasks: [task] });
    apiMock.getThemePreference.mockResolvedValue(titlePreference);
  });

  it("uses card display preference from synced settings", async () => {
    const { container } = render(<FloatingCard />);

    await waitFor(() => expect(apiMock.getThemePreference).toHaveBeenCalled());
    expect(screen.getAllByText("整理票据").length).toBeGreaterThan(0);

    expect(container.querySelector(".floating-task-notes")).not.toBeInTheDocument();
    expect(container.querySelector(".floating-task-meta")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "编辑" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "完成" })).toBeInTheDocument();
    expect(screen.getByRole("tooltip")).toHaveTextContent("补齐报销附件");
    expect(screen.getByRole("tooltip")).toHaveTextContent("重要不紧急");
    expect(screen.getByRole("tooltip")).toHaveTextContent("无截止时间");
    expect(screen.getByRole("tooltip")).toHaveTextContent("1 个番茄");
    expect(screen.getByRole("tooltip")).toHaveTextContent("#财务");
  });
});
