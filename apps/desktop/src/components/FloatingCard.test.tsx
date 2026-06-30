import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultVisibleSidebarModules, toLocalDateKey, type ApiHabit, type ApiTask, type ApiThemePreference } from "@todo/shared";
import { desktopSyncBrowserEventName } from "../lib/desktopSync";
import { getTodayEndDatetimeLocal, getTomorrowEndDatetimeLocal } from "../lib/datetime";
import { useTaskBoardStore } from "../stores/taskBoardStore";
import { FloatingCard } from "./FloatingCard";

const apiMock = vi.hoisted(() => ({
  cancelHabitCheckIn: vi.fn(),
  checkInHabit: vi.fn(),
  createTask: vi.fn(),
  getThemePreference: vi.fn(),
  habits: vi.fn(),
  setThemePreference: vi.fn(),
  tags: vi.fn(),
  tasks: vi.fn(),
  updateTask: vi.fn(),
  updateTaskOrder: vi.fn()
}));

const dndMock = vi.hoisted(() => ({
  draggables: new Map<string, { data: unknown; disabled?: boolean }>(),
  droppables: new Map<string, { data: unknown }>(),
  handlers: {} as {
    onDragCancel?: () => void;
    onDragEnd?: (event: { active: { id: string; data: { current: unknown } }; over: { id: string; data: { current: unknown } } | null }) => void | Promise<void>;
    onDragStart?: (event: { active: { id: string; data: { current: unknown } } }) => void | Promise<void>;
  }
}));

const tauriCoreMock = vi.hoisted(() => ({
  invoke: vi.fn()
}));

const windowMock = vi.hoisted(() => ({
  close: vi.fn(),
  innerSize: vi.fn(),
  isAlwaysOnTop: vi.fn(),
  onMoved: vi.fn(),
  onResized: vi.fn(),
  outerPosition: vi.fn(),
  setAlwaysOnTop: vi.fn(),
  setPosition: vi.fn(),
  setSize: vi.fn(),
  startDragging: vi.fn()
}));

vi.mock("../api/client", () => ({
  api: apiMock
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => windowMock
}));

vi.mock("@tauri-apps/api/core", () => tauriCoreMock);

vi.mock("@dnd-kit/core", async () => {
  const React = await import("react");
  return {
    DndContext: ({ children, onDragCancel, onDragEnd, onDragStart }: any) => {
      dndMock.handlers = { onDragCancel, onDragEnd, onDragStart };
      return React.createElement("div", { "data-testid": "floating-dnd-context" }, children);
    },
    KeyboardSensor: function KeyboardSensor() {},
    PointerSensor: function PointerSensor() {},
    closestCenter: vi.fn(),
    useDroppable: ({ data, id }: any) => {
      dndMock.droppables.set(String(id), { data });
      return {
        isOver: false,
        setNodeRef: vi.fn()
      };
    },
    useSensor: vi.fn((sensor, options) => ({ options, sensor })),
    useSensors: vi.fn((...sensors) => sensors)
  };
});

vi.mock("@dnd-kit/sortable", async () => {
  const React = await import("react");
  return {
    SortableContext: ({ children }: any) => React.createElement("div", { "data-testid": "floating-sortable-context" }, children),
    sortableKeyboardCoordinates: vi.fn(),
    verticalListSortingStrategy: vi.fn(),
    useSortable: ({ data, disabled, id }: any) => {
      dndMock.draggables.set(String(id), { data, disabled });
      return {
        attributes: { "data-sortable-id": String(id) },
        isDragging: false,
        listeners: disabled ? {} : { "data-sortable-listener": String(id) },
        setActivatorNodeRef: vi.fn(),
        setNodeRef: vi.fn(),
        transform: null,
        transition: undefined
      };
    }
  };
});

vi.mock("@dnd-kit/utilities", () => ({
  CSS: {
    Transform: {
      toString: vi.fn(() => "")
    }
  }
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
  startAt: null,
  dueAt: null,
  priority: "IMPORTANT_NOT_URGENT",
  status: "TODO",
  sortOrder: null,
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

const todayHabit: ApiHabit = {
  id: "habit-1",
  title: "学习日语",
  notes: null,
  icon: "BookOpen",
  color: "mint",
  frequency: "DAILY",
  interval: 1,
  weekDays: [],
  monthDays: [],
  startDate: "2020-01-01",
  endDate: null,
  sortOrder: 1000,
  archivedAt: null,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
  todayPlanned: true,
  todayChecked: false,
  stats: {
    currentStreak: 3,
    currentStreakUnit: "天",
    monthCheckIns: 2,
    monthCompletionRate: 50,
    monthPlanned: 4,
    totalCheckIns: 13
  }
};

const checkedTodayHabit: ApiHabit = {
  ...todayHabit,
  todayChecked: true
};

const unplannedHabit: ApiHabit = {
  ...todayHabit,
  id: "habit-unplanned",
  title: "周末阅读",
  todayPlanned: false
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

async function dropTaskOnTask(activeId: string, overId: string) {
  const draggable = dndMock.draggables.get(activeId);
  const droppable = dndMock.draggables.get(overId);
  const active = { id: activeId, data: { current: draggable?.data } };

  await dndMock.handlers.onDragEnd?.({
    active,
    over: droppable ? { id: overId, data: { current: droppable.data } } : null
  });
}

async function startTaskDrag(activeId: string) {
  const draggable = dndMock.draggables.get(activeId);
  await dndMock.handlers.onDragStart?.({
    active: { id: activeId, data: { current: draggable?.data } }
  });
}

async function dropTaskOnGroup(activeId: string, predicate: (data: any) => boolean) {
  const draggable = dndMock.draggables.get(activeId);
  const droppable = [...dndMock.droppables.entries()].find(([, target]) => predicate(target.data));
  if (!droppable) {
    throw new Error("Expected matching droppable");
  }
  await dndMock.handlers.onDragEnd?.({
    active: { id: activeId, data: { current: draggable?.data } },
    over: { id: droppable[0], data: { current: droppable[1].data } }
  });
}

describe("FloatingCard", () => {
  let alwaysOnTop = false;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useTaskBoardStore.getState().reset();
    dndMock.draggables.clear();
    dndMock.droppables.clear();
    dndMock.handlers = {};
    alwaysOnTop = false;
    apiMock.tasks.mockResolvedValue({ tasks: [task] });
    apiMock.tags.mockResolvedValue({ tags: tagOptions });
    apiMock.habits.mockResolvedValue({ habits: [todayHabit] });
    apiMock.getThemePreference.mockResolvedValue(titlePreference);
    apiMock.checkInHabit.mockResolvedValue({ checkIn: null });
    apiMock.cancelHabitCheckIn.mockResolvedValue(undefined);
    apiMock.updateTaskOrder.mockResolvedValue({ ok: true });
    windowMock.innerSize.mockResolvedValue({ height: 520, width: 360 });
    windowMock.isAlwaysOnTop.mockImplementation(async () => alwaysOnTop);
    windowMock.onMoved.mockResolvedValue(vi.fn());
    windowMock.onResized.mockResolvedValue(vi.fn());
    windowMock.outerPosition.mockResolvedValue({ x: 80, y: 90 });
    windowMock.setAlwaysOnTop.mockImplementation(async (value: boolean) => {
      alwaysOnTop = value;
    });
    windowMock.setPosition.mockResolvedValue(undefined);
    windowMock.setSize.mockResolvedValue(undefined);
  });

  it("restores cached desktop card size and position on startup", async () => {
    localStorage.setItem("tododesk.floatingWindowGeometry.task", JSON.stringify({
      height: 620,
      width: 440,
      x: 72,
      y: 96
    }));

    render(<FloatingCard />);

    await waitFor(() => expect(windowMock.isAlwaysOnTop).toHaveBeenCalled());
    await waitFor(() => expect(windowMock.onMoved).toHaveBeenCalled());
    await waitFor(() => expect(windowMock.setSize).toHaveBeenCalledWith(expect.objectContaining({
      height: 620,
      width: 440
    })));
    expect(windowMock.setPosition).toHaveBeenCalledWith(expect.objectContaining({
      x: 72,
      y: 96
    }));
  });

  it("uses card display preference from synced settings", async () => {
    const { container } = render(<FloatingCard />);

    await waitFor(() => expect(apiMock.getThemePreference).toHaveBeenCalled());
    expect(screen.getAllByText("整理票据").length).toBeGreaterThan(0);

    expect(container.querySelector(".floating-task-notes")).not.toBeInTheDocument();
    expect(container.querySelector(".floating-task-meta")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "编辑" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "完成" })).toHaveAttribute("aria-checked", "false");
    const taskTooltip = container.querySelector(".floating-task-tooltip [role='tooltip']");
    expect(taskTooltip).toHaveTextContent("补齐报销附件");
    expect(taskTooltip).toHaveTextContent("重要不紧急");
    expect(taskTooltip).toHaveTextContent("无时间");
    expect(taskTooltip).toHaveTextContent("1 个番茄");
    expect(taskTooltip).toHaveTextContent("#财务");
  });

  it("applies synced floating card theme variables", async () => {
    const { container } = render(<FloatingCard />);

    await waitFor(() => expect(apiMock.getThemePreference).toHaveBeenCalled());

    const card = container.querySelector(".floating-card");
    expect(card).toHaveStyle("--floating-card-background: #111827");
    expect(card).toHaveStyle("--floating-card-text: #ffffff");
  });

  it("shows today planned habit shortcuts when the preference is enabled", async () => {
    render(<FloatingCard />);

    const shortcut = await screen.findByRole("button", { name: "打卡 学习日语" });

    expect(apiMock.habits).toHaveBeenCalledWith(false);
    expect(shortcut).toHaveAttribute("aria-pressed", "false");
    expect(shortcut.querySelector(".lucide-book-open")).not.toBeNull();
  });

  it("hides habit shortcuts when the preference is disabled", async () => {
    apiMock.getThemePreference.mockResolvedValue({
      ...titlePreference,
      floatingCardHabitCheckInEnabled: false
    });
    render(<FloatingCard />);

    await waitFor(() => expect(apiMock.habits).toHaveBeenCalledWith(false));

    expect(screen.queryByRole("button", { name: "打卡 学习日语" })).not.toBeInTheDocument();
  });

  it("hides habits that are not planned today", async () => {
    apiMock.habits.mockResolvedValue({ habits: [unplannedHabit] });
    render(<FloatingCard />);

    await waitFor(() => expect(apiMock.habits).toHaveBeenCalledWith(false));

    expect(screen.queryByRole("button", { name: "打卡 周末阅读" })).not.toBeInTheDocument();
  });

  it("checks in a planned habit from the floating card and emits a habit refresh event", async () => {
    const rawListener = vi.fn();
    window.addEventListener(desktopSyncBrowserEventName, rawListener);
    render(<FloatingCard />);

    fireEvent.click(await screen.findByRole("button", { name: "打卡 学习日语" }));

    await waitFor(() => expect(apiMock.checkInHabit).toHaveBeenCalledWith("habit-1", toLocalDateKey()));
    await waitFor(() => expect(rawListener).toHaveBeenCalledWith(expect.objectContaining({
      detail: expect.objectContaining({
        type: "habit-board:reload-requested"
      })
    })));

    window.removeEventListener(desktopSyncBrowserEventName, rawListener);
  });

  it("cancels a checked habit from the floating card", async () => {
    apiMock.habits.mockResolvedValue({ habits: [checkedTodayHabit] });
    render(<FloatingCard />);

    const shortcut = await screen.findByRole("button", { name: "取消打卡 学习日语" });

    expect(shortcut).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(shortcut);

    await waitFor(() => expect(apiMock.cancelHabitCheckIn).toHaveBeenCalledWith("habit-1", toLocalDateKey()));
  });

  it("cycles the floating card view mode without changing the main task view mode", async () => {
    apiMock.setThemePreference.mockResolvedValue({
      ...titlePreference,
      floatingCardViewMode: "quadrant"
    });
    render(<FloatingCard />);

    fireEvent.click(await screen.findByRole("button", { name: "切换为四象限列表" }));

    await waitFor(() => expect(apiMock.setThemePreference).toHaveBeenCalledWith({ floatingCardViewMode: "quadrant" }));
    expect(apiMock.setThemePreference).not.toHaveBeenCalledWith(expect.objectContaining({ taskViewMode: expect.any(String) }));
    expect(screen.getByRole("button", { name: "切换为标签列表" })).toBeInTheDocument();
  });

  it("places the floating view switch immediately after the add button", async () => {
    const { container } = render(<FloatingCard />);

    await screen.findByRole("button", { name: "新增" });

    const toolbarButtons = [...container.querySelectorAll<HTMLButtonElement>(".floating-toolbar button")];
    expect(toolbarButtons.map((button) => button.textContent || button.getAttribute("aria-label"))).toEqual([
      "新增",
      "切换为四象限列表",
      "隐藏已完成待办",
      "刷新待办"
    ]);
  });

  it("groups floating tasks by non-empty quadrants", async () => {
    apiMock.getThemePreference.mockResolvedValue({
      ...titlePreference,
      floatingCardViewMode: "quadrant"
    });
    apiMock.tasks.mockResolvedValue({
      tasks: [
        task,
        taskWith({
          id: "task-urgent",
          title: "处理紧急账单",
          priority: "IMPORTANT_URGENT"
        })
      ]
    });

    render(<FloatingCard />);

    expect(await screen.findByRole("heading", { name: "重要且紧急" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "重要不紧急" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "不重要但紧急" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "不重要不紧急" })).not.toBeInTheDocument();
  });

  it("groups floating tasks by tag and keeps tag labels out of the task cards", async () => {
    apiMock.getThemePreference.mockResolvedValue({
      ...titlePreference,
      floatingCardViewMode: "tag",
      taskCardDisplayMode: "full"
    });
    apiMock.tasks.mockResolvedValue({
      tasks: [
        task,
        taskWith({
          id: "task-untagged",
          title: "无标签事项",
          tags: []
        })
      ]
    });

    const { container } = render(<FloatingCard />);

    expect(await screen.findByRole("heading", { name: "财务" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "其它" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "生活" })).not.toBeInTheDocument();
    expect(container.querySelector(".floating-task-list")).not.toHaveTextContent("#财务");
  });

  it("shows empty quadrant drop targets while dragging and saves priority when dropped across groups", async () => {
    apiMock.getThemePreference.mockResolvedValue({
      ...titlePreference,
      floatingCardViewMode: "quadrant"
    });
    apiMock.updateTask.mockResolvedValue({
      task: taskWith({ priority: "IMPORTANT_URGENT" })
    });
    render(<FloatingCard />);

    await waitFor(() => expect(dndMock.draggables.has("task-1")).toBe(true));
    expect(screen.queryByRole("heading", { name: "重要且紧急" })).not.toBeInTheDocument();

    await act(async () => {
      await startTaskDrag("task-1");
    });

    expect(screen.getByRole("heading", { name: "重要且紧急" })).toBeInTheDocument();

    await act(async () => {
      await dropTaskOnGroup("task-1", (data) => data?.type === "floating-task-group-drop" && data?.priority === "IMPORTANT_URGENT");
    });

    await waitFor(() => expect(apiMock.updateTask).toHaveBeenCalledWith("task-1", { priority: "IMPORTANT_URGENT" }));
    await waitFor(() => expect(apiMock.updateTaskOrder).toHaveBeenCalledWith({ orderedIds: ["task-1"] }));
  });

  it("shows empty tag drop targets while dragging and clears tags when dropped on Other", async () => {
    apiMock.getThemePreference.mockResolvedValue({
      ...titlePreference,
      floatingCardViewMode: "tag"
    });
    apiMock.updateTask.mockResolvedValue({
      task: taskWith({ tags: [] })
    });
    render(<FloatingCard />);

    await waitFor(() => expect(dndMock.draggables.has("task-1")).toBe(true));
    expect(screen.queryByRole("heading", { name: "其它" })).not.toBeInTheDocument();

    await act(async () => {
      await startTaskDrag("task-1");
    });

    expect(screen.getByRole("heading", { name: "其它" })).toBeInTheDocument();

    await act(async () => {
      await dropTaskOnGroup("task-1", (data) => data?.type === "floating-task-group-drop" && data?.view === "tag" && data?.tagId === null);
    });

    await waitFor(() => expect(apiMock.updateTask).toHaveBeenCalledWith("task-1", { tagId: null }));
    await waitFor(() => expect(apiMock.updateTaskOrder).toHaveBeenCalledWith({ orderedIds: ["task-1"] }));
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
    apiMock.createTask.mockResolvedValue({ task });
    render(<FloatingCard />);

    fireEvent.click(await screen.findByRole("button", { name: "新增" }));
    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "今日票据" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(apiMock.createTask).toHaveBeenCalledWith(expect.objectContaining({
      dueAt: new Date(getTodayEndDatetimeLocal()).toISOString(),
      startAt: null
    })));
  });

  it("sets tomorrow from the floating time shortcut", async () => {
    apiMock.createTask.mockResolvedValue({ task });
    render(<FloatingCard />);

    fireEvent.click(await screen.findByRole("button", { name: "新增" }));
    expect(screen.getByText("日期时间")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "明日" }));
    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "明日票据" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(apiMock.createTask).toHaveBeenCalledWith(expect.objectContaining({
      dueAt: new Date(getTomorrowEndDatetimeLocal()).toISOString(),
      startAt: null
    })));
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

  it("sorts visible tasks with completed items at the bottom", async () => {
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

  it("persists manual order after dragging floating tasks", async () => {
    const firstTask = taskWith({
      id: "floating-first",
      title: "浮窗第一",
      createdAt: "2026-06-01T00:00:00.000Z"
    });
    const secondTask = taskWith({
      id: "floating-second",
      title: "浮窗第二",
      createdAt: "2026-06-02T00:00:00.000Z"
    });
    const rawListener = vi.fn();
    apiMock.tasks.mockResolvedValue({ tasks: [firstTask, secondTask] });
    window.addEventListener(desktopSyncBrowserEventName, rawListener);

    render(<FloatingCard />);

    await waitFor(() => expect(dndMock.draggables.has("floating-second")).toBe(true));
    await dropTaskOnTask("floating-first", "floating-second");

    await waitFor(() => expect(apiMock.updateTaskOrder).toHaveBeenCalledWith({
      orderedIds: ["floating-second", "floating-first"]
    }));
    await waitFor(() => expect(rawListener).toHaveBeenCalledWith(expect.objectContaining({
      detail: expect.objectContaining({
        type: "task-board:reload-requested"
      })
    })));

    window.removeEventListener(desktopSyncBrowserEventName, rawListener);
  });

  it("uses the whole floating task card as the drag activator", async () => {
    apiMock.tasks.mockResolvedValue({ tasks: [task] });

    const { container } = render(<FloatingCard />);

    await waitFor(() => expect(container.querySelector(".floating-task-title")).toHaveTextContent("整理票据"));

    const sortableCard = container.querySelector<HTMLElement>("[data-floating-task-id='task-1']");
    expect(sortableCard).toHaveAttribute("data-sortable-listener", "task-1");
    expect(screen.queryByRole("button", { name: "拖动排序整理票据" })).not.toBeInTheDocument();
    expect(container.querySelector("[title='拖动排序']")).not.toBeInTheDocument();
  });

  it("does not allow completed floating cards to drag or receive dropped tasks", async () => {
    const openTask = taskWith({
      id: "floating-open",
      title: "浮窗未完成",
      createdAt: "2026-06-01T00:00:00.000Z"
    });
    const completedTask = taskWith({
      id: "floating-done",
      title: "浮窗已完成",
      status: "COMPLETED",
      completedAt: "2026-06-03T00:00:00.000Z",
      createdAt: "2026-06-02T00:00:00.000Z"
    });
    apiMock.tasks.mockResolvedValue({ tasks: [completedTask, openTask] });

    const { container } = render(<FloatingCard />);

    await waitFor(() => expect(container.querySelectorAll(".floating-task-title")).toHaveLength(2));

    const completedSortable = container.querySelector<HTMLElement>("[data-floating-task-id='floating-done']");
    expect(dndMock.draggables.get("floating-done")?.disabled).toBe(true);
    expect(completedSortable).not.toHaveAttribute("data-sortable-listener");

    await dropTaskOnTask("floating-open", "floating-done");
    await dropTaskOnTask("floating-done", "floating-open");

    expect(apiMock.updateTaskOrder).not.toHaveBeenCalled();
  });

  it("applies external task upsert events without reloading tasks", async () => {
    render(<FloatingCard />);

    await waitFor(() => expect(screen.getAllByText("整理票据").length).toBeGreaterThan(0));
    expect(apiMock.tasks).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.dispatchEvent(new CustomEvent(desktopSyncBrowserEventName, {
        detail: {
          sourceId: "main-window",
          task: taskWith({ title: "整理票据更新" }),
          type: "task:upserted"
        }
      }));
    });

    expect(screen.getAllByText("整理票据更新").length).toBeGreaterThan(0);
    expect(apiMock.tasks).toHaveBeenCalledTimes(1);
  });

  it("applies external preference events without waiting for polling", async () => {
    apiMock.tasks.mockResolvedValue({
      tasks: [
        task,
        taskWith({
          id: "task-2",
          title: "已完成旧任务",
          status: "COMPLETED",
          completedAt: "2026-06-14T12:00:00.000Z"
        })
      ]
    });
    render(<FloatingCard />);

    await waitFor(() => expect(screen.getByText("含已完成")).toBeInTheDocument());

    await act(async () => {
      window.dispatchEvent(new CustomEvent(desktopSyncBrowserEventName, {
        detail: {
          preference: {
            ...titlePreference,
            showCompletedTasks: false
          },
          sourceId: "main-window",
          type: "preference:changed"
        }
      }));
    });

    expect(screen.getByText("仅未完成")).toBeInTheDocument();
    expect(screen.queryByText("已完成旧任务")).not.toBeInTheDocument();
  });

  it("reloads task board data once when an external reload request is received", async () => {
    render(<FloatingCard />);

    await waitFor(() => expect(screen.getAllByText("整理票据").length).toBeGreaterThan(0));
    expect(apiMock.tasks).toHaveBeenCalledTimes(1);

    apiMock.tasks.mockResolvedValueOnce({ tasks: [taskWith({ title: "标签刷新后的任务" })] });
    apiMock.tags.mockResolvedValueOnce({ tags: tagOptions });
    apiMock.getThemePreference.mockResolvedValueOnce(titlePreference);

    await act(async () => {
      window.dispatchEvent(new CustomEvent(desktopSyncBrowserEventName, {
        detail: {
          sourceId: "main-window",
          type: "task-board:reload-requested"
        }
      }));
    });

    await waitFor(() => expect(screen.getAllByText("标签刷新后的任务").length).toBeGreaterThan(0));
    expect(apiMock.tasks).toHaveBeenCalledTimes(2);
  });

  it("emits task upsert events after changing task status from the floating card", async () => {
    apiMock.updateTask.mockResolvedValue({
      task: taskWith({
        status: "COMPLETED",
        completedAt: "2026-06-14T12:00:00.000Z"
      })
    });
    const rawListener = vi.fn();
    window.addEventListener(desktopSyncBrowserEventName, rawListener);
    render(<FloatingCard />);

    fireEvent.click(await screen.findByRole("checkbox", { name: "完成" }));

    await waitFor(() => expect(rawListener).toHaveBeenCalledWith(expect.objectContaining({
      detail: expect.objectContaining({
        task: expect.objectContaining({
          id: "task-1",
          status: "COMPLETED"
        }),
        type: "task:upserted"
      })
    })));

    window.removeEventListener(desktopSyncBrowserEventName, rawListener);
  });
});
