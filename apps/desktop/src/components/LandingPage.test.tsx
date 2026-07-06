import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { LandingPage } from "./LandingPage";

vi.mock("animal-island-ui", () => ({
  Button: ({
    children,
    className,
    icon,
    onClick,
    type: _type
  }: {
    children: ReactNode;
    className?: string;
    icon?: ReactNode;
    onClick?: () => void;
    type?: string;
  }) => (
    <button className={className} type="button" onClick={onClick}>
      {icon}
      {children}
    </button>
  ),
  Title: ({
    children,
    className
  }: {
    children: ReactNode;
    className?: string;
  }) => <h1 className={className}>{children}</h1>
}));

vi.mock("gsap", () => ({
  gsap: {
    context: (callback: () => void) => {
      callback();
      return {
        revert: vi.fn()
      };
    },
    from: vi.fn(),
    set: vi.fn(),
    timeline: () => ({
      from: vi.fn().mockReturnThis(),
      kill: vi.fn()
    }),
    to: vi.fn(),
    utils: {
      toArray: () => []
    }
  }
}));

describe("LandingPage", () => {
  it("renders the top-left brand logo as the animated sidebar SVG", () => {
    const { container } = render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );

    const logo = container.querySelector(".landing-brand-logo");

    expect(logo).toBeInTheDocument();
    expect(logo).toHaveAttribute("data-logo-format", "svg");
    expect(logo?.querySelector("svg")).toHaveClass("sidebar-logo-svg");
    expect(logo?.querySelectorAll(".sidebar-logo-eye")).toHaveLength(2);
    expect(logo?.querySelector(".sidebar-logo-ear-left")).toBeInTheDocument();
    expect(logo?.querySelector(".sidebar-logo-ear-right")).toBeInTheDocument();
  });

  it("renders the ICP filing link at the bottom of the landing page", () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );

    const filingLink = screen.getByRole("link", {
      name: "闽ICP备2022006727号"
    });

    expect(filingLink).toHaveAttribute("href", "https://beian.miit.gov.cn/");
    expect(filingLink.closest(".landing-icp-footer")).toBe(
      document.querySelector(".landing-page")?.lastElementChild
    );
  });

  it("renders advantages as duplicated horizontal marquee card tracks", () => {
    const { container } = render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );

    expect(
      screen.getByRole("heading", {
        name: "适合日常反复打开的效率工具"
      })
    ).toBeInTheDocument();

    const marquee = container.querySelector(".landing-advantage-marquee");
    expect(marquee).toBeInTheDocument();
    expect(marquee).toHaveAttribute(
      "aria-label",
      "小柴记优点横向自动滚动列表"
    );

    const tracks = container.querySelectorAll(".landing-advantage-track");
    expect(tracks).toHaveLength(2);
    expect(tracks[1]).toHaveAttribute("aria-hidden", "true");

    const firstTrack = tracks[0];
    if (!firstTrack) {
      throw new Error("Expected the visible advantage track to render.");
    }

    const firstTrackCards = firstTrack.querySelectorAll(
      ".landing-advantage-card"
    );
    expect(firstTrackCards).toHaveLength(4);
    expect(
      Array.from(firstTrackCards).map((card) => card.textContent)
    ).toEqual([
      "Web / Windows / macOS 多端使用",
      "轻量桌面体验，打开就能进入工作状态",
      "账号同步任务、偏好和个人资料",
      "主题、字体、侧栏模块都能按习惯调整"
    ]);
  });
});
