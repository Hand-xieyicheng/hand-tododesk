import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { ApiTask, ApiUser, FooterType as AppFooterType, ThemeId, TitleColor } from "@todo/shared";
import { Button, Footer, Loading, Title } from "animal-island-ui";
import { Bell, CalendarDays, CheckSquare2, Clock3, Eye, EyeOff, LayoutGrid, ListTodo, LogOut, Pin, Plus, UserRound } from "lucide-react";
import { api, ApiError } from "./api/client";
import { AuthView } from "./components/AuthView";
import { CalendarView } from "./components/CalendarView";
import { PomodoroView } from "./components/PomodoroView";
import { ProfileCenter } from "./components/ProfileCenter";
import { TaskPanel } from "./components/TaskPanel";
import todoDeskLogo from "./assets/tododesk-logo.png";
import { applyTheme } from "./lib/themes";
import { clearSession, getSavedUser, saveUser } from "./lib/authStorage";

type View = "tasks" | "calendar" | "pomodoro" | "profile";
type TaskViewMode = "list" | "quadrant";

const navItems: Array<{ id: View; label: string; icon: typeof CheckSquare2 }> = [
  { id: "tasks", label: "待办事项", icon: CheckSquare2 },
  { id: "calendar", label: "日历", icon: CalendarDays },
  { id: "pomodoro", label: "番茄时钟", icon: Clock3 }
];

export function App() {
  const [user, setUser] = useState<ApiUser | null>(() => getSavedUser());
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [activeView, setActiveView] = useState<View>("tasks");
  const [taskViewMode, setTaskViewMode] = useState<TaskViewMode>("list");
  const [taskCreateOpen, setTaskCreateOpen] = useState(false);
  const [themeId, setThemeId] = useState<ThemeId>("default");
  const [titleColor, setTitleColor] = useState<TitleColor>("app-teal");
  const [footerVisible, setFooterVisible] = useState(true);
  const [footerType, setFooterType] = useState<AppFooterType>("sea");
  const [showCompletedTasks, setShowCompletedTasks] = useState(true);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [entryLoading, setEntryLoading] = useState(false);
  const [showEntryLoading, setShowEntryLoading] = useState(false);

  const openTasks = useMemo(() => tasks.filter((task) => task.status !== "COMPLETED"), [tasks]);
  const userDisplayName = user?.name || user?.email || "";
  const userInitial = userDisplayName.trim().slice(0, 1).toUpperCase();
  const viewTitle = activeView === "tasks" ? "待办事项" : activeView === "calendar" ? "日历模式" : activeView === "pomodoro" ? "番茄时钟" : "个人中心";
  const workspaceStyle = {
    "--workspace-footer-height": footerVisible ? (footerType === "sea" ? "80px" : "60px") : "0px",
    "--workspace-footer-gap": footerVisible ? "var(--app-footer-gap)" : "0px"
  } as CSSProperties;

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
        api.getThemePreference().catch(() => ({
          themeId: "default",
          titleColor: "app-teal",
          footerVisible: true,
          footerType: "sea",
          showCompletedTasks: true
        }) as const),
        api.currentUser()
      ]);
      setTasks(taskPayload.tasks);
      setUser(profile.user);
      saveUser(profile.user);
      setThemeId(preference.themeId as ThemeId);
      setTitleColor((preference.titleColor ?? "app-teal") as TitleColor);
      setFooterVisible(preference.footerVisible ?? true);
      setFooterType((preference.footerType ?? "sea") as AppFooterType);
      setShowCompletedTasks(preference.showCompletedTasks ?? true);
      localStorage.setItem("tododesk.theme", preference.themeId);
      applyTheme(preference.themeId);
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
    void loadAppData({ immersive: true });
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
    void api.setThemePreference({ showCompletedTasks: next }).catch((error) => {
      setMessage(error instanceof Error ? error.message : "待办显示配置保存失败");
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
      <aside className="sidebar">
        <div className="brand-block app-brand">
          <img className="brand-logo sidebar-brand-logo" src={todoDeskLogo} alt="todoDesk" />
        </div>

        <nav className="nav-list">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Button
                key={item.id}
                block
                className={activeView === item.id ? "nav-button is-active" : "nav-button"}
                icon={<Icon size={18} />}
                onClick={() => setActiveView(item.id)}
                type={activeView === item.id ? "primary" : "text"}
              >
                {item.label}
              </Button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="user-menu">
            <button className="sidebar-user-card" type="button" aria-haspopup="menu" onClick={() => setActiveView("profile")}>
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
              <Button className="ghost-button" icon={<Pin size={16} />} type="default" onClick={() => openFloatingCard()}>
                固定桌面卡片
              </Button>
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

        <header className="topbar">
          <div>
            <Title className="view-title" color={titleColor}>
              {viewTitle}
            </Title>
          </div>
          <div className="topbar-actions">
            <span className="status-pill"><Bell size={14} /> {openTasks.length} 个未完成</span>
            {activeView === "tasks" ? (
              <>
                <Button
                  aria-label={showCompletedTasks ? "隐藏已完成事项" : "显示已完成事项"}
                  className={showCompletedTasks ? "task-completion-toggle is-active" : "task-completion-toggle"}
                  icon={showCompletedTasks ? <Eye size={14} /> : <EyeOff size={14} />}
                  size="small"
                  title={showCompletedTasks ? "隐藏已完成事项" : "显示已完成事项"}
                  type={showCompletedTasks ? "primary" : "text"}
                  onClick={() => handleShowCompletedTasksChanged(!showCompletedTasks)}
                />
                <div className="task-view-toggle" aria-label="待办样式">
                  <Button
                    className={taskViewMode === "list" ? "is-active" : ""}
                    icon={<ListTodo size={14} />}
                    size="small"
                    type={taskViewMode === "list" ? "primary" : "text"}
                    onClick={() => setTaskViewMode("list")}
                  >
                    列表
                  </Button>
                  <Button
                    className={taskViewMode === "quadrant" ? "is-active" : ""}
                    icon={<LayoutGrid size={14} />}
                    size="small"
                    type={taskViewMode === "quadrant" ? "primary" : "text"}
                    onClick={() => setTaskViewMode("quadrant")}
                  >
                    四象限
                  </Button>
                </div>
                <Button className="primary-button" icon={<Plus size={14} />} size="small" type="primary" onClick={() => setTaskCreateOpen(true)}>
                  新增
                </Button>
              </>
            ) : (
              null
            )}
          </div>
        </header>

        {message ? <div className="inline-alert">{message}</div> : null}
        {loading && !entryLoading ? <div className="inline-muted">加载中...</div> : null}

        {activeView === "tasks" ? (
          <TaskPanel
            createOpen={taskCreateOpen}
            showCompletedTasks={showCompletedTasks}
            tasks={tasks}
            viewMode={taskViewMode}
            onChanged={loadAppData}
            onCreateOpenChange={setTaskCreateOpen}
          />
        ) : null}
        {activeView === "calendar" ? (
          <CalendarView onChanged={loadAppData} />
        ) : null}
        {activeView === "pomodoro" ? (
          <PomodoroView tasks={openTasks} onChanged={loadAppData} />
        ) : null}
        {activeView === "profile" ? (
          <ProfileCenter
            user={user}
            footerType={footerType}
            footerVisible={footerVisible}
            themeId={themeId}
            titleColor={titleColor}
            onFooterTypeChanged={handleFooterTypeChanged}
            onFooterVisibleChanged={handleFooterVisibleChanged}
            onPasswordChanged={handlePasswordChanged}
            onTitleColorChanged={handleTitleColorChanged}
            onThemeChanged={handleThemeChanged}
            onUserChanged={handleUserChanged}
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
