import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CalendarResponse } from "@todo/shared";
import { CalendarView } from "./CalendarView";

const apiMock = vi.hoisted(() => ({
  calendar: vi.fn(),
  completeOccurrence: vi.fn()
}));

vi.mock("../api/client", () => ({
  api: apiMock
}));

vi.mock("animal-island-ui", () => ({
  Button: ({ children, className, disabled, icon, onClick, title, type, ...props }: any) => (
    <button
      aria-label={props["aria-label"]}
      className={className}
      data-kind={type}
      disabled={disabled}
      title={title}
      type="button"
      onClick={onClick}
    >
      {icon}
      {children}
    </button>
  ),
  Card: ({ children, className, pattern, style }: any) => <section className={className} data-pattern={pattern} style={style}>{children}</section>
}));

const calendarPayload: CalendarResponse = {
  view: "month",
  occurrences: [
    {
      id: "task-1:2026-06-25",
      taskId: "task-1",
      title: "整理计划",
      date: "2026-06-25T10:00:00.000Z",
      dueAt: "2026-06-25T10:00:00.000Z",
      status: "TODO",
      priority: "IMPORTANT_NOT_URGENT",
      isRecurring: false,
      exceptionStatus: null,
      task: {
        id: "task-1",
        title: "整理计划",
        notes: null,
        dueAt: "2026-06-25T10:00:00.000Z",
        priority: "IMPORTANT_NOT_URGENT",
        status: "TODO",
        sortOrder: null,
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
        completedAt: null,
        recurrenceRule: null,
        tags: [],
        pomodoroCompletedCount: 0,
        pomodoroCompletedMinutes: 0
      }
    }
  ],
  habitCheckIns: [
    {
      id: "check-1",
      habitId: "habit-1",
      date: "2026-06-25",
      title: "学习日语",
      icon: "BookOpen",
      color: "mint",
      sortOrder: 1000
    }
  ]
};

describe("CalendarView", () => {
  const originalTimezone = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = "Asia/Shanghai";
  });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-25T12:00:00.000Z"));
    vi.clearAllMocks();
    apiMock.calendar.mockResolvedValue(calendarPayload);
    apiMock.completeOccurrence.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(() => {
    process.env.TZ = originalTimezone;
  });

  it("renders checked-in habit icons in the fixed day strip with title tooltip", async () => {
    render(<CalendarView onChanged={vi.fn()} />);

    await waitFor(() => expect(apiMock.calendar).toHaveBeenCalled());
    expect(screen.getByText("整理计划")).toBeInTheDocument();

    const habitIcon = screen.getByLabelText("习惯打卡：学习日语");
    expect(habitIcon).toHaveClass("calendar-habit-icon", "color-mint");
    expect(habitIcon.closest(".calendar-cell")).toHaveClass("has-habits");
    expect(habitIcon).toHaveAttribute("title", "学习日语");
    expect(screen.queryByText("学习日语")).not.toBeInTheDocument();

    fireEvent.mouseEnter(habitIcon.closest(".calendar-habit-tooltip")!);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("学习日语");
  });

  it("does not render an empty habit strip when the day has no habit check-ins", async () => {
    apiMock.calendar.mockResolvedValue({ ...calendarPayload, habitCheckIns: [] });

    const { container } = render(<CalendarView onChanged={vi.fn()} />);

    await waitFor(() => expect(apiMock.calendar).toHaveBeenCalled());
    expect(container.querySelector(".calendar-habit-strip")).not.toBeInTheDocument();
    expect(container.querySelector(".calendar-cell.has-habits")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/习惯打卡：/)).not.toBeInTheDocument();
  });

  it("keeps a Beijing today deadline in today's calendar cell", async () => {
    const baseOccurrence = calendarPayload.occurrences[0]!;
    vi.setSystemTime(new Date("2026-06-26T04:00:00.000Z"));
    apiMock.calendar.mockResolvedValue({
      ...calendarPayload,
      occurrences: [
        {
          ...baseOccurrence,
          id: "task-1:2026-06-26",
          title: "今日截止",
          date: "2026-06-26T15:59:00.000Z",
          dueAt: "2026-06-26T15:59:00.000Z",
          task: {
            ...baseOccurrence.task,
            title: "今日截止",
            dueAt: "2026-06-26T15:59:00.000Z"
          }
        }
      ],
      habitCheckIns: []
    });

    render(<CalendarView onChanged={vi.fn()} />);

    await waitFor(() => expect(apiMock.calendar).toHaveBeenCalled());
    const taskCell = screen.getByText("今日截止").closest(".calendar-cell");
    expect(taskCell?.querySelector(".calendar-date-number")).toHaveTextContent("26");
  });

  it("renders task hover popovers outside the calendar card to avoid clipping", async () => {
    const { container } = render(<CalendarView onChanged={vi.fn()} />);

    await waitFor(() => expect(apiMock.calendar).toHaveBeenCalled());
    fireEvent.mouseEnter(screen.getByText("整理计划").closest(".calendar-task-tooltip")!);

    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent("整理计划");
    expect(tooltip).toHaveTextContent("未开始");
    expect(tooltip.closest(".calendar-cell")).toBeNull();
    expect(container.querySelector(".calendar-cell")?.contains(tooltip)).toBe(false);
  });
});
