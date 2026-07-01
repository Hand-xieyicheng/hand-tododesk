import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiAnniversaryEvent } from "@todo/shared";
import { AnniversaryPanel } from "./AnniversaryPanel";

const apiMock = vi.hoisted(() => ({
  anniversaries: vi.fn(),
  createAnniversary: vi.fn(),
  deleteAnniversary: vi.fn(),
  updateAnniversary: vi.fn(),
  updateAnniversaryOrder: vi.fn()
}));

vi.mock("animal-island-ui", () => ({
  Button: ({ children, danger, disabled, htmlType, icon, loading, onClick, type, ...props }: any) => (
    <button
      aria-label={props["aria-label"]}
      aria-pressed={props["aria-pressed"]}
      className={props.className}
      data-danger={danger ? "true" : undefined}
      data-loading={loading ? "true" : undefined}
      data-variant={type}
      disabled={disabled}
      type={htmlType ?? "button"}
      onClick={onClick}
    >
      {icon}
      {children}
    </button>
  ),
  Card: ({ children, className }: any) => <section className={className}>{children}</section>,
  Input: ({ maxLength, onChange, required, type = "text", value }: any) => (
    <input maxLength={maxLength} required={required} type={type} value={value} onChange={onChange} />
  ),
  Modal: ({ children, onClose, open, title }: any) => (
    open ? (
      <div aria-label={typeof title === "string" ? title : undefined} role="dialog">
        <button aria-label="关闭" type="button" onClick={onClose}>关闭</button>
        {children}
      </div>
    ) : null
  ),
  Select: ({ onChange, options, value, ...props }: any) => (
    <select aria-label={props["aria-label"]} value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map((option: any) => {
        const optionValue = option.value ?? option.key;
        return <option key={optionValue} value={optionValue}>{option.label}</option>;
      })}
    </select>
  )
}));

vi.mock("../api/client", () => ({
  api: apiMock
}));

function anniversaryWith(patch: Partial<ApiAnniversaryEvent>): ApiAnniversaryEvent {
  return {
    id: "anniversary-1",
    title: "使用滴答清单",
    notes: null,
    category: "ANNIVERSARY",
    date: "2019-12-09",
    repeat: "NONE",
    direction: "AUTO",
    cardStyle: "lavender",
    calendarType: "SOLAR",
    lunarMonth: null,
    lunarDay: null,
    solarTerm: null,
    sortOrder: 1000,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    displayDirection: "ELAPSED",
    displayDate: "2019-12-09",
    displayValue: "6年6月9天",
    displaySubtext: "距离 2019/12/9 已经",
    daysDelta: -2383,
    ...patch
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

describe("AnniversaryPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.anniversaries.mockResolvedValue({ anniversaries: [] });
    apiMock.createAnniversary.mockResolvedValue({ anniversary: anniversaryWith({}) });
    apiMock.updateAnniversary.mockResolvedValue({ anniversary: anniversaryWith({}) });
    apiMock.updateAnniversaryOrder.mockResolvedValue({ ok: true });
    apiMock.deleteAnniversary.mockResolvedValue(undefined);
  });

  it("shows a centered no-data image when there are no anniversaries", async () => {
    const { container } = render(<AnniversaryPanel createOpen={false} onCreateOpenChange={vi.fn()} />);

    await waitFor(() => expect(apiMock.anniversaries).toHaveBeenCalled());

    const placeholder = screen.getByAltText("暂无数据");
    expect(container.querySelector(".anniversary-grid .no-data-placeholder img")).toBe(placeholder);
    expect(container.querySelector(".anniversary-empty-placeholder img")).toBe(placeholder);
    expect(container.querySelector(".anniversary-panel")).toHaveClass("is-empty");
    expect(container.querySelector(".anniversary-grid")).toHaveClass("is-empty");
    expect(placeholder).toHaveClass("no-data-placeholder-image");
    expect(placeholder).toHaveStyle({ opacity: "0.5" });
  });

  it("filters cards by category tabs", async () => {
    apiMock.anniversaries.mockResolvedValue({
      anniversaries: [
        anniversaryWith({ id: "a-1", title: "使用滴答清单", category: "ANNIVERSARY" }),
        anniversaryWith({ id: "b-1", title: "小林生日", category: "BIRTHDAY", displayValue: "今天", displaySubtext: "2026/6/18 就是今天" })
      ]
    });

    render(<AnniversaryPanel createOpen={false} onCreateOpenChange={vi.fn()} />);

    expect(await screen.findByRole("heading", { name: "使用滴答清单" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "小林生日" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "生日" }));

    expect(screen.queryByRole("heading", { name: "使用滴答清单" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "小林生日" })).toBeInTheDocument();
  });

  it("keeps anniversary cards in place while refresh is pending", async () => {
    apiMock.anniversaries.mockResolvedValue({
      anniversaries: [anniversaryWith({ id: "a-1", title: "使用滴答清单", category: "ANNIVERSARY" })]
    });
    const { container } = render(<AnniversaryPanel createOpen={false} onCreateOpenChange={vi.fn()} />);

    expect(await screen.findByRole("heading", { name: "使用滴答清单" })).toBeInTheDocument();

    const refresh = createDeferred<{ anniversaries: ApiAnniversaryEvent[] }>();
    apiMock.anniversaries.mockReturnValueOnce(refresh.promise);

    fireEvent.click(screen.getByRole("button", { name: "删除使用滴答清单" }));

    await waitFor(() => expect(apiMock.anniversaries).toHaveBeenCalledTimes(2));

    expect(screen.getByRole("heading", { name: "使用滴答清单" })).toBeInTheDocument();
    expect(container.querySelector(".anniversary-panel > .inline-muted")).not.toBeInTheDocument();
    expect(container.querySelector(".anniversary-grid .query-loading-indicator")).not.toBeInTheDocument();
    expect(screen.queryByText("加载中...")).not.toBeInTheDocument();

    refresh.resolve({ anniversaries: [] });
    await waitFor(() => expect(screen.queryByRole("heading", { name: "使用滴答清单" })).not.toBeInTheDocument());
  });

  it("fills the Spring Festival template before creating", async () => {
    render(<AnniversaryPanel createOpen onCreateOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("分类"), { target: { value: "HOLIDAY" } });
    fireEvent.change(screen.getByLabelText("节日模板"), { target: { value: "spring-festival" } });
    fireEvent.click(screen.getByRole("button", { name: "添加" }));

    await waitFor(() => expect(apiMock.createAnniversary).toHaveBeenCalledWith(expect.objectContaining({
      title: "春节",
      category: "HOLIDAY",
      repeat: "YEARLY",
      direction: "COUNTDOWN",
      cardStyle: "rose",
      calendarType: "LUNAR",
      lunarMonth: 1,
      lunarDay: 1
    })));
  });

  it("creates a birthday with lunar calendar fields", async () => {
    render(<AnniversaryPanel createOpen onCreateOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "农历生日" } });
    fireEvent.change(screen.getByLabelText("分类"), { target: { value: "BIRTHDAY" } });
    fireEvent.change(screen.getByLabelText("日期"), { target: { value: "2020-07-07" } });
    fireEvent.change(screen.getByLabelText("重复"), { target: { value: "YEARLY" } });
    fireEvent.change(screen.getByLabelText("方向"), { target: { value: "COUNTDOWN" } });
    fireEvent.change(screen.getByLabelText("历法"), { target: { value: "LUNAR" } });
    fireEvent.change(screen.getByLabelText("阴历月份"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("阴历日期"), { target: { value: "17" } });
    fireEvent.click(screen.getByRole("button", { name: "添加" }));

    await waitFor(() => expect(apiMock.createAnniversary).toHaveBeenCalledWith(expect.objectContaining({
      title: "农历生日",
      category: "BIRTHDAY",
      repeat: "YEARLY",
      direction: "COUNTDOWN",
      calendarType: "LUNAR",
      lunarMonth: 5,
      lunarDay: 17,
      solarTerm: null
    })));
  });

  it("renders today, countdown, and elapsed card states", async () => {
    apiMock.anniversaries.mockResolvedValue({
      anniversaries: [
        anniversaryWith({ id: "today", title: "今天生日", category: "BIRTHDAY", displayValue: "今天", displaySubtext: "2026/6/18 就是今天", daysDelta: 0 }),
        anniversaryWith({ id: "future", title: "周末", category: "COUNTDOWN", displayDirection: "COUNTDOWN", displayValue: "2天", displaySubtext: "距离 2026/6/20 还有", daysDelta: 2 }),
        anniversaryWith({ id: "past", title: "使用滴答清单" })
      ]
    });

    render(<AnniversaryPanel createOpen={false} onCreateOpenChange={vi.fn()} />);

    expect(await screen.findAllByText("今天")).toHaveLength(2);
    expect(screen.getByText("2天")).toBeInTheDocument();
    expect(screen.getByText("6年6月9天")).toBeInTheDocument();
    expect(screen.getByText("倒数")).toBeInTheDocument();
    expect(screen.getByText("正数")).toBeInTheDocument();

    const todayCard = screen.getByRole("heading", { name: "今天生日" }).closest(".anniversary-card");
    const futureCard = screen.getByRole("heading", { name: "周末" }).closest(".anniversary-card");
    const pastCard = screen.getByRole("heading", { name: "使用滴答清单" }).closest(".anniversary-card");

    expect(todayCard).toHaveClass("is-today");
    expect(futureCard).not.toHaveClass("is-today");
    expect(pastCard).not.toHaveClass("is-today");
  });
});
