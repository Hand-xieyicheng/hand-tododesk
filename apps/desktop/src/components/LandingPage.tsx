import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Button, Title } from "animal-island-ui";
import { gsap } from "gsap";
import {
  Apple,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  CheckSquare2,
  Clock3,
  Download,
  Globe2,
  LayoutGrid,
  NotebookPen,
  Pin
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import landingBanner from "../assets/landing-banner.png";
import { SidebarLogo } from "./SidebarLogo";

const releaseUrl =
  "https://github.com/Hand-xieyicheng/hand-tododesk/releases/latest";
const icpFilingUrl = "https://beian.miit.gov.cn/";
const heroTagline = "一只陪你梳理待办、备忘、日历和专注时间的小柴犬工作台。";

const featureItems = [
  {
    title: "待办与四象限",
    description: "把今天要做、值得推进和可以稍后处理的事项拆清楚。",
    icon: LayoutGrid
  },
  {
    title: "备忘录",
    description: "记录灵感、会议结论和临时信息，和任务节奏放在同一个工作台。",
    icon: NotebookPen
  },
  {
    title: "倒数纪念日",
    description: "重要日期提前看见，交付、纪念日和阶段节点不再散落。",
    icon: CalendarDays
  },
  {
    title: "日历视图",
    description: "用月历视角检查安排密度，快速发现空档和拥挤的周期。",
    icon: CheckSquare2
  },
  {
    title: "番茄时钟",
    description: "把任务和专注计时连起来，开始、暂停和完成都更顺手。",
    icon: Clock3
  },
  {
    title: "桌面固定卡片",
    description: "把当前事项固定在桌面边角，减少切换窗口时的注意力损耗。",
    icon: Pin
  }
];

const advantageItems = [
  "Web / Windows / macOS 多端使用",
  "轻量桌面体验，打开就能进入工作状态",
  "账号同步任务、偏好和个人资料",
  "主题、字体、侧栏模块都能按习惯调整"
];

type TypewriterTextProps = {
  className?: string;
  delay?: number;
  speed?: number;
  text: string;
};

function TypewriterText({
  className,
  delay = 280,
  speed = 108,
  text
}: TypewriterTextProps) {
  const [visibleText, setVisibleText] = useState("");

  useEffect(() => {
    const prefersReducedMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    if (prefersReducedMotion) {
      setVisibleText(text);
      return;
    }

    let index = 0;
    let timeoutId = window.setTimeout(function typeNextCharacter() {
      index += 1;
      setVisibleText(text.slice(0, index));

      if (index < text.length) {
        timeoutId = window.setTimeout(typeNextCharacter, speed);
      }
    }, delay);

    return () => window.clearTimeout(timeoutId);
  }, [delay, speed, text]);

  return (
    <span className={className} aria-label={text}>
      <span aria-hidden="true">{visibleText}</span>
      {visibleText.length === text.length ? (
        ""
      ) : (
        <span className="landing-typewriter-cursor" aria-hidden="true" />
      )}
    </span>
  );
}

export function LandingPage() {
  const navigate = useNavigate();
  const landingRef = useRef<HTMLElement | null>(null);
  const landingHeroStyle = {
    "--landing-hero-image": `url(${landingBanner})`
  } as CSSProperties;

  useEffect(() => {
    const landingRoot = landingRef.current;

    if (!landingRoot) {
      return;
    }

    const prefersReducedMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    let revealObserver: IntersectionObserver | null = null;
    const revealTimelines: gsap.core.Timeline[] = [];
    const context = gsap.context(() => {
      if (prefersReducedMotion) {
        gsap.set("[data-landing-reveal]", { clearProps: "all" });
        return;
      }

      gsap.from(
        ".landing-nav, .landing-title, .landing-tagline, .landing-hero-actions, .landing-platform-row",
        {
          autoAlpha: 0,
          duration: 0.72,
          ease: "power3.out",
          stagger: 0.08,
          y: 18
        }
      );

      gsap.to("[data-landing-float]", {
        duration: 3.8,
        ease: "sine.inOut",
        repeat: -1,
        stagger: {
          amount: 1.1,
          from: "random"
        },
        x: "random(-14, 14)",
        y: "random(-18, 18)",
        yoyo: true
      });

      gsap.to(".landing-float-line", {
        duration: 1.8,
        ease: "sine.inOut",
        repeat: -1,
        scaleX: 0.58,
        stagger: 0.16,
        transformOrigin: "left center",
        yoyo: true
      });

      const sections = gsap.utils.toArray<HTMLElement>("[data-landing-reveal]");

      const revealSection = (section: HTMLElement) => {
        const revealType = section.dataset.landingReveal;
        const childSelector =
          revealType === "download"
            ? ".landing-download-copy, .landing-download-card"
            : revealType === "feature"
              ? ".landing-feature-heading, .landing-feature-card"
              : ".landing-section-heading, .landing-advantage-marquee";

        const sectionFrom =
          revealType === "download"
            ? { autoAlpha: 0, y: 46 }
            : revealType === "feature"
              ? { autoAlpha: 0, x: -32 }
              : { autoAlpha: 0, scale: 0.96, y: 24 };

        const childFrom =
          revealType === "download"
            ? { autoAlpha: 0, y: 26 }
            : revealType === "feature"
              ? { autoAlpha: 0, x: 24 }
              : { autoAlpha: 0, y: 18 };

        const timeline = gsap.timeline({
          defaults: {
            ease: "power3.out"
          }
        });
        revealTimelines.push(timeline);

        timeline
          .from(section, {
            ...sectionFrom,
            duration: 0.68
          })
          .from(
            section.querySelectorAll(childSelector),
            {
              ...childFrom,
              duration: 0.58,
              stagger: 0.08
            },
            "-=0.34"
          );
      };

      if ("IntersectionObserver" in window) {
        revealObserver = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (!entry.isIntersecting) {
                return;
              }

              const section = entry.target as HTMLElement;
              revealObserver?.unobserve(section);
              revealSection(section);
            });
          },
          {
            rootMargin: "0px 0px -14% 0px",
            threshold: 0.18
          }
        );

        sections.forEach((section) => revealObserver?.observe(section));
      } else {
        sections.forEach(revealSection);
      }
    }, landingRoot);

    return () => {
      revealObserver?.disconnect();
      revealTimelines.forEach((timeline) => timeline.kill());
      context.revert();
    };
  }, []);

  return (
    <main className="landing-page" ref={landingRef}>
      <section
        className="landing-hero"
        aria-labelledby="landing-title"
        style={landingHeroStyle}
      >
        <nav className="landing-nav" aria-label="小柴记首页导航">
          <button
            className="landing-brand"
            type="button"
            onClick={() => navigate("/")}
          >
            <SidebarLogo className="landing-brand-logo" />
          </button>
          <div className="landing-nav-actions">
            <Button
              className="landing-nav-login"
              type="text"
              onClick={() => navigate("/auth")}
            >
              登录
            </Button>
            <Button
              className="landing-nav-register"
              type="default"
              onClick={() => navigate("/register")}
            >
              注册
            </Button>
          </div>
        </nav>

        <div className="landing-floating-scene" aria-hidden="true">
          <span
            className="landing-float landing-float-star"
            data-landing-float="star"
          />
        </div>

        <div className="landing-hero-grid">
          <div className="landing-hero-copy">
            <Title className="landing-title" color="app-orange" size="large">
              小柴记
            </Title>
            <p className="landing-tagline">
              <TypewriterText
                className="landing-typewriter"
                text={heroTagline}
              />
            </p>
            <div className="landing-hero-actions">
              <Button
                className="landing-primary-action"
                icon={<ArrowRight size={17} />}
                type="primary"
                onClick={() => navigate("/auth")}
              >
                打开 Web 版
              </Button>
              <a className="landing-secondary-action" href="#landing-downloads">
                <Download size={17} />
                下载桌面应用
              </a>
            </div>
            <div className="landing-platform-row" aria-label="支持平台">
              <span>Web</span>
              <span>Windows</span>
              <span>macOS</span>
            </div>
          </div>
        </div>
      </section>

      <section
        className="landing-section landing-download-section"
        id="landing-downloads"
        aria-labelledby="landing-download-title"
        data-landing-reveal="download"
      >
        <div className="landing-download-copy">
          <span className="landing-section-eyebrow">下载</span>
          <h2 id="landing-download-title">选择你的使用方式</h2>
          <p>浏览器里快速进入，也可以安装桌面应用，把待办固定在更近的位置。</p>
        </div>
        <div className="landing-download-actions">
          <button
            className="landing-download-button landing-download-card"
            type="button"
            onClick={() => navigate("/auth")}
          >
            <span
              className="landing-platform-logo landing-platform-logo-web"
              aria-hidden="true"
            >
              <Globe2 size={25} />
            </span>
            <span className="landing-download-button-copy">
              <strong>Web</strong>
              <span>打开 Web 版</span>
            </span>
          </button>
          <a
            className="landing-download-button landing-download-card"
            href={releaseUrl}
            target="_blank"
            rel="noreferrer"
          >
            <span
              className="landing-platform-logo landing-platform-logo-macos"
              aria-hidden="true"
            >
              <Apple size={25} />
            </span>
            <span className="landing-download-button-copy">
              <strong>macOS</strong>
              <span>下载 macOS 版</span>
            </span>
          </a>
          <a
            className="landing-download-button landing-download-card"
            href={releaseUrl}
            target="_blank"
            rel="noreferrer"
          >
            <span
              className="landing-platform-logo landing-platform-logo-windows"
              aria-hidden="true"
            >
              <span className="landing-windows-logo">
                <span />
                <span />
                <span />
                <span />
              </span>
            </span>
            <span className="landing-download-button-copy">
              <strong>Windows</strong>
              <span>下载 Windows 版</span>
            </span>
          </a>
        </div>
      </section>

      <section
        className="landing-section landing-feature-section"
        aria-labelledby="landing-features-title"
        data-landing-reveal="feature"
      >
        <div className="landing-feature-shell">
          <div className="landing-section-heading landing-feature-heading">
            <span className="landing-section-eyebrow">功能</span>
            <h2 id="landing-features-title">把日常事务串成一条顺手的工作流</h2>
            <p className="landing-section-copy">
              从任务拆解、灵感记录到日历检查和专注计时，小柴记把常用入口收在同一个清爽桌面里。
            </p>
            <div className="landing-feature-pills" aria-label="功能覆盖">
              <span>计划</span>
              <span>记录</span>
              <span>排期</span>
              <span>专注</span>
            </div>
          </div>
          <div className="landing-feature-grid">
            {featureItems.map((item, index) => {
              const Icon = item.icon;
              return (
                <article className="landing-feature-card" key={item.title}>
                  <span className="landing-feature-icon" aria-hidden="true">
                    <Icon size={21} />
                  </span>
                  <div className="landing-feature-card-copy">
                    <h3>{item.title}</h3>
                    <p>{item.description}</p>
                  </div>
                  <span className="landing-feature-index">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section
        className="landing-section landing-advantage-section"
        aria-labelledby="landing-advantages-title"
        data-landing-reveal="advantage"
      >
        <div className="landing-section-heading">
          <span className="landing-section-eyebrow">优点</span>
          <h2 id="landing-advantages-title">适合日常反复打开的效率工具</h2>
        </div>
        <div
          className="landing-advantage-marquee"
          aria-label="小柴记优点横向自动滚动列表"
        >
          <div className="landing-advantage-rail">
            {[0, 1].map((trackIndex) => (
              <div
                className="landing-advantage-track"
                key={trackIndex}
                aria-hidden={trackIndex === 1 ? "true" : undefined}
              >
                {advantageItems.map((item) => (
                  <article
                    className="landing-advantage-card"
                    key={`${trackIndex}-${item}`}
                  >
                    <CheckCircle2 size={21} />
                    <span>{item}</span>
                  </article>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="landing-icp-footer" aria-label="备案信息">
        <a
          className="landing-icp-link"
          href={icpFilingUrl}
          target="_blank"
          rel="noreferrer"
        >
          闽ICP备2022006727号
        </a>
      </footer>
    </main>
  );
}
