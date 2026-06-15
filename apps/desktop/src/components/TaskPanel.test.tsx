import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ApiTask } from "@todo/shared";
import { TaskPanel } from "./TaskPanel";

vi.mock("animal-island-ui", () => ({
  Button: ({ children, danger, disabled, htmlType, icon, onClick, title, ...props }: any) => (
    <button aria-label={props["aria-label"]} disabled={disabled} type={htmlType ?? "button"} title={title} data-danger={danger ? "true" : undefined} onClick={onClick}>
      {icon}
      {children}
    </button>
  ),
  Card: ({ children, className }: any) => <section className={className}>{children}</section>,
  Divider: () => <hr />,
  Input: ({ onChange, value }: any) => <input value={value} onChange={onChange} />,
  Modal: ({ children, open }: any) => (open ? <div role="dialog">{children}</div> : null),
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

vi.mock("../api/client", () => ({
  api: {
    createTask: vi.fn(),
    deleteTask: vi.fn(),
    taskQuadrants: vi.fn(),
    updateTask: vi.fn()
  }
}));

const task: ApiTask = {
  id: "task-1",
  title: "准备周报",
  notes: "整理本周项目进展和风险",
  dueAt: "2026-06-15T10:00:00.000Z",
  priority: "IMPORTANT_URGENT",
  status: "TODO",
  createdAt: "2026-06-14T00:00:00.000Z",
  updatedAt: "2026-06-14T00:00:00.000Z",
  completedAt: null,
  recurrenceRule: {
    frequency: "WEEKLY",
    interval: 1,
    until: null,
    count: null,
    byWeekday: null
  },
  tags: [{ id: "tag-1", name: "工作" }],
  pomodoroCompletedCount: 2,
  pomodoroCompletedMinutes: 50
};

function renderPanel(displayMode: "full" | "title") {
  return render(
    <TaskPanel
      createOpen={false}
      showCompletedTasks
      taskCardDisplayMode={displayMode}
      tasks={[task]}
      viewMode="list"
      onChanged={vi.fn(async () => undefined)}
      onCreateOpenChange={vi.fn()}
    />
  );
}

describe("TaskPanel", () => {
  it("shows only title on cards and full content in tooltip for title mode", () => {
    const { container } = renderPanel("title");

    expect(screen.getByRole("heading", { name: "准备周报" })).toBeInTheDocument();
    expect(container.querySelector(".task-notes")).not.toBeInTheDocument();
    expect(container.querySelector(".task-meta")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "完成" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "删除" })).toBeInTheDocument();
    expect(screen.getByRole("tooltip")).toHaveTextContent("整理本周项目进展和风险");
    expect(screen.getByRole("tooltip")).toHaveTextContent("重要且紧急");
    expect(screen.getByRole("tooltip")).toHaveTextContent("2 个番茄");
    expect(screen.getByRole("tooltip")).toHaveTextContent("#工作");
  });

  it("keeps normal card details in full mode", () => {
    const { container } = renderPanel("full");

    expect(container.querySelector(".task-notes")).toHaveTextContent("整理本周项目进展和风险");
    expect(container.querySelector(".task-meta")).toHaveTextContent("重要且紧急");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
