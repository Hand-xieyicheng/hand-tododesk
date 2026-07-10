import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toLocalDateKey, type ApiHabit, type ApiHabitDetail } from "@todo/shared";
import { desktopSyncBrowserEventName } from "../lib/desktopSync";
import { HabitPanel } from "./HabitPanel";

const apiMock = vi.hoisted(() => ({
  cancelHabitCheckIn: vi.fn(),
  checkInHabit: vi.fn(),
  createHabit: vi.fn(),
  deleteHabit: vi.fn(),
  habitDetail: vi.fn(),
  habits: vi.fn(),
  updateHabit: vi.fn(),
  updateHabitOrder: vi.fn()
}));

vi.mock("@dnd-kit/core", () => ({
  closestCenter: vi.fn(),
  DndContext: ({ children, onDragEnd }: any) => (
    <div data-testid="habit-dnd-context">
      {children}
      <button
        aria-label="模拟习惯排序"
        type="button"
        onClick={() => onDragEnd({ active: { id: "habit-2" }, over: { id: "habit-1" } })}
      />
    </div>
  ),
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  useSensor: vi.fn((sensor, options) => ({ options, sensor })),
  useSensors: vi.fn((...sensors) => sensors)
}));

vi.mock("@dnd-kit/sortable", () => ({
  arrayMove: (items: unknown[], oldIndex: number, newIndex: number) => {
    const nextItems = [...items];
    const [item] = nextItems.splice(oldIndex, 1);
    nextItems.splice(newIndex, 0, item);
    return nextItems;
  },
  rectSortingStrategy: {},
  SortableContext: ({ children }: any) => <>{children}</>,
  sortableKeyboardCoordinates: vi.fn(),
  useSortable: ({ id }: any) => ({
    attributes: { "data-sortable-id": id },
    isDragging: false,
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined
  })
}));

vi.mock("@dnd-kit/utilities", () => ({
  CSS: {
    Transform: {
      toString: () => undefined
    }
  }
}));

vi.mock("../api/client", () => ({
  api: apiMock
}));

vi.mock("animal-island-ui", () => ({
  Button: ({ children, danger, disabled, htmlType, icon, loading, onClick, title, type, ...props }: any) => (
    <button
      aria-label={props["aria-label"]}
      data-danger={danger ? "true" : undefined}
      data-kind={type}
      disabled={disabled || loading}
      title={title}
      type={htmlType ?? "button"}
      onClick={onClick}
    >
      {icon}
      {children}
    </button>
  ),
  Card: ({ children, className, pattern, type, ...props }: any) => <section className={className} {...props}>{children}</section>,
  Input: ({ maxLength, min, onChange, required, type = "text", value }: any) => (
    <input maxLength={maxLength} min={min} required={required} type={type} value={value} onChange={onChange} />
  ),
  Modal: ({ children, onClose, open, title }: any) => (
    open ? (
      <div aria-label={typeof title === "string" ? title : undefined} role="dialog">
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

const today = toLocalDateKey();

const habit: ApiHabit = {
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
    monthCheckIns: 2,
    monthPlanned: 4,
    monthCompletionRate: 50,
    totalCheckIns: 13,
    currentStreak: 3,
    currentStreakUnit: "天"
  }
};

const detail: ApiHabitDetail = {
  habit,
  month: today.slice(0, 7),
  stats: habit.stats,
  calendarDays: [
    {
      date: today,
      day: Number(today.slice(-2)),
      planned: true,
      checked: true,
      future: false,
      note: null,
      checkInId: null
    }
  ],
  logs: [
    {
      id: "log-1",
      date: today,
      note: "完成一课",
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z"
    }
  ]
};

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

function getHabitListTitle(container: HTMLElement, title: string) {
  return within(container.querySelector(".habit-list") as HTMLElement).getByText(title);
}

function selectHabitFromList(container: HTMLElement, title = habit.title) {
  fireEvent.click(getHabitListTitle(container, title));
}

describe("HabitPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.habits.mockResolvedValue({ habits: [habit] });
    apiMock.habitDetail.mockResolvedValue(detail);
    apiMock.checkInHabit.mockResolvedValue({ checkIn: null });
    apiMock.cancelHabitCheckIn.mockResolvedValue(undefined);
    apiMock.deleteHabit.mockResolvedValue(undefined);
    apiMock.updateHabitOrder.mockResolvedValue({ ok: true });
  });

  it("renders create modal with icon picker and frequency controls", () => {
    render(<HabitPanel createOpen showArchived={false} onCreateOpenChange={vi.fn()} />);

    expect(screen.getByRole("dialog", { name: "新建习惯" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "习惯图标 BookOpen" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "更多图标", expanded: false }));
    expect(screen.getByLabelText("搜索习惯图标")).toBeInTheDocument();
    expect(screen.getByText("频率")).toBeInTheDocument();
    expect(screen.getByText("主题颜色")).toBeInTheDocument();
  });

  it("uses Ant Design date pickers and submits an empty end date as open-ended", async () => {
    apiMock.createHabit.mockResolvedValue({ habit });
    render(<HabitPanel createOpen showArchived={false} onCreateOpenChange={vi.fn()} />);

    expect(document.querySelectorAll(".habit-date-picker.ant-picker")).toHaveLength(2);
    expect(screen.getByLabelText("结束日期")).toHaveValue("");
    expect(screen.getByLabelText("结束日期")).toHaveAttribute("placeholder", "无期限");

    fireEvent.change(screen.getByLabelText("习惯名称"), { target: { value: "读书" } });
    fireEvent.click(screen.getByRole("button", { name: "添加" }));

    await waitFor(() => expect(apiMock.createHabit).toHaveBeenCalledWith(expect.objectContaining({
      title: "读书",
      startDate: today,
      endDate: null
    })));
  });

  it("opens on the habit card collection and loads detail only after a card is selected", async () => {
    const { container } = render(<HabitPanel createOpen={false} showArchived={false} onCreateOpenChange={vi.fn()} />);

    await waitFor(() => expect(apiMock.habits).toHaveBeenCalledWith(false));
    await waitFor(() => expect(getHabitListTitle(container, "学习日语")).toBeInTheDocument());

    expect(apiMock.habitDetail).not.toHaveBeenCalled();
    expect(screen.queryByText("月完成率")).not.toBeInTheDocument();
    expect(container.querySelector(".habit-panel")).toHaveClass("is-collection");

    selectHabitFromList(container, "学习日语");

    await waitFor(() => expect(apiMock.habitDetail).toHaveBeenCalledWith("habit-1", today.slice(0, 7)));
    expect(await screen.findByText("月完成率")).toBeInTheDocument();
    expect(container.querySelector(".habit-panel")).toHaveClass("is-detail");
  });

  it("shows a centered no-data image when there are no habits", async () => {
    apiMock.habits.mockResolvedValue({ habits: [] });

    const { container } = render(<HabitPanel createOpen={false} showArchived={false} onCreateOpenChange={vi.fn()} />);

    await waitFor(() => expect(apiMock.habits).toHaveBeenCalledWith(false));

    const placeholder = screen.getByAltText("暂无数据");
    expect(container.querySelector(".habit-list .no-data-placeholder img")).toBe(placeholder);
    expect(container.querySelector(".habit-empty-placeholder img")).toBe(placeholder);
    expect(container.querySelector(".habit-panel")).toHaveClass("is-empty");
    expect(container.querySelector(".habit-list")).toHaveClass("is-empty");
    expect(placeholder).toHaveClass("no-data-placeholder-image");
    expect(placeholder).toHaveStyle({ opacity: "0.5" });
  });

  it("stagger-animates habit cards from the right when page animation is enabled", async () => {
    const secondHabit: ApiHabit = { ...habit, id: "habit-2", title: "喝水记录", color: "blue", icon: "Droplets" };
    apiMock.habits.mockResolvedValue({ habits: [habit, secondHabit] });

    const { container } = render(<HabitPanel createOpen={false} pageAnimationEnabled showArchived={false} onCreateOpenChange={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("喝水记录")).toBeInTheDocument());
    const cards = Array.from(container.querySelectorAll<HTMLElement>(".habit-list-card"));
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveClass("page-motion-card", "page-motion-from-right");
    expect(cards[0]?.style.getPropertyValue("--page-motion-delay")).toBe("0ms");
    expect(cards[1]).toHaveClass("page-motion-card", "page-motion-from-right");
    expect(cards[1]?.style.getPropertyValue("--page-motion-delay")).toBe("100ms");
  });

  it("removes habit card animation hooks when page animation is disabled", async () => {
    const { container } = render(<HabitPanel createOpen={false} pageAnimationEnabled={false} showArchived={false} onCreateOpenChange={vi.fn()} />);

    await waitFor(() => expect(getHabitListTitle(container, "学习日语")).toBeInTheDocument());
    const card = container.querySelector(".habit-list-card");
    expect(card).not.toHaveClass("page-motion-card");
    expect((card as HTMLElement).style.getPropertyValue("--page-motion-delay")).toBe("");
  });

  it("returns to the habit card collection when the parent sends a list return signal", async () => {
    const { container, rerender } = render(
      <HabitPanel createOpen={false} returnToListSignal={0} showArchived={false} onCreateOpenChange={vi.fn()} />
    );

    await waitFor(() => expect(getHabitListTitle(container, "学习日语")).toBeInTheDocument());
    selectHabitFromList(container, "学习日语");

    await waitFor(() => expect(container.querySelector(".habit-panel")).toHaveClass("is-detail"));
    expect(screen.getByText("月完成率")).toBeInTheDocument();

    rerender(
      <HabitPanel createOpen={false} returnToListSignal={1} showArchived={false} onCreateOpenChange={vi.fn()} />
    );

    await waitFor(() => expect(container.querySelector(".habit-panel")).toHaveClass("is-collection"));
    expect(screen.queryByText("月完成率")).not.toBeInTheDocument();
  });

  it("renders detail stats, calendar, logs, and checks in today", async () => {
    const rawListener = vi.fn();
    window.addEventListener(desktopSyncBrowserEventName, rawListener);
    const { container } = render(<HabitPanel createOpen={false} showArchived={false} onCreateOpenChange={vi.fn()} />);

    try {
      await waitFor(() => expect(apiMock.habits).toHaveBeenCalledWith(false));
      await waitFor(() => expect(getHabitListTitle(container, "学习日语")).toBeInTheDocument());
      selectHabitFromList(container, "学习日语");

      await waitFor(() => expect(screen.getByText("月完成率")).toBeInTheDocument());
      expect(screen.getByText("记录日志")).toBeInTheDocument();
      expect(screen.getByText("完成一课")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: `${today}已打卡` }).querySelector(".lucide-book-open")).not.toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "今日学习日语打卡" }));

      await waitFor(() => expect(apiMock.checkInHabit).toHaveBeenCalledWith("habit-1", today));
      await waitFor(() => expect(rawListener).toHaveBeenCalledWith(expect.objectContaining({
        detail: expect.objectContaining({
          type: "habit-board:reload-requested"
        })
      })));
    } finally {
      window.removeEventListener(desktopSyncBrowserEventName, rawListener);
    }
  });

  it("renders semantic tooltips for detail action icons", async () => {
    const { container } = render(<HabitPanel createOpen={false} showArchived={false} onCreateOpenChange={vi.fn()} />);

    await waitFor(() => expect(getHabitListTitle(container, "学习日语")).toBeInTheDocument());
    selectHabitFromList(container, "学习日语");
    await waitFor(() => expect(screen.getByText("月完成率")).toBeInTheDocument());

    const detailActions = container.querySelector(".habit-detail-actions");
    expect(detailActions).not.toBeNull();
    expect(within(detailActions as HTMLElement).getByRole("button", { name: "编辑" })).toBeInTheDocument();
    const archiveButton = within(detailActions as HTMLElement).getByRole("button", { name: "归档" });
    expect(archiveButton.querySelector(".lucide-archive")).not.toBeNull();
    expect(archiveButton.querySelector(".lucide-rotate-ccw")).toBeNull();
    expect(within(detailActions as HTMLElement).getByRole("button", { name: "删除" })).toBeInTheDocument();
    expect(within(detailActions as HTMLElement).getByText("编辑")).toHaveAttribute("role", "tooltip");
    expect(within(detailActions as HTMLElement).getByText("归档")).toHaveAttribute("role", "tooltip");
    expect(within(detailActions as HTMLElement).getByText("删除")).toHaveAttribute("role", "tooltip");
  });

  it("selects a habit when clicking anywhere on its sidebar card body", async () => {
    const secondHabit: ApiHabit = { ...habit, id: "habit-2", title: "喝水记录", color: "blue", icon: "Droplets" };
    const secondDetail: ApiHabitDetail = { ...detail, habit: secondHabit, stats: secondHabit.stats };
    apiMock.habits.mockResolvedValue({ habits: [habit, secondHabit] });
    apiMock.habitDetail.mockImplementation((habitId: string) => Promise.resolve(habitId === secondHabit.id ? secondDetail : detail));
    const { container } = render(<HabitPanel createOpen={false} showArchived={false} onCreateOpenChange={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("喝水记录")).toBeInTheDocument());

    const secondCard = Array.from(container.querySelectorAll(".habit-list-card"))
      .find((card) => card.textContent?.includes("喝水记录"));
    const secondStats = secondCard?.querySelector(".habit-card-stats");
    expect(secondStats).not.toBeNull();

    fireEvent.click(secondStats!);

    await waitFor(() => expect(apiMock.habitDetail).toHaveBeenLastCalledWith("habit-2", today.slice(0, 7)));
  });

  it("reorders habit sidebar cards by drag and persists the user order", async () => {
    const secondHabit: ApiHabit = {
      ...habit,
      id: "habit-2",
      title: "喝水记录",
      color: "blue",
      icon: "Droplets",
      sortOrder: 2000,
      createdAt: "2026-06-02T00:00:00.000Z"
    };
    const secondDetail: ApiHabitDetail = { ...detail, habit: secondHabit, stats: secondHabit.stats };
    apiMock.habits.mockResolvedValue({ habits: [habit, secondHabit] });
    apiMock.habitDetail.mockImplementation((habitId: string) => Promise.resolve(habitId === secondHabit.id ? secondDetail : detail));

    const { container } = render(<HabitPanel createOpen={false} showArchived={false} onCreateOpenChange={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("喝水记录")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "模拟习惯排序" }));

    await waitFor(() => expect(apiMock.updateHabitOrder).toHaveBeenCalledWith({ orderedIds: ["habit-2", "habit-1"] }));
    expect(Array.from(container.querySelectorAll(".habit-list-card strong")).map((item) => item.textContent)).toEqual([
      "喝水记录",
      "学习日语"
    ]);
  });

  it("keeps habit list content in place while a list refresh is pending", async () => {
    const { container } = render(<HabitPanel createOpen={false} showArchived={false} onCreateOpenChange={vi.fn()} />);

    await waitFor(() => expect(getHabitListTitle(container, "学习日语")).toBeInTheDocument());

    const refresh = createDeferred<{ habits: ApiHabit[] }>();
    apiMock.habits.mockReturnValueOnce(refresh.promise);

    fireEvent.click(screen.getByRole("button", { name: "今日学习日语打卡" }));

    await waitFor(() => expect(apiMock.habits).toHaveBeenCalledTimes(2));

    expect(screen.getAllByText("学习日语").length).toBeGreaterThan(0);
    expect(container.querySelector(".habit-list-panel > .inline-muted")).not.toBeInTheDocument();
    expect(container.querySelector(".habit-list .query-loading-indicator")).not.toBeInTheDocument();
    expect(screen.queryByText("加载中...")).not.toBeInTheDocument();

    refresh.resolve({ habits: [{ ...habit, todayChecked: true }] });
    await waitFor(() => expect(screen.getByRole("button", { name: "取消今日学习日语打卡" })).toBeInTheDocument());
    expect(apiMock.habitDetail).not.toHaveBeenCalled();
    expect(container.querySelector(".habit-panel")).toHaveClass("is-collection");
  });

  it("reloads habit list when an external habit board refresh event is received", async () => {
    const { container } = render(<HabitPanel createOpen={false} showArchived={false} onCreateOpenChange={vi.fn()} />);

    await waitFor(() => expect(getHabitListTitle(container, "学习日语")).toBeInTheDocument());
    apiMock.habits.mockResolvedValueOnce({ habits: [{ ...habit, title: "刷新后的习惯" }] });

    window.dispatchEvent(new CustomEvent(desktopSyncBrowserEventName, {
      detail: {
        sourceId: "floating-card",
        type: "habit-board:reload-requested"
      }
    }));

    await waitFor(() => expect(apiMock.habits).toHaveBeenCalledTimes(2));
    expect(getHabitListTitle(container, "刷新后的习惯")).toBeInTheDocument();
  });

  it("reloads the habit list when the refresh signal changes", async () => {
    const { container, rerender } = render(
      <HabitPanel createOpen={false} refreshSignal={0} showArchived={false} onCreateOpenChange={vi.fn()} />
    );

    await waitFor(() => expect(getHabitListTitle(container, "学习日语")).toBeInTheDocument());
    apiMock.habits.mockResolvedValueOnce({ habits: [{ ...habit, title: "AI 新建习惯" }] });

    rerender(<HabitPanel createOpen={false} refreshSignal={1} showArchived={false} onCreateOpenChange={vi.fn()} />);

    await waitFor(() => expect(apiMock.habits).toHaveBeenCalledTimes(2));
    expect(getHabitListTitle(container, "AI 新建习惯")).toBeInTheDocument();
  });

  it("keeps habit detail content in place while detail refresh is pending", async () => {
    const { container } = render(<HabitPanel createOpen={false} showArchived={false} onCreateOpenChange={vi.fn()} />);

    await waitFor(() => expect(getHabitListTitle(container, "学习日语")).toBeInTheDocument());
    selectHabitFromList(container, "学习日语");
    await waitFor(() => expect(screen.getByText("月完成率")).toBeInTheDocument());

    const refresh = createDeferred<ApiHabitDetail>();
    apiMock.habitDetail.mockReturnValueOnce(refresh.promise);

    fireEvent.click(screen.getByRole("button", { name: "下月" }));

    await waitFor(() => expect(apiMock.habitDetail).toHaveBeenCalledTimes(2));

    expect(screen.getByText("月完成率")).toBeInTheDocument();
    expect(container.querySelector(".habit-detail-panel > .inline-muted")).not.toBeInTheDocument();
    expect(container.querySelector(".habit-detail-panel .query-loading-indicator")).not.toBeInTheDocument();
    expect(screen.queryByText("详情加载中...")).not.toBeInTheDocument();

    refresh.resolve(detail);
    await waitFor(() => expect(apiMock.habitDetail).toHaveBeenCalledTimes(2));
  });

  it("confirms before permanently deleting a habit without browser confirm", async () => {
    const coffeeHabit: ApiHabit = { ...habit, title: "Coffee Time", icon: "Coffee" };
    apiMock.habits.mockResolvedValue({ habits: [coffeeHabit] });
    apiMock.habitDetail.mockResolvedValue({ ...detail, habit: coffeeHabit, stats: coffeeHabit.stats });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    try {
      render(<HabitPanel createOpen={false} showArchived={false} onCreateOpenChange={vi.fn()} />);

      await waitFor(() => expect(screen.getByRole("button", { name: "Coffee Time 每天" })).toBeInTheDocument());
      fireEvent.click(screen.getByRole("button", { name: "Coffee Time 每天" }));
      await waitFor(() => expect(screen.getByRole("button", { name: "删除" })).toBeInTheDocument());

      fireEvent.click(screen.getByRole("button", { name: "删除" }));

      expect(confirmSpy).not.toHaveBeenCalled();
      const dialog = await screen.findByRole("dialog", { name: "删除习惯" });
      expect(dialog).toHaveTextContent("永久删除「Coffee Time」及所有打卡记录？");
      expect(apiMock.deleteHabit).not.toHaveBeenCalled();

      fireEvent.click(within(dialog).getByRole("button", { name: "删除" }));

      await waitFor(() => expect(apiMock.deleteHabit).toHaveBeenCalledWith("habit-1"));
    } finally {
      confirmSpy.mockRestore();
    }
  });
});
