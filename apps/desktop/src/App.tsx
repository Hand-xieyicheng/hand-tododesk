import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, PointerEvent } from "react";
import { defaultAppFeatureFlags, type ApiTask, type ApiThemePreference, type ApiUser, type AppBootstrapResponse, type AppFeatureFlags, type DisplaySize, type FontFamily, type FooterType as AppFooterType, type TaskCardDisplayMode, type TaskViewMode, type ThemeId, type TitleColor } from "@todo/shared";
import { Button, Footer, Loading, Title, Tooltip } from "animal-island-ui";
import type { TitleSize } from "animal-island-ui";
import { Bell, CalendarDays, CheckSquare2, Clock3, Eye, EyeOff, LayoutGrid, ListTodo, LogOut, Pin, Plus, UserRound } from "lucide-react";
import { api, ApiError } from "./api/client";
import { AuthView } from "./components/AuthView";
import { CalendarView } from "./components/CalendarView";
import { PomodoroView } from "./components/PomodoroView";
import { ProfileCenter } from "./components/ProfileCenter";
import { TaskPanel } from "./components/TaskPanel";
import todoDeskLogo from "./assets/tododesk-logo.png";
import { applyDisplaySize, normalizeDisplaySize } from "./lib/displaySize";
import { applyFontFamily, normalizeFontFamily } from "./lib/fonts";
import { applyTheme } from "./lib/themes";
import { clearSession, getSavedUser, saveUser } from "./lib/authStorage";
import { useAppUpdater } from "./lib/useAppUpdater";
import { compareVersions } from "./lib/version";

type View = "tasks" | "calendar" | "pomodoro" | "profile";

const navItems: Array<{ id: View; label: string; icon: typeof CheckSquare2 }> = [
  { id: "tasks", label: "待办事项", icon: CheckSquare2 },
  { id: "calendar", label: "日历", icon: CalendarDays },
  { id: "pomodoro", label: "番茄时钟", icon: Clock3 }
];

const viewTitleSizes: Record<DisplaySize, TitleSize> = {
  small: "small",
  default: "middle",
  large: "large"
};

const defaultThemePreference: ApiThemePreference = {
  themeId: "default",
  titleColor: "app-teal",
  footerVisible: true,
  footerType: "sea",
  showCompletedTasks: true,
  taskViewMode: "list",
  taskCardDisplayMode: "full",
  displaySize: "default",
  fontFamily: "system"
};

const preferenceSyncIntervalMs = 5000;

const dragIgnoredTargetSelector = [
  "a",
  "button",
  "input",
  "select",
  "textarea",
  "[contenteditable='true']",
  "[role='button']",
  "[role='link']",
  "[role='menuitem']",
  ".topbar-actions"
].join(",");

function isDragIgnoredTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest(dragIgnoredTargetSelector));
}

async function startWindowDrag(event: PointerEvent<HTMLElement>) {
  if (event.button !== 0 || isDragIgnoredTarget(event.target)) {
    return;
  }

  event.preventDefault();
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().startDragging();
  } catch {
    // Running in a browser during development has no native window to drag.
  }
}

export function App() {
  const [user, setUser] = useState<ApiUser | null>(() => getSavedUser());
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [appBootstrap, setAppBootstrap] = useState<AppBootstrapResponse | null>(null);
  const [activeView, setActiveView] = useState<View>("tasks");
  const [taskViewMode, setTaskViewMode] = useState<TaskViewMode>("list");
  const [taskCreateOpen, setTaskCreateOpen] = useState(false);
  const [themeId, setThemeId] = useState<ThemeId>("default");
  const [titleColor, setTitleColor] = useState<TitleColor>("app-teal");
  const [footerVisible, setFooterVisible] = useState(true);
  const [footerType, setFooterType] = useState<AppFooterType>("sea");
  const [showCompletedTasks, setShowCompletedTasks] = useState(true);
  const [taskCardDisplayMode, setTaskCardDisplayMode] = useState<TaskCardDisplayMode>("full");
  const [displaySize, setDisplaySize] = useState<DisplaySize>(() => normalizeDisplaySize(localStorage.getItem("tododesk.displaySize")));
  const [fontFamily, setFontFamily] = useState<FontFamily>(() => normalizeFontFamily(localStorage.getItem("tododesk.fontFamily")));
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [entryLoading, setEntryLoading] = useState(false);
  const [showEntryLoading, setShowEntryLoading] = useState(false);
  const updater = useAppUpdater();

  const featureFlags: AppFeatureFlags = appBootstrap?.featureFlags ?? defaultAppFeatureFlags;
  const visibleNavItems = useMemo(() => navItems.filter((item) => (
    (item.id !== "calendar" || featureFlags.calendar) &&
    (item.id !== "pomodoro" || featureFlags.pomodoro)
  )), [featureFlags.calendar, featureFlags.pomodoro]);
  const openTasks = useMemo(() => tasks.filter((task) => task.status !== "COMPLETED"), [tasks]);
  const userDisplayName = user?.name || user?.email || "";
  const userInitial = userDisplayName.trim().slice(0, 1).toUpperCase();
  const viewTitle = activeView === "tasks" ? "待办事项" : activeView === "calendar" ? "日历模式" : activeView === "pomodoro" ? "番茄时钟" : "个人中心";
  const viewTitleSize = viewTitleSizes[displaySize];
  const workspaceStyle = {
    "--workspace-footer-height": footerVisible ? (footerType === "sea" ? "var(--app-footer-height-sea)" : "var(--app-footer-height-tree)") : "0px",
    "--workspace-footer-gap": footerVisible ? "var(--app-footer-gap)" : "0px"
  } as CSSProperties;
  const showCompletedTasksAction = showCompletedTasks ? "隐藏已完成事项" : "显示已完成事项";
  const updateRequired = appBootstrap ? compareVersions(updater.currentVersion, appBootstrap.desktop.minimumVersion) < 0 : false;
  const forcedUpdateMessage = updateRequired
    ? `当前版本 ${updater.currentVersion} 低于最低支持版本 ${appBootstrap?.desktop.minimumVersion}，请尽快更新。`
    : "";

  function applyThemePreference(preference: ApiThemePreference) {
    const nextDisplaySize = normalizeDisplaySize(preference.displaySize);
    const nextFontFamily = normalizeFontFamily(preference.fontFamily);

    setThemeId(preference.themeId);
    setTitleColor(preference.titleColor);
    setFooterVisible(preference.footerVisible);
    setFooterType(preference.footerType);
    setShowCompletedTasks(preference.showCompletedTasks);
    setTaskViewMode(preference.taskViewMode);
    setTaskCardDisplayMode(preference.taskCardDisplayMode);
    setDisplaySize(nextDisplaySize);
    setFontFamily(nextFontFamily);
    localStorage.setItem("tododesk.theme", preference.themeId);
    localStorage.setItem("tododesk.displaySize", nextDisplaySize);
    localStorage.setItem("tododesk.fontFamily", nextFontFamily);
    applyTheme(preference.themeId);
    applyDisplaySize(nextDisplaySize);
    applyFontFamily(nextFontFamily);
  }

  async function loadAppData(options: { immersive?: boolean } = {}) {
    if (!user) {
      return;
    }
    if (options.immersive) {
      setEntryLoading(true);
    }
    setLoading(true);
    setMessage("");
    try {
      const [taskPayload, preference, profile] = await Promise.all([
        api.tasks(),
        api.getThemePreference().catch(() => defaultThemePreference),
        api.currentUser()
      ]);
      setTasks(taskPayload.tasks);
      setUser(profile.user);
      saveUser(profile.user);
      applyThemePreference(preference);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await clearSession();
        setUser(null);
      } else {
        setMessage(error instanceof Error ? error.message : "加载失败");
      }
    } finally {
      setLoading(false);
      if (options.immersive) {
        setEntryLoading(false);
      }
    }
  }

  useEffect(() => {
    applyTheme(themeId);
  }, [themeId]);

  useEffect(() => {
    applyDisplaySize(displaySize);
  }, [displaySize]);

  useEffect(() => {
    applyFontFamily(fontFamily);
  }, [fontFamily]);

  useEffect(() => {
    let cancelled = false;

    async function loadBootstrap() {
      try {
        const payload = await api.appBootstrap();
        if (!cancelled) {
          setAppBootstrap(payload);
        }
      } catch {
        // Bootstrap controls version hints and feature flags; core workflows should continue without it.
      }
    }

    void loadBootstrap();
  }, []);

  useEffect(() => {
    void updater.checkForUpdate({ silent: true });
  }, [updater.checkForUpdate]);

  useEffect(() => {
    void loadAppData({ immersive: true });
  }, [user?.id]);

  useEffect(() => {
    if ((activeView === "calendar" && !featureFlags.calendar) || (activeView === "pomodoro" && !featureFlags.pomodoro)) {
      setActiveView("tasks");
    }
  }, [activeView, featureFlags.calendar, featureFlags.pomodoro]);

  useEffect(() => {
    if (!featureFlags.taskQuadrant && taskViewMode === "quadrant") {
      setTaskViewMode("list");
    }
  }, [featureFlags.taskQuadrant, taskViewMode]);

  useEffect(() => {
    if (!user) {
      return;
    }

    let cancelled = false;
    const syncPreference = async () => {
      try {
        const preference = await api.getThemePreference();
        if (!cancelled) {
          applyThemePreference(preference);
        }
      } catch {
        // Background preference sync should not interrupt the current workflow.
      }
    };
    const intervalId = window.setInterval(() => void syncPreference(), preferenceSyncIntervalMs);
    const syncWhenVisible = () => {
      if (document.visibilityState === "visible") {
        void syncPreference();
      }
    };

    window.addEventListener("focus", syncWhenVisible);
    document.addEventListener("visibilitychange", syncWhenVisible);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", syncWhenVisible);
      document.removeEventListener("visibilitychange", syncWhenVisible);
    };
  }, [user?.id]);

  useEffect(() => {
    if (entryLoading) {
      setShowEntryLoading(true);
      return;
    }

    const timeout = window.setTimeout(() => setShowEntryLoading(false), 460);
    return () => window.clearTimeout(timeout);
  }, [entryLoading]);

  async function handleAuthed(nextUser: ApiUser) {
    saveUser(nextUser);
    setUser(nextUser);
    setActiveView("tasks");
  }

  async function handleLogout() {
    await api.logout();
    setUser(null);
    setTasks([]);
    setActiveView("tasks");
  }

  function handleUserChanged(nextUser: ApiUser) {
    saveUser(nextUser);
    setUser(nextUser);
  }

  function handlePasswordChanged() {
    setUser(null);
    setTasks([]);
    setActiveView("tasks");
  }

  function handleThemeChanged(next: ThemeId) {
    setThemeId(next);
    localStorage.setItem("tododesk.theme", next);
    void api.setThemePreference({ themeId: next }).catch((error) => {
      setMessage(error instanceof Error ? error.message : "主题保存失败");
    });
  }

  function handleTitleColorChanged(next: TitleColor) {
    setTitleColor(next);
    void api.setThemePreference({ titleColor: next }).catch((error) => {
      setMessage(error instanceof Error ? error.message : "标题颜色保存失败");
    });
  }

  function handleFooterVisibleChanged(next: boolean) {
    setFooterVisible(next);
    void api.setThemePreference({ footerVisible: next }).catch((error) => {
      setMessage(error instanceof Error ? error.message : "Footer 显示配置保存失败");
    });
  }

  function handleFooterTypeChanged(next: AppFooterType) {
    setFooterType(next);
    void api.setThemePreference({ footerType: next }).catch((error) => {
      setMessage(error instanceof Error ? error.message : "Footer 样式保存失败");
    });
  }

  function handleShowCompletedTasksChanged(next: boolean) {
    setShowCompletedTasks(next);
    void api.setThemePreference({ showCompletedTasks: next })
      .then(applyThemePreference)
      .catch((error) => {
        setShowCompletedTasks(!next);
        setMessage(error instanceof Error ? error.message : "待办显示配置保存失败");
      });
  }

  function handleTaskViewModeChanged(next: TaskViewMode) {
    setTaskViewMode(next);
    void api.setThemePreference({ taskViewMode: next }).catch((error) => {
      setMessage(error instanceof Error ? error.message : "待办样式配置保存失败");
    });
  }

  function handleTaskCardDisplayModeChanged(next: TaskCardDisplayMode) {
    const previous = taskCardDisplayMode;
    setTaskCardDisplayMode(next);
    void api.setThemePreference({ taskCardDisplayMode: next }).catch((error) => {
      setTaskCardDisplayMode(previous);
      setMessage(error instanceof Error ? error.message : "待办事项卡片显示配置保存失败");
    });
  }

  function handleDisplaySizeChanged(next: DisplaySize) {
    setDisplaySize(next);
    localStorage.setItem("tododesk.displaySize", next);
    applyDisplaySize(next);
    void api.setThemePreference({ displaySize: next }).catch((error) => {
      setMessage(error instanceof Error ? error.message : "界面显示大小保存失败");
    });
  }

  function handleFontFamilyChanged(next: FontFamily) {
    const previous = fontFamily;
    const normalized = applyFontFamily(next);
    setFontFamily(normalized);
    localStorage.setItem("tododesk.fontFamily", normalized);
    void api.setThemePreference({ fontFamily: normalized }).catch((error) => {
      setFontFamily(previous);
      localStorage.setItem("tododesk.fontFamily", previous);
      applyFontFamily(previous);
      setMessage(error instanceof Error ? error.message : "字体配置保存失败");
    });
  }

  async function openFloatingCard() {
    const query = "/?window=floating";
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("open_floating_card", { url: query });
    } catch {
      const child = window.open(query, "tododesk-floating", "width=360,height=520");
      child?.focus();
    }
  }

  if (!user) {
    return <AuthView onAuthed={handleAuthed} />;
  }

  return (
    <div className="app-shell">
      <div
        aria-hidden="true"
        className="window-drag-strip"
        data-tauri-drag-region=""
        onPointerDown={startWindowDrag}
      />
      <aside className="sidebar">
        <div className="brand-block app-brand app-drag-region" onPointerDown={startWindowDrag}>
          <img className="brand-logo sidebar-brand-logo" src={todoDeskLogo} alt="todoDesk" />
        </div>

        <nav className="nav-list" aria-label="主要导航">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <Button
                key={item.id}
                block
                aria-current={isActive ? "page" : undefined}
                className={isActive ? "nav-button is-active" : "nav-button"}
                onClick={() => setActiveView(item.id)}
                type="text"
              >
                <span className="nav-button-icon" aria-hidden="true">
                  <Icon size={18} />
                </span>
                <span className="nav-button-label">{item.label}</span>
              </Button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="user-menu">
            <button className={activeView === "profile" ? "sidebar-user-card is-active" : "sidebar-user-card"} type="button" aria-haspopup="menu" onClick={() => setActiveView("profile")}>
              <span className="sidebar-user-avatar">
                {user.avatarUrl ? <img src={user.avatarUrl} alt={userDisplayName} /> : <span>{userInitial}</span>}
              </span>
              <span className="sidebar-user-copy">
                <strong>{userDisplayName}</strong>
                <span>{user.email}</span>
              </span>
            </button>
            <div className="user-menu-panel" role="menu">
              <Button className="ghost-button" icon={<UserRound size={16} />} type="default" onClick={() => setActiveView("profile")}>
                个人中心
              </Button>
              {featureFlags.floatingCard ? (
                <Button className="ghost-button" icon={<Pin size={16} />} type="default" onClick={() => openFloatingCard()}>
                  固定桌面卡片
                </Button>
              ) : null}
              <Button className="ghost-button" icon={<LogOut size={16} />} type="default" onClick={handleLogout}>
                退出登录
              </Button>
            </div>
          </div>
        </div>
      </aside>

      <main className="workspace" style={workspaceStyle}>
        {showEntryLoading ? (
          <div className={entryLoading ? "app-loading-overlay is-active" : "app-loading-overlay is-closing"} aria-busy={entryLoading} aria-live="polite">
            <Loading active={entryLoading} className="app-loading-scene" />
            <div className="app-loading-label">登岛中...</div>
          </div>
        ) : null}

        <header className="topbar app-drag-region" onPointerDown={startWindowDrag}>
          <div>
            <Title className="view-title" color={titleColor} size={viewTitleSize}>
              {viewTitle}
            </Title>
          </div>
          <div className="topbar-actions">
            <span className="status-pill"><Bell size={14} /> {openTasks.length} 个未完成</span>
            {activeView === "tasks" ? (
              <>
                <Tooltip className="task-completion-toggle-tooltip" placement="bottom" title={showCompletedTasksAction} trigger="hover" variant="default">
                  <Button
                    aria-label={showCompletedTasksAction}
                    className={showCompletedTasks ? "task-completion-toggle is-active" : "task-completion-toggle"}
                    icon={showCompletedTasks ? <Eye size={14} /> : <EyeOff size={14} />}
                    size="small"
                    type={showCompletedTasks ? "default" : "text"}
                    onClick={() => handleShowCompletedTasksChanged(!showCompletedTasks)}
                  />
                </Tooltip>
                {featureFlags.taskQuadrant ? (
                  <div className="task-view-toggle" aria-label="待办样式">
                    <Button
                      className={taskViewMode === "list" ? "is-active" : ""}
                      icon={<ListTodo size={14} />}
                      size="small"
                      type={taskViewMode === "list" ? "primary" : "text"}
                      onClick={() => handleTaskViewModeChanged("list")}
                    >
                      列表
                    </Button>
                    <Button
                      className={taskViewMode === "quadrant" ? "is-active" : ""}
                      icon={<LayoutGrid size={14} />}
                      size="small"
                      type={taskViewMode === "quadrant" ? "primary" : "text"}
                      onClick={() => handleTaskViewModeChanged("quadrant")}
                    >
                      四象限
                    </Button>
                  </div>
                ) : null}
                <Button className="primary-button" icon={<Plus size={14} />} size="small" type="default" onClick={() => setTaskCreateOpen(true)}>
                  新增
                </Button>
              </>
            ) : (
              null
            )}
          </div>
        </header>

        {forcedUpdateMessage ? <div className="inline-alert">{forcedUpdateMessage}</div> : null}
        {message ? <div className="inline-alert">{message}</div> : null}
        {loading && !entryLoading ? <div className="inline-muted">加载中...</div> : null}

        {activeView === "tasks" ? (
          <TaskPanel
            createOpen={taskCreateOpen}
            showCompletedTasks={showCompletedTasks}
            taskCardDisplayMode={taskCardDisplayMode}
            tasks={tasks}
            viewMode={featureFlags.taskQuadrant ? taskViewMode : "list"}
            onChanged={loadAppData}
            onCreateOpenChange={setTaskCreateOpen}
          />
        ) : null}
        {activeView === "calendar" && featureFlags.calendar ? (
          <CalendarView onChanged={loadAppData} />
        ) : null}
        {activeView === "pomodoro" && featureFlags.pomodoro ? (
          <PomodoroView tasks={openTasks} onChanged={loadAppData} />
        ) : null}
        {activeView === "profile" ? (
          <ProfileCenter
            user={user}
            footerType={footerType}
            footerVisible={footerVisible}
            displaySize={displaySize}
            fontFamily={fontFamily}
            themeId={themeId}
            titleColor={titleColor}
            onDisplaySizeChanged={handleDisplaySizeChanged}
            onFontFamilyChanged={handleFontFamilyChanged}
            onFooterTypeChanged={handleFooterTypeChanged}
            onFooterVisibleChanged={handleFooterVisibleChanged}
            onPasswordChanged={handlePasswordChanged}
            onTaskCardDisplayModeChanged={handleTaskCardDisplayModeChanged}
            onTitleColorChanged={handleTitleColorChanged}
            onThemeChanged={handleThemeChanged}
            onUserChanged={handleUserChanged}
            appBootstrap={appBootstrap}
            taskCardDisplayMode={taskCardDisplayMode}
            updater={updater}
          />
        ) : null}
        {footerVisible ? (
          <div className="workspace-footer-decoration" aria-hidden="true">
            <Footer
              className={footerType === "sea" ? "workspace-footer-art workspace-footer-art-seamless" : "workspace-footer-art"}
              type={footerType}
            />
          </div>
        ) : null}
      </main>
    </div>
  );
}
