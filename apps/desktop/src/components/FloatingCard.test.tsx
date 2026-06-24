import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultVisibleSidebarModules, type ApiTask, type ApiThemePreference } from "@todo/shared";
import { getTodayEndDatetimeLocal } from "../lib/datetime";
import { FloatingCard } from "./FloatingCard";

const apiMock = vi.hoisted(() => ({
  createTask: vi.fn(),
  getThemePreference: vi.fn(),
  setThemePreference: vi.fn(),
  tags: vi.fn(),
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

const tagOptions = [
  { id: "tag-1", name: "财务" },
  { id: "tag-2", name: "生活" }
];

const titlePreference: ApiThemePreference = {
  themeId: "warm-paper",
  titleColor: "app-teal",
  footerVisible: true,
  footerType: "sea",
  showCompletedTasks: true,
  taskViewMode: "list",
  taskCardDisplayMode: "title",
  floatingCardThemeId: "black-snow",
  appCloseBehavior: "hide",
  displaySize: "default",
  visibleSidebarModules: defaultVisibleSidebarModules,
  sidebarCollapsed: false,
  fontFamily: "system"
};

function taskWith(patch: Partial<ApiTask>): ApiTask {
  return {
    ...task,
    ...patch,
    tags: patch.tags ?? task.tags
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

describe("FloatingCard", () => {
  let alwaysOnTop = false;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    alwaysOnTop = false;
    apiMock.tasks.mockResolvedValue({ tasks: [task] });
    apiMock.tags.mockResolvedValue({ tags: tagOptions });
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
    expect(screen.getByRole("checkbox", { name: "完成" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("tooltip")).toHaveTextContent("补齐报销附件");
    expect(screen.getByRole("tooltip")).toHaveTextContent("重要不紧急");
    expect(screen.getByRole("tooltip")).toHaveTextContent("无截止时间");
    expect(screen.getByRole("tooltip")).toHaveTextContent("1 个番茄");
    expect(screen.getByRole("tooltip")).toHaveTextContent("#财务");
  });

  it("applies synced floating card theme variables", async () => {
    const { container } = render(<FloatingCard />);

    await waitFor(() => expect(apiMock.getThemePreference).toHaveBeenCalled());

    const card = container.querySelector(".floating-card");
    expect(card).toHaveStyle("--floating-card-background: #111827");
    expect(card).toHaveStyle("--floating-card-text: #ffffff");
  });

  it("completes an unfinished floating task from the left checkbox", async () => {
    apiMock.updateTask.mockResolvedValue({
      task: taskWith({
        status: "COMPLETED",
        completedAt: "2026-06-14T12:00:00.000Z"
      })
    });
    render(<FloatingCard />);

    const checkbox = await screen.findByRole("checkbox", { name: "完成" });

    expect(checkbox).toHaveAttribute("aria-checked", "false");
    fireEvent.click(checkbox);

    await waitFor(() => expect(apiMock.updateTask).toHaveBeenCalledWith("task-1", { status: "COMPLETED" }));
  });

  it("resets a completed floating task from the left checkbox", async () => {
    apiMock.tasks.mockResolvedValue({
      tasks: [taskWith({
        status: "COMPLETED",
        completedAt: "2026-06-14T12:00:00.000Z"
      })]
    });
    apiMock.updateTask.mockResolvedValue({
      task: taskWith({
        status: "TODO",
        completedAt: null
      })
    });
    render(<FloatingCard />);

    const checkbox = await screen.findByRole("checkbox", { name: "重置为未完成" });

    expect(checkbox).toHaveAttribute("aria-checked", "true");
    fireEvent.click(checkbox);

    await waitFor(() => expect(apiMock.updateTask).toHaveBeenCalledWith("task-1", { status: "TODO" }));
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

  it("keeps floating task content in place while manual refresh is pending", async () => {
    const { container } = render(<FloatingCard />);

    await waitFor(() => expect(screen.getAllByText("整理票据").length).toBeGreaterThan(0));

    const refresh = createDeferred<{ tasks: ApiTask[] }>();
    apiMock.tasks.mockReturnValueOnce(refresh.promise);

    fireEvent.click(screen.getByRole("button", { name: "刷新待办" }));

    await waitFor(() => expect(apiMock.tasks).toHaveBeenCalledTimes(2));

    expect(screen.getAllByText("整理票据").length).toBeGreaterThan(0);
    expect(container.querySelector(".floating-card main > .inline-muted")).not.toBeInTheDocument();
    expect(container.querySelector(".floating-task-list .query-loading-indicator")).not.toBeInTheDocument();
    expect(screen.queryByText("刷新中...")).not.toBeInTheDocument();

    refresh.resolve({ tasks: [task] });
    await waitFor(() => expect(apiMock.tasks).toHaveBeenCalledTimes(2));
  });

  it("defaults the new task deadline to today at 23:59", async () => {
    render(<FloatingCard />);

    fireEvent.click(await screen.findByRole("button", { name: "新增" }));

    expect(screen.getByLabelText("截止时间")).toHaveValue(getTodayEndDatetimeLocal());
  });

  it("submits one selected tag id from the floating form", async () => {
    apiMock.createTask.mockResolvedValue({ task });
    render(<FloatingCard />);

    fireEvent.click(await screen.findByRole("button", { name: "新增" }));
    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "补票据" } });
    fireEvent.change(screen.getByLabelText("标签"), { target: { value: "tag-1" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(apiMock.createTask).toHaveBeenCalledWith(expect.objectContaining({
      title: "补票据",
      tagId: "tag-1"
    })));
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
