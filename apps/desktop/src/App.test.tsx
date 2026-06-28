import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ApiTask, ApiThemePreference } from "@todo/shared";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { api, authSessionExpiredEvent } from "./api/client";

vi.mock("animal-island-ui", async () => {
  const React = await import("react");
  return {
    Button: ({ block: _block, children, className, htmlType, icon, loading: _loading, type: _type, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { block?: boolean; htmlType?: React.ButtonHTMLAttributes<HTMLButtonElement>["type"]; icon?: React.ReactNode; loading?: boolean; type?: string }) => (
      <button className={className} type={htmlType} {...props}>
        {icon}
        {children}
      </button>
    ),
    Card: ({ children, className, pattern: _pattern, ...props }: React.HTMLAttributes<HTMLDivElement> & { pattern?: string }) => (
      <div className={className} {...props}>
        {children}
      </div>
    ),
    Divider: ({ type: _type, ...props }: React.HTMLAttributes<HTMLHRElement> & { type?: string }) => <hr {...props} />,
    Footer: () => <div />,
    Input: ({ allowClear: _allowClear, shadow: _shadow, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { allowClear?: boolean; shadow?: boolean }) => (
      <input {...props} />
    ),
    Loading: () => <div />,
    Select: ({ onChange, options = [], value }: any) => (
      <select aria-label="标签" value={value} onChange={(event) => onChange?.(event.target.value)}>
        {options.map((option: any) => (
          <option key={option.key ?? option.value} value={option.key ?? option.value}>{option.label}</option>
        ))}
      </select>
    ),
    Title: ({ children }: { children: React.ReactNode }) => <h1>{children}</h1>,
    Tooltip: ({ children, className, title }: { children: React.ReactNode; className?: string; title?: React.ReactNode }) => (
      <span className={className} data-tooltip-title={String(title ?? "")}>
        {children}
      </span>
    )
  };
});

vi.mock("./api/client", async () => {
  const actual = await vi.importActual<typeof import("./api/client")>("./api/client");
  return {
    ...actual,
    api: {
      appBootstrap: vi.fn(),
      createPrintShare: vi.fn(),
      currentUser: vi.fn(),
      getThemePreference: vi.fn(),
      logout: vi.fn(),
      setThemePreference: vi.fn(),
      tags: vi.fn(),
      tasks: vi.fn()
    }
  };
});

vi.mock("./components/AnniversaryPanel", () => ({
  AnniversaryPanel: () => <div />
}));

vi.mock("./components/CalendarView", () => ({
  CalendarView: () => <div />
}));

vi.mock("./components/HabitPanel", () => ({
  HabitPanel: () => <div />
}));

vi.mock("./components/MemoPanel", () => ({
  MemoPanel: () => <div />
}));

vi.mock("./components/PomodoroView", () => ({
  PomodoroView: () => <div />
}));

vi.mock("./components/PrintShareDialog", () => ({
  PrintShareDialog: ({ open, preview, source }: any) => open ? (
    <div role="dialog" aria-label="便签打印">
      <span data-testid="print-source">{source.tagFilter}:{String(source.showCompletedTasks)}:{source.viewMode}</span>
      <ul>
        {(preview?.tasks ?? []).map((task: ApiTask) => (
          <li key={task.id}>{task.title}</li>
        ))}
      </ul>
    </div>
  ) : null
}));

vi.mock("./components/ProfileCenter", () => ({
  ProfileCenter: () => <div />
}));

vi.mock("./components/TaskPanel", () => ({
  TaskPanel: () => <div />
}));

vi.mock("./lib/useAppUpdater", () => ({
  useAppUpdater: () => ({
    checkForUpdate: vi.fn(),
    currentVersion: "0.0.0"
  })
}));

const mockUser = {
  id: "user-1",
  email: "todo@example.com",
  name: "西西里没有温泉",
  gender: "PRIVATE",
  avatarUrl: null,
  emailVerifiedAt: null
} as const;

const mockThemePreference: ApiThemePreference = {
  themeId: "warm-paper",
  titleColor: "app-teal",
  footerVisible: true,
  footerType: "sea",
  printButtonEnabled: false,
  showCompletedTasks: true,
  taskViewMode: "list",
  taskCardDisplayMode: "full",
  floatingCardThemeId: "warm-paper",
  floatingCardViewMode: "list",
  appCloseBehavior: "hide",
  displaySize: "default",
  visibleSidebarModules: ["tasks", "memos", "anniversaries", "habits", "calendar", "pomodoro"],
  sidebarCollapsed: false,
  fontFamily: "system"
};

function createTask(overrides: Partial<ApiTask> = {}): ApiTask {
  return {
    id: "task-1",
    title: "未完成打印项",
    notes: null,
    dueAt: null,
    priority: "IMPORTANT_NOT_URGENT",
    status: "TODO",
    sortOrder: null,
    createdAt: "2026-06-28T00:00:00.000Z",
    updatedAt: "2026-06-28T00:00:00.000Z",
    completedAt: null,
    recurrenceRule: null,
    tags: [],
    pomodoroCompletedCount: 0,
    pomodoroCompletedMinutes: 0,
    ...overrides
  };
}

describe("App sidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
    localStorage.clear();
    localStorage.setItem("tododesk.user", JSON.stringify(mockUser));

    vi.mocked(api.appBootstrap).mockRejectedValue(new Error("no bootstrap"));
    vi.mocked(api.currentUser).mockResolvedValue({ user: mockUser });
    vi.mocked(api.getThemePreference).mockResolvedValue(mockThemePreference);
    vi.mocked(api.setThemePreference).mockImplementation(async (input) => ({
      ...mockThemePreference,
      ...input
    }));
    vi.mocked(api.tags).mockResolvedValue({ tags: [] });
    vi.mocked(api.tasks).mockResolvedValue({ tasks: [] });
  });

  it("opens the login screen instead of the landing page for unauthenticated desktop windows", async () => {
    Reflect.set(window, "__TAURI_INTERNALS__", {});
    localStorage.removeItem("tododesk.user");

    const { container } = render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>
    );

    await waitFor(() => expect(container.querySelector(".auth-screen")).toBeInTheDocument());
    expect(screen.getByText("记住密码")).toBeInTheDocument();
    expect(container.querySelector(".landing-page")).not.toBeInTheDocument();
  });

  it("sends expired desktop sessions to login instead of the landing page", async () => {
    Reflect.set(window, "__TAURI_INTERNALS__", {});

    const { container } = render(
      <MemoryRouter initialEntries={["/tasks"]}>
        <App />
      </MemoryRouter>
    );

    await screen.findByRole("button", { name: "收起侧边栏" });
    window.dispatchEvent(new Event(authSessionExpiredEvent));

    await waitFor(() => expect(container.querySelector(".auth-screen")).toBeInTheDocument());
    expect(container.querySelector(".landing-page")).not.toBeInTheDocument();
  });

  it("sends desktop logout to login instead of the landing page", async () => {
    Reflect.set(window, "__TAURI_INTERNALS__", {});

    const { container } = render(
      <MemoryRouter initialEntries={["/tasks"]}>
        <App />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole("button", { name: "退出登录" }));

    await waitFor(() => expect(api.logout).toHaveBeenCalled());
    await waitFor(() => expect(container.querySelector(".auth-screen")).toBeInTheDocument());
    expect(container.querySelector(".landing-page")).not.toBeInTheDocument();
  });

  it("toggles the sidebar from the logo and keeps the logo visible when collapsed", async () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/tasks"]}>
        <App />
      </MemoryRouter>
    );

    const logoToggle = screen.getByRole("button", { name: "收起侧边栏" });
    await waitFor(() => expect(localStorage.getItem("tododesk.theme")).toBe(mockThemePreference.themeId));

    expect(within(logoToggle).getByRole("img", { name: "小柴记" })).toBeInTheDocument();
    expect(logoToggle.closest(".sidebar-brand-tooltip")).not.toBeInTheDocument();
    expect(container.querySelector(".sidebar-collapse-button")).not.toBeInTheDocument();

    fireEvent.click(logoToggle);

    await waitFor(() => expect(container.querySelector(".app-shell")).toHaveClass("is-sidebar-collapsed"));

    const collapsedLogoToggle = screen.getByRole("button", { name: "展开侧边栏" });
    expect(within(collapsedLogoToggle).getByRole("img", { name: "小柴记" })).toBeInTheDocument();
  });

  it("renders the sidebar logo as inline SVG with animated facial targets", async () => {
    render(
      <MemoryRouter initialEntries={["/tasks"]}>
        <App />
      </MemoryRouter>
    );

    const logoToggle = screen.getByRole("button", { name: "收起侧边栏" });
    await waitFor(() => expect(localStorage.getItem("tododesk.theme")).toBe(mockThemePreference.themeId));

    const logo = within(logoToggle).getByRole("img", { name: "小柴记" });
    expect(logo).toHaveClass("sidebar-brand-logo");
    expect(logo).toHaveAttribute("data-logo-format", "svg");
    expect(logo.querySelector("svg")).toHaveClass("sidebar-logo-svg");
    expect(logo.querySelectorAll(".sidebar-logo-eye")).toHaveLength(2);
    expect(logo.querySelectorAll(".sidebar-logo-brow")).toHaveLength(2);
    expect(logo.querySelector(".sidebar-logo-ear-left")).toBeInTheDocument();
    expect(logo.querySelector(".sidebar-logo-ear-right")).toBeInTheDocument();
    expect(logo.querySelector(".sidebar-logo-check")).toBeInTheDocument();
  });

  it("hides task print entry by default", async () => {
    render(
      <MemoryRouter initialEntries={["/tasks"]}>
        <App />
      </MemoryRouter>
    );

    await waitFor(() => expect(localStorage.getItem("tododesk.theme")).toBe(mockThemePreference.themeId));
    expect(screen.queryByRole("button", { name: "便签打印" })).not.toBeInTheDocument();
  });

  it("shows task print entry when enabled", async () => {
    vi.mocked(api.getThemePreference).mockResolvedValue({ ...mockThemePreference, printButtonEnabled: true });
    render(
      <MemoryRouter initialEntries={["/tasks"]}>
        <App />
      </MemoryRouter>
    );

    const printButton = await screen.findByRole("button", { name: "便签打印" });
    expect(printButton).toBeInTheDocument();
    fireEvent.click(printButton);
    expect(await screen.findByTestId("print-source")).toHaveTextContent("__all__:false:list");
  });

  it("prints only incomplete tasks even when completed tasks are visible", async () => {
    vi.mocked(api.getThemePreference).mockResolvedValue({ ...mockThemePreference, printButtonEnabled: true, showCompletedTasks: true });
    vi.mocked(api.tasks).mockResolvedValue({
      tasks: [
        createTask({ id: "task-open", title: "未完成打印项", status: "TODO" }),
        createTask({ id: "task-done", title: "已完成打印项", status: "COMPLETED", completedAt: "2026-06-28T02:00:00.000Z" })
      ]
    });

    render(
      <MemoryRouter initialEntries={["/tasks"]}>
        <App />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole("button", { name: "便签打印" }));

    const printDialog = await screen.findByRole("dialog", { name: "便签打印" });
    expect(within(printDialog).getByText("未完成打印项")).toBeInTheDocument();
    expect(within(printDialog).queryByText("已完成打印项")).not.toBeInTheDocument();
    expect(screen.getByTestId("print-source")).toHaveTextContent("__all__:false:list");
  });

  it("prints all tasks in kanban after a hidden tag filter was selected", async () => {
    vi.mocked(api.getThemePreference).mockResolvedValue({ ...mockThemePreference, printButtonEnabled: true });
    vi.mocked(api.setThemePreference).mockImplementation(async (input) => ({
      ...mockThemePreference,
      printButtonEnabled: true,
      ...input
    }));
    vi.mocked(api.tags).mockResolvedValue({ tags: [{ id: "tag-1", name: "工作" }] });

    render(
      <MemoryRouter initialEntries={["/tasks"]}>
        <App />
      </MemoryRouter>
    );

    fireEvent.change(await screen.findByRole("combobox", { name: "标签" }), { target: { value: "tag-1" } });
    fireEvent.click(screen.getByRole("button", { name: "看板" }));

    await waitFor(() => expect(screen.queryByRole("combobox", { name: "标签" })).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "便签打印" }));

    expect(await screen.findByTestId("print-source")).toHaveTextContent("__all__:false:kanban");
  });
});
