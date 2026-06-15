import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ApiUser, AppBootstrapResponse } from "@todo/shared";
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
  apiVersion: "0.2.0",
  releaseChannel: "stable",
  desktop: {
    minimumVersion: "0.1.0",
    latestVersion: "0.2.0",
    updateEndpoint: "https://example.com/latest.json"
  },
  featureFlags: {
    calendar: true,
    pomodoro: true,
    taskQuadrant: true,
    floatingCard: true
  }
};

function createUpdater(status: AppUpdaterController["status"]): AppUpdaterController {
  return {
    status,
    currentVersion: "0.2.0",
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

function renderProfile(updater: AppUpdaterController) {
  return render(
    <ProfileCenter
      user={user}
      appBootstrap={appBootstrap}
      displaySize="default"
      footerVisible
      footerType="sea"
      taskCardDisplayMode="full"
      themeId="shinchan"
      titleColor="app-teal"
      onFooterVisibleChanged={vi.fn()}
      onFooterTypeChanged={vi.fn()}
      onDisplaySizeChanged={vi.fn()}
      onPasswordChanged={vi.fn()}
      onTaskCardDisplayModeChanged={vi.fn()}
      onTitleColorChanged={vi.fn()}
      onThemeChanged={vi.fn()}
      onUserChanged={vi.fn()}
      updater={updater}
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
  });
});
