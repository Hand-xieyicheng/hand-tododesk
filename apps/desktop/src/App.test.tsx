import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ApiThemePreference } from "@todo/shared";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { api } from "./api/client";

vi.mock("animal-island-ui", async () => {
  const React = await import("react");
  return {
    Button: ({ block: _block, children, className, icon, type: _type, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { block?: boolean; icon?: React.ReactNode; type?: string }) => (
      <button className={className} {...props}>
        {icon}
        {children}
      </button>
    ),
    Footer: () => <div />,
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
  PrintShareDialog: ({ open, source }: any) => open ? <div role="dialog" aria-label="便签打印">{source.tagFilter}:{String(source.showCompletedTasks)}:{source.viewMode}</div> : null
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
  appCloseBehavior: "hide",
  displaySize: "default",
  visibleSidebarModules: ["tasks", "memos", "anniversaries", "habits", "calendar", "pomodoro"],
  sidebarCollapsed: false,
  fontFamily: "system"
};

describe("App sidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    expect(await screen.findByRole("dialog", { name: "便签打印" })).toHaveTextContent("__all__:true:list");
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

    expect(await screen.findByRole("dialog", { name: "便签打印" })).toHaveTextContent("__all__:true:kanban");
  });
});
