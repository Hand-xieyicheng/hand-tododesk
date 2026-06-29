import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { defaultVisibleSidebarModules, type ApiUser, type AppBootstrapResponse, type SidebarModule } from "@todo/shared";
import type { AppUpdaterController } from "../lib/useAppUpdater";
import { ProfileCenter } from "./ProfileCenter";

vi.mock("animal-island-ui", () => ({
  Button: ({ children, disabled, htmlType, icon, onClick }: any) => (
    <button disabled={disabled} type={htmlType ?? "button"} onClick={onClick}>
      {icon}
      {children}
    </button>
  ),
  Card: ({ children, className }: any) => <section className={className}>{children}</section>,
  Divider: () => <hr />,
  Input: ({ autoComplete, maxLength, onChange, required, type = "text", value }: any) => (
    <input autoComplete={autoComplete} maxLength={maxLength} required={required} type={type} value={value} onChange={onChange} />
  ),
  Modal: ({ children, open, title }: any) => (
    open ? <div aria-label={typeof title === "string" ? title : undefined} role="dialog">{children}</div> : null
  ),
  Radio: ({ disabled, onChange, options, value }: any) => (
    <div>
      {options.map((option: any) => (
        <button disabled={disabled} key={option.value} type="button" onClick={() => onChange(option.value)}>
          {option.label}
          {option.value === value ? " selected" : ""}
        </button>
      ))}
    </div>
  ),
  Select: ({ onChange, options, value }: any) => (
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map((option: any) => {
        const optionValue = option.value ?? option.key;
        return (
          <option key={optionValue} value={optionValue}>
            {option.label}
          </option>
        );
      })}
    </select>
  ),
  Tabs: ({ defaultActiveKey, items }: any) => (
    <div>
      {items.find((item: any) => item.key === defaultActiveKey)?.children}
    </div>
  ),
  Title: ({ children, className }: any) => <h2 className={className}>{children}</h2>
}));

const user: ApiUser = {
  id: "user-1",
  email: "todo@example.com",
  name: "Todo User",
  gender: "PRIVATE",
  avatarUrl: null,
  emailVerifiedAt: null
};

const appBootstrap: AppBootstrapResponse = {
  apiVersion: "0.2.22",
  releaseChannel: "stable",
  desktop: {
    minimumVersion: "0.1.0",
    latestVersion: "0.2.22",
    updateEndpoint: "https://example.com/latest.json"
  },
  featureFlags: {
    calendar: true,
    pomodoro: true,
    taskQuadrant: true,
    floatingCard: true,
    anniversaries: true,
    habits: true
  }
};

const sidebarModuleOptions: Array<{ id: SidebarModule; label: string }> = [
  { id: "tasks", label: "待办事项" },
  { id: "memos", label: "备忘录" },
  { id: "anniversaries", label: "倒数纪念日" },
  { id: "habits", label: "习惯打卡" },
  { id: "calendar", label: "日历" },
  { id: "pomodoro", label: "番茄时钟" }
];

function createUpdater(status: AppUpdaterController["status"]): AppUpdaterController {
  return {
    status,
    currentVersion: "0.2.22",
    targetVersion: null,
    releaseDate: null,
    releaseNotes: null,
    error: "",
    checkedAt: null,
    receivedBytes: 0,
    totalBytes: null,
    checkForUpdate: vi.fn(async () => null),
    installUpdate: vi.fn(async () => undefined),
    restartApp: vi.fn(async () => undefined)
  };
}

function renderProfile(updater: AppUpdaterController, props: Partial<Parameters<typeof ProfileCenter>[0]> = {}) {
  return render(
    <ProfileCenter
      user={user}
      appBootstrap={appBootstrap}
      appCloseBehavior="hide"
      displaySize="default"
      floatingCardThemeId="warm-paper"
      footerVisible
      footerType="sea"
      fontFamily="system"
      printButtonEnabled={false}
      sidebarModuleOptions={sidebarModuleOptions}
      taskCardDisplayMode="full"
      themeId="warm-paper"
      titleColor="app-teal"
      visibleSidebarModules={defaultVisibleSidebarModules}
      onFooterVisibleChanged={vi.fn()}
      onFooterTypeChanged={vi.fn()}
      onFloatingCardThemeChanged={vi.fn()}
      onFontFamilyChanged={vi.fn()}
      onAppCloseBehaviorChanged={vi.fn()}
      onDisplaySizeChanged={vi.fn()}
      onPasswordChanged={vi.fn()}
      onPrintButtonEnabledChanged={vi.fn()}
      onTaskCardDisplayModeChanged={vi.fn()}
      onTitleColorChanged={vi.fn()}
      onThemeChanged={vi.fn()}
      onUserChanged={vi.fn()}
      onVisibleSidebarModulesChanged={vi.fn()}
      updater={updater}
      {...props}
    />
  );
}

describe("ProfileCenter", () => {
  it("hides version updates when updates are unsupported", () => {
    renderProfile(createUpdater("unsupported"));

    expect(screen.queryByText("版本更新")).not.toBeInTheDocument();
    expect(screen.queryByText("检查更新")).not.toBeInTheDocument();
  });

  it("shows version updates when updates are supported", () => {
    renderProfile(createUpdater("idle"));

    expect(screen.getByText("版本更新")).toBeInTheDocument();
    expect(screen.getByText("检查更新")).toBeInTheDocument();
  });

  it("shows system card display settings", () => {
    renderProfile(createUpdater("idle"));

    expect(screen.getByText("系统配置")).toBeInTheDocument();
    expect(screen.getByText("待办事项卡片显示")).toBeInTheDocument();
    expect(screen.getByText(/完整卡片/)).toBeInTheDocument();
    expect(screen.getByText("仅标题")).toBeInTheDocument();
    expect(screen.getByText("关闭 app 时")).toBeInTheDocument();
    expect(screen.getByText(/仅关闭页面/)).toBeInTheDocument();
    expect(screen.getByText("退出应用")).toBeInTheDocument();
    expect(screen.getByText("显示模块")).toBeInTheDocument();
    expect(screen.getByLabelText("侧边导航显示模块")).toBeInTheDocument();
    expect(screen.getByText("待办事项")).toBeInTheDocument();
    expect(screen.getByText("备忘录")).toBeInTheDocument();
    expect(screen.getByText("习惯打卡")).toBeInTheDocument();
    expect(screen.getByText("日历")).toBeInTheDocument();
    expect(screen.getByText("番茄时钟")).toBeInTheDocument();
    expect(screen.getByLabelText("拖动排序 待办事项")).toBeInTheDocument();
  });

  it("shows print button visibility settings", () => {
    const onPrintButtonEnabledChanged = vi.fn();
    renderProfile(createUpdater("idle"), { onPrintButtonEnabledChanged });

    expect(screen.getByText("便签打印")).toBeInTheDocument();
    fireEvent.click(screen.getByText(/显示打印按钮/));
    expect(onPrintButtonEnabledChanged).toHaveBeenCalledWith(true);
  });

  it("renders sortable module items with module color identifiers", () => {
    renderProfile(createUpdater("idle"));
    const tasksOption = screen.getByText("待办事项").closest(".module-option");
    const memosOption = screen.getByText("备忘录").closest(".module-option");
    const habitsOption = screen.getByText("习惯打卡").closest(".module-option");
    const calendarOption = screen.getByText("日历").closest(".module-option");
    const pomodoroOption = screen.getByText("番茄时钟").closest(".module-option");

    expect(tasksOption).toHaveAttribute("data-sidebar-module", "tasks");
    expect(memosOption).toHaveAttribute("data-sidebar-module", "memos");
    expect(habitsOption).toHaveAttribute("data-sidebar-module", "habits");
    expect(calendarOption).toHaveAttribute("data-sidebar-module", "calendar");
    expect(pomodoroOption).toHaveAttribute("data-sidebar-module", "pomodoro");
    expect(screen.getByLabelText("拖动排序 待办事项")).toBeInTheDocument();
    expect(screen.getByLabelText("拖动排序 备忘录")).toBeInTheDocument();
  });

  it("uses an adaptive avatar crop stage after selecting an avatar", async () => {
    const createObjectURL = vi.fn(() => "blob:avatar");
    const revokeObjectURL = vi.fn();
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const originalImage = globalThis.Image;

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL
    });
    vi.stubGlobal("Image", class {
      naturalWidth = 640;
      naturalHeight = 480;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    });

    let unmountProfile: (() => void) | null = null;
    try {
      const { container, unmount } = renderProfile(createUpdater("idle"));
      unmountProfile = unmount;
      const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]');

      expect(fileInput).toBeInTheDocument();
      fireEvent.change(fileInput!, {
        target: {
          files: [new File(["avatar"], "avatar.png", { type: "image/png" })]
        }
      });

      await waitFor(() => expect(container.querySelector(".avatar-crop-stage")).toBeInTheDocument());

      const cropStage = container.querySelector<HTMLElement>(".avatar-crop-stage");
      expect(cropStage).toHaveStyle({
        width: "min(100%, 240px)",
        aspectRatio: "1 / 1"
      });
      expect(cropStage?.style.height).toBe("");
    } finally {
      unmountProfile?.();
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        value: originalCreateObjectURL
      });
      Object.defineProperty(URL, "revokeObjectURL", {
        configurable: true,
        value: originalRevokeObjectURL
      });
      vi.stubGlobal("Image", originalImage);
    }
  });

  it("shows font settings in theme configuration", () => {
    renderProfile(createUpdater("idle"));

    expect(screen.getByText("字体配置")).toBeInTheDocument();
    expect(screen.getByText("系统字体")).toBeInTheDocument();
    expect(screen.getByText("乐米春序晚星体")).toBeInTheDocument();
    expect(screen.getByText("乐米沐和圆体")).toBeInTheDocument();
    expect(screen.getByText("乐米栀夏浅风体")).toBeInTheDocument();
    expect(screen.getByText("南西新圆体")).toBeInTheDocument();
    expect(screen.getByText("乐米小奶泡体")).toBeInTheDocument();
    expect(screen.getByText("白无常可可体")).toBeInTheDocument();
  });

  it("shows floating card theme settings in theme configuration", () => {
    renderProfile(createUpdater("idle"));

    expect(screen.getByText("固定卡片主题")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "固定卡片主题 暖纸" })).toHaveAttribute("data-floating-card-theme", "warm-paper");
    expect(screen.getByRole("button", { name: "固定卡片主题 白底黑字" })).toHaveAttribute("data-floating-card-theme", "white-ink");
    expect(screen.getByRole("button", { name: "固定卡片主题 黑底白字" })).toHaveAttribute("data-floating-card-theme", "black-snow");
    expect(screen.getByRole("button", { name: "固定卡片主题 深海蓝" })).toHaveAttribute("data-floating-card-theme", "navy");
  });
});
