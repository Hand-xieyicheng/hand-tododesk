import { useEffect, useMemo, useState } from "react";
import type { ApiTask, ApiUser, ThemeId } from "@todo/shared";
import { Button, Footer, Loading, Title } from "animal-island-ui";
import { Bell, CalendarDays, CheckSquare2, Clock3, LayoutGrid, ListTodo, LogOut, Palette, Pin, Plus } from "lucide-react";
import { api, ApiError } from "./api/client";
import { AuthView } from "./components/AuthView";
import { CalendarView } from "./components/CalendarView";
import { PomodoroView } from "./components/PomodoroView";
import { TaskPanel } from "./components/TaskPanel";
import { ThemeSettings } from "./components/ThemeSettings";
import todoDeskLogo from "./assets/tododesk-logo.png";
import { applyTheme } from "./lib/themes";
import { clearSession, getSavedUser, saveUser } from "./lib/authStorage";

type View = "tasks" | "calendar" | "pomodoro" | "themes";
type TaskViewMode = "list" | "quadrant";

const navItems: Array<{ id: View; label: string; icon: typeof CheckSquare2 }> = [
  { id: "tasks", label: "待办事项", icon: CheckSquare2 },
  { id: "calendar", label: "日历", icon: CalendarDays },
  { id: "pomodoro", label: "番茄时钟", icon: Clock3 },
  { id: "themes", label: "主题", icon: Palette }
];

export function App() {
  const [user, setUser] = useState<ApiUser | null>(() => getSavedUser());
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [activeView, setActiveView] = useState<View>("tasks");
  const [taskViewMode, setTaskViewMode] = useState<TaskViewMode>("list");
  const [taskCreateOpen, setTaskCreateOpen] = useState(false);
  const [themeId, setThemeId] = useState<ThemeId>("default");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [entryLoading, setEntryLoading] = useState(false);
  const [showEntryLoading, setShowEntryLoading] = useState(false);

  const openTasks = useMemo(() => tasks.filter((task) => task.status !== "COMPLETED"), [tasks]);

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
      const [taskPayload, preference] = await Promise.all([
        api.tasks(),
        api.getThemePreference().catch(() => ({ themeId: "default" }))
      ]);
      setTasks(taskPayload.tasks);
      setThemeId(preference.themeId as ThemeId);
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
  }

  async function handleLogout() {
    await api.logout();
    setUser(null);
    setTasks([]);
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
          <Button className="ghost-button" icon={<Pin size={16} />} type="default" onClick={() => openFloatingCard()}>
            桌面卡片
          </Button>
          <Button className="ghost-button" icon={<LogOut size={16} />} type="default" onClick={handleLogout}>
            退出
          </Button>
        </div>
      </aside>

      <main className="workspace">
        {showEntryLoading ? (
          <div className={entryLoading ? "app-loading-overlay is-active" : "app-loading-overlay is-closing"} aria-busy={entryLoading} aria-live="polite">
            <Loading active={entryLoading} className="app-loading-scene" />
            <div className="app-loading-label">登岛中...</div>
          </div>
        ) : null}

        <header className="topbar">
          <div>
            <Title className="view-title" size="large" color="app-teal">
              {activeView === "tasks" ? "待办事项" : activeView === "calendar" ? "日历模式" : activeView === "pomodoro" ? "番茄时钟" : "主题设定"}
            </Title>
          </div>
          <div className="topbar-actions">
            <span className="status-pill"><Bell size={14} /> {openTasks.length} 个未完成</span>
            {activeView === "tasks" ? (
              <>
                <div className="task-view-toggle" aria-label="待办样式">
                  <Button
                    className={taskViewMode === "list" ? "is-active" : ""}
                    icon={<ListTodo size={16} />}
                    size="small"
                    type={taskViewMode === "list" ? "primary" : "text"}
                    onClick={() => setTaskViewMode("list")}
                  >
                    列表
                  </Button>
                  <Button
                    className={taskViewMode === "quadrant" ? "is-active" : ""}
                    icon={<LayoutGrid size={16} />}
                    size="small"
                    type={taskViewMode === "quadrant" ? "primary" : "text"}
                    onClick={() => setTaskViewMode("quadrant")}
                  >
                    四象限
                  </Button>
                </div>
                <Button className="primary-button" icon={<Plus size={16} />} type="primary" onClick={() => setTaskCreateOpen(true)}>
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
        {activeView === "themes" ? (
          <ThemeSettings themeId={themeId} onThemeChanged={(next) => {
            setThemeId(next);
            localStorage.setItem("tododesk.theme", next);
            void api.setThemePreference(next);
          }} />
        ) : null}
        <div className="workspace-footer-decoration" aria-hidden="true">
          <Footer className="workspace-footer-art workspace-footer-art-seamless" type="sea" />
        </div>
      </main>
    </div>
  );
}
