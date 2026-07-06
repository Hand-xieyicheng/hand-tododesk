import { render, screen } from "@testing-library/react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { AuthView } from "./AuthView";

vi.mock("@todo/shared", async () => {
  const actual = await vi.importActual<typeof import("@todo/shared")>(
    "@todo/shared"
  );

  return {
    ...actual,
    defaultThemeId: "island"
  };
});

vi.mock("animal-island-ui", () => ({
  Button: ({
    children,
    className,
    disabled,
    htmlType,
    icon,
    onClick
  }: {
    children: ReactNode;
    className?: string;
    disabled?: boolean;
    htmlType?: "button" | "submit" | "reset";
    icon?: ReactNode;
    onClick?: () => void;
  }) => (
    <button
      className={className}
      disabled={disabled}
      type={htmlType ?? "button"}
      onClick={onClick}
    >
      {icon}
      {children}
    </button>
  ),
  Card: ({
    children,
    className
  }: {
    children: ReactNode;
    className?: string;
  }) => <section className={className}>{children}</section>,
  Divider: () => <hr />,
  Input: ({
    allowClear: _allowClear,
    shadow: _shadow,
    ...props
  }: InputHTMLAttributes<HTMLInputElement> & {
    allowClear?: boolean;
    shadow?: boolean;
  }) => <input {...props} />,
  Loading: ({ className }: { className?: string }) => (
    <span className={className} />
  ),
  Title: ({
    children
  }: {
    children: ReactNode;
    color?: string;
    size?: string;
  }) => <h1>{children}</h1>
}));

vi.mock("../api/client", () => ({
  api: {
    forgotPassword: vi.fn(),
    login: vi.fn(),
    register: vi.fn()
  }
}));

vi.mock("../lib/authStorage", () => ({
  deleteRememberedPassword: vi.fn(),
  getLastLoginEmail: vi.fn(() => ""),
  getRememberedPassword: vi.fn(() => Promise.resolve("")),
  getRememberedPasswordEmail: vi.fn(() => ""),
  saveLastLoginEmail: vi.fn(),
  saveRememberedPassword: vi.fn()
}));

vi.mock("../lib/themes", () => ({
  applyTheme: vi.fn()
}));

describe("AuthView", () => {
  it("renders the login page brand logo as the animated sidebar SVG", () => {
    render(<AuthView onAuthed={vi.fn()} />);

    const logo = screen.getByRole("img", { name: "小柴记" });

    expect(logo).toHaveClass("auth-page-logo");
    expect(logo).toHaveAttribute("data-logo-format", "svg");
    expect(logo.querySelector("svg")).toHaveClass("sidebar-logo-svg");
    expect(logo.querySelectorAll(".sidebar-logo-eye")).toHaveLength(2);
    expect(logo.querySelector(".sidebar-logo-ear-left")).toBeInTheDocument();
    expect(logo.querySelector(".sidebar-logo-ear-right")).toBeInTheDocument();
  });
});
