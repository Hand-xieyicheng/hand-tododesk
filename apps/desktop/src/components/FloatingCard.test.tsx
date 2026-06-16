import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => windowMock
}));

vi.mock("@tauri-apps/api/core", () => tauriCoreMock);

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
  appCloseBehavior: "hide",
  displaySize: "default",
  fontFamily: "system"
};

function taskWith(patch: Partial<ApiTask>): ApiTask {
  return {
    ...task,
    ...patch,
    tags: patch.tags ?? task.tags
  };
}

describe("FloatingCard", () => {
  let alwaysOnTop = false;

  beforeEach(() => {
    vi.clearAllMocks();
    alwaysOnTop = false;
    apiMock.tasks.mockResolvedValue({ tasks: [task] });
    apiMock.getThemePreference.mockResolvedValue(titlePreference);
    windowMock.isAlwaysOnTop.mockImplementation(async () => alwaysOnTop);
    windowMock.setAlwaysOnTop.mockImplementation(async (value: boolean) => {
      alwaysOnTop = value;
    });
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

  it("toggles the current floating window always-on-top state", async () => {
    render(<FloatingCard />);

    const pinButton = await screen.findByRole("button", { name: "固定在最前" });
    await waitFor(() => expect(windowMock.isAlwaysOnTop).toHaveBeenCalled());

    fireEvent.click(pinButton);

    await waitFor(() => expect(windowMock.setAlwaysOnTop).toHaveBeenCalledWith(true));
    expect(screen.getByRole("button", { name: "取消固定在最前" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "取消固定在最前" }));

    await waitFor(() => expect(windowMock.setAlwaysOnTop).toHaveBeenLastCalledWith(false));
    expect(screen.getByRole("button", { name: "固定在最前" })).toBeInTheDocument();
  });

  it("opens the main desktop window from the header button", async () => {
    render(<FloatingCard />);

    fireEvent.click(await screen.findByRole("button", { name: "打开桌面" }));

    await waitFor(() => expect(tauriCoreMock.invoke).toHaveBeenCalledWith("show_main_window"));
  });

  it("sorts visible tasks with unfinished items first and created date ascending", async () => {
    const completedOld = taskWith({
      id: "done-old",
      title: "卡片早创建已完成",
      status: "COMPLETED",
      createdAt: "2026-06-01T00:00:00.000Z",
      completedAt: "2026-06-05T00:00:00.000Z"
    });
    const openNew = taskWith({
      id: "todo-new",
      title: "卡片晚创建未完成",
      status: "TODO",
      createdAt: "2026-06-03T00:00:00.000Z"
    });
    const openOld = taskWith({
      id: "todo-old",
      title: "卡片早创建未完成",
      status: "TODO",
      createdAt: "2026-06-02T00:00:00.000Z"
    });
    apiMock.tasks.mockResolvedValue({ tasks: [completedOld, openNew, openOld] });

    const { container } = render(<FloatingCard />);

    await waitFor(() => expect(container.querySelectorAll(".floating-task-title")).toHaveLength(3));
    expect([...container.querySelectorAll(".floating-task-title")].map((item) => item.textContent)).toEqual([
      "卡片早创建未完成",
      "卡片晚创建未完成",
      "卡片早创建已完成"
    ]);
  });
});
