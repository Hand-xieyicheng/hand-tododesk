import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent } from "react";
import { defaultAppFeatureFlags, defaultThemeId, defaultVisibleSidebarModules, normalizeThemeId, sortTasksForDisplay, taskDateFilterOptions, type ApiTask, type ApiThemePreference, type ApiUser, type AppBootstrapResponse, type AppCloseBehavior, type AppFeatureFlags, type DisplaySize, type FloatingCardThemeId, type FontFamily, type FooterType as AppFooterType, type SidebarModule, type TaskCardDisplayMode, type TaskDateFilter, type TaskViewMode, type ThemeId, type TitleColor } from "@todo/shared";
import { Button, Footer, Loading, Select, Title, Tooltip } from "animal-island-ui";
import { Bell, CalendarDays, CheckSquare2, Clock3, Eye, EyeOff, Flame, Hourglass, Kanban, LayoutGrid, List, ListTodo, LogOut, NotebookPen, Pin, Plus, Printer, RefreshCw, Tags, UserRound } from "lucide-react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { api, ApiError, authSessionExpiredEvent } from "./api/client";
import { AuthView } from "./components/AuthView";
import { AnniversaryPanel } from "./components/AnniversaryPanel";
import { CalendarView } from "./components/CalendarView";
import { HabitPanel } from "./components/HabitPanel";
import { LandingPage } from "./components/LandingPage";
import { MemoPanel } from "./components/MemoPanel";
import { PomodoroView } from "./components/PomodoroView";
import { PrintShareDialog } from "./components/PrintShareDialog";
import { ProfileCenter } from "./components/ProfileCenter";
import { ResetPasswordView } from "./components/ResetPasswordView";
import { SidebarLogo } from "./components/SidebarLogo";
import { TaskPanel } from "./components/TaskPanel";
import { applyDisplaySize, normalizeDisplaySize } from "./lib/displaySize";
import { emitDesktopSyncEvent, listenDesktopSyncEvents } from "./lib/desktopSync";
import { defaultFloatingCardThemeId } from "./lib/floatingCardThemes";
import { applyFontFamily, normalizeFontFamily } from "./lib/fonts";
import { applyTheme } from "./lib/themes";
import { clearSession, getSavedUser, saveUser } from "./lib/authStorage";
import { useAppUpdater } from "./lib/useAppUpdater";
import { compareVersions } from "./lib/version";
import { getViewTitleSize } from "./lib/viewTitleSize";
import { useTaskBoardStore } from "./stores/taskBoardStore";

type View = SidebarModule | "profile";

const viewRoutes: Record<View, string> = {
  tasks: "/tasks",
  memos: "/memos",
  anniversaries: "/anniversaries",
  habits: "/habits",
  calendar: "/calendar",
  pomodoro: "/pomodoro",
  profile: "/profile"
};

const navItems: Array<{ id: SidebarModule; label: string; icon: typeof CheckSquare2 }> = [
  { id: "tasks", label: "待办事项", icon: CheckSquare2 },
  { id: "memos", label: "备忘录", icon: NotebookPen },
  { id: "anniversaries", label: "倒数纪念日", icon: Hourglass },
  { id: "habits", label: "习惯打卡", icon: Flame },
  { id: "calendar", label: "日历", icon: CalendarDays },
  { id: "pomodoro", label: "番茄时钟", icon: Clock3 }
];

const defaultThemePreference: ApiThemePreference = {
  themeId: defaultThemeId,
  titleColor: "app-teal",
  footerVisible: true,
  footerType: "sea",
  printButtonEnabled: false,
  floatingCardHabitCheckInEnabled: true,
  showCompletedTasks: true,
  taskViewMode: "list",
  taskCardDisplayMode: "full",
  floatingCardThemeId: defaultFloatingCardThemeId,
  floatingCardViewMode: "list",
  appCloseBehavior: "hide",
  displaySize: "default",
  visibleSidebarModules: defaultVisibleSidebarModules,
  sidebarCollapsed: false,
  fontFamily: "system"
};

const allTagsFilterValue = "__all__";
const untaggedTagsFilterValue = "__untagged__";
const authRoute = "/auth";
const profileSyncSuccessNoticeSeconds = 5;

interface AppMessage {
  id: number;
  text: string;
  countdownSeconds?: number;
}

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

function getSavedSidebarCollapsed() {
  return localStorage.getItem("tododesk.sidebarCollapsed") === "true";
}

function isTauriDesktopRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function isMacosDesktopRuntime() {
  if (!isTauriDesktopRuntime()) {
    return false;
  }

  const platform = navigator.platform.toLowerCase();
  const userAgent = navigator.userAgent.toLowerCase();
  return platform.includes("mac") || userAgent.includes("mac os x");
}

function viewFromPathname(pathname: string): View {
  const normalizedPathname = pathname.replace(/\/+$/, "") || "/";
  if (normalizedPathname === viewRoutes.calendar) {
    return "calendar";
  }
  if (normalizedPathname === viewRoutes.memos) {
    return "memos";
  }
  if (normalizedPathname === viewRoutes.anniversaries) {
    return "anniversaries";
  }
  if (normalizedPathname === viewRoutes.habits) {
    return "habits";
  }
  if (normalizedPathname === viewRoutes.pomodoro) {
    return "pomodoro";
  }
  if (normalizedPathname === viewRoutes.profile) {
    return "profile";
  }
  return "tasks";
}

function taskMatchesPrintTagFilter(task: ApiTask, filter: string) {
  if (filter === allTagsFilterValue) {
    return true;
  }
  if (filter === untaggedTagsFilterValue) {
    return task.tags.length === 0;
  }
  return task.tags.some((tag) => tag.id === filter);
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
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState<ApiUser | null>(() => getSavedUser());
  const tasks = useTaskBoardStore((state) => state.tasks);
  const tags = useTaskBoardStore((state) => state.tags);
  const resetTaskBoard = useTaskBoardStore((state) => state.reset);
  const setTaskSnapshot = useTaskBoardStore((state) => state.setSnapshot);
  const [taskDateFilter, setTaskDateFilter] = useState<TaskDateFilter>("all");
  const [taskTagFilter, setTaskTagFilter] = useState(allTagsFilterValue);
  const [taskTagMaintenanceOpen, setTaskTagMaintenanceOpen] = useState(false);
  const [appBootstrap, setAppBootstrap] = useState<AppBootstrapResponse | null>(null);
  const [taskViewMode, setTaskViewMode] = useState<TaskViewMode>("list");
  const [taskCreateOpen, setTaskCreateOpen] = useState(false);
  const [anniversaryCreateOpen, setAnniversaryCreateOpen] = useState(false);
  const [habitCreateOpen, setHabitCreateOpen] = useState(false);
  const [habitDetailOpen, setHabitDetailOpen] = useState(false);
  const [habitReturnToListSignal, setHabitReturnToListSignal] = useState(0);
  const [habitShowArchived, setHabitShowArchived] = useState(false);
  const [themeId, setThemeId] = useState<ThemeId>(() => normalizeThemeId(localStorage.getItem("tododesk.theme")));
  const [titleColor, setTitleColor] = useState<TitleColor>("app-teal");
  const [footerVisible, setFooterVisible] = useState(true);
  const [footerType, setFooterType] = useState<AppFooterType>("sea");
  const [printButtonEnabled, setPrintButtonEnabled] = useState(false);
  const [floatingCardHabitCheckInEnabled, setFloatingCardHabitCheckInEnabled] = useState(true);
  const [taskPrintDialogOpen, setTaskPrintDialogOpen] = useState(false);
  const [showCompletedTasks, setShowCompletedTasks] = useState(true);
  const [taskCardDisplayMode, setTaskCardDisplayMode] = useState<TaskCardDisplayMode>("full");
  const [floatingCardThemeId, setFloatingCardThemeId] = useState<FloatingCardThemeId>(defaultFloatingCardThemeId);
  const [appCloseBehavior, setAppCloseBehavior] = useState<AppCloseBehavior>("hide");
  const [displaySize, setDisplaySize] = useState<DisplaySize>(() => normalizeDisplaySize(localStorage.getItem("tododesk.displaySize")));
  const [visibleSidebarModules, setVisibleSidebarModules] = useState<SidebarModule[]>(defaultVisibleSidebarModules);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => getSavedSidebarCollapsed());
  const [fontFamily, setFontFamily] = useState<FontFamily>(() => normalizeFontFamily(localStorage.getItem("tododesk.fontFamily")));
  const [message, setAppMessage] = useState<AppMessage | null>(null);
  const messageIdRef = useRef(0);
  const [loading, setLoading] = useState(false);
  const [entryLoading, setEntryLoading] = useState(false);
  const [showEntryLoading, setShowEntryLoading] = useState(false);
  const [profileSyncing, setProfileSyncing] = useState(false);
  const updater = useAppUpdater();

  const setMessage = useCallback((text: string) => {
    setAppMessage(text ? { id: messageIdRef.current += 1, text } : null);
  }, []);

  const setCountdownMessage = useCallback((text: string, seconds: number) => {
    setAppMessage({ id: messageIdRef.current += 1, text, countdownSeconds: seconds });
  }, []);

  const activeView = viewFromPathname(location.pathname);
  const featureFlags: AppFeatureFlags = appBootstrap?.featureFlags ?? defaultAppFeatureFlags;
  const availableNavItems = useMemo(() => navItems.filter((item) => (
    (item.id !== "calendar" || featureFlags.calendar) &&
    (item.id !== "anniversaries" || featureFlags.anniversaries) &&
    (item.id !== "habits" || featureFlags.habits) &&
    (item.id !== "pomodoro" || featureFlags.pomodoro)
  )), [featureFlags.anniversaries, featureFlags.calendar, featureFlags.habits, featureFlags.pomodoro]);
  const taskTagFilterOptions = useMemo(() => [
    { key: allTagsFilterValue, label: "全部标签" },
    { key: untaggedTagsFilterValue, label: "无标签" },
    ...tags.map((tag) => ({ key: tag.id, label: tag.name }))
  ], [tags]);
  const visibleNavItems = useMemo(() => {
    const availableItemMap = new Map(availableNavItems.map((item) => [item.id, item]));
    return visibleSidebarModules
      .map((module) => availableItemMap.get(module))
      .filter((item): item is typeof availableNavItems[number] => Boolean(item));
  }, [availableNavItems, visibleSidebarModules]);
  const sidebarModuleOptions = useMemo(() => (
    availableNavItems.map((item) => ({ id: item.id, label: item.label }))
  ), [availableNavItems]);
  const openTasks = useMemo(() => tasks.filter((task) => task.status !== "COMPLETED"), [tasks]);
  const userDisplayName = user?.name || user?.email || "";
  const userInitial = userDisplayName.trim().slice(0, 1).toUpperCase();
  const viewTitle = activeView === "tasks"
      ? "待办事项"
      : activeView === "memos"
        ? "备忘录"
        : activeView === "anniversaries"
          ? "倒数纪念日"
          : activeView === "habits"
            ? "习惯打卡"
            : activeView === "calendar"
              ? "日历模式"
              : activeView === "pomodoro" ? "番茄时钟" : "个人中心";
  const viewTitleSize = getViewTitleSize(displaySize);
  const workspaceStyle = {
    "--workspace-footer-height": footerVisible ? (footerType === "sea" ? "var(--app-footer-height-sea)" : "var(--app-footer-height-tree)") : "0px",
    "--workspace-footer-gap": footerVisible ? "var(--app-footer-gap)" : "0px"
  } as CSSProperties;
  const appShellClassName = `app-shell${sidebarCollapsed ? " is-sidebar-collapsed" : ""}${isMacosDesktopRuntime() ? " is-macos-desktop" : ""}`;
  const effectiveTaskViewMode: TaskViewMode = featureFlags.taskQuadrant ? taskViewMode : "list";
  const taskPrintTagFilter = effectiveTaskViewMode === "kanban" ? allTagsFilterValue : taskTagFilter;
  const taskPrintPreviewTasks = useMemo(
    () => sortTasksForDisplay(
      tasks
        .filter((task) => task.status !== "COMPLETED")
        .filter((task) => taskMatchesPrintTagFilter(task, taskPrintTagFilter))
    ),
    [taskPrintTagFilter, tasks]
  );
  const showCompletedTasksAction = showCompletedTasks ? "隐藏已完成事项" : "显示已完成事项";
  const showArchivedHabitsAction = habitShowArchived ? "隐藏归档" : "显示归档";
  const sidebarToggleAction = sidebarCollapsed ? "展开侧边栏" : "收起侧边栏";
  const updateRequired = appBootstrap ? compareVersions(updater.currentVersion, appBootstrap.desktop.minimumVersion) < 0 : false;
  const forcedUpdateMessage = updateRequired
    ? `当前版本 ${updater.currentVersion} 低于最低支持版本 ${appBootstrap?.desktop.minimumVersion}，请尽快更新。`
    : "";
  const unauthenticatedEntryPath = isTauriDesktopRuntime() ? authRoute : "/";

  const navigateToView = useCallback((view: View, replace = false) => {
    navigate(viewRoutes[view], { replace });
  }, [navigate]);

  const navigateToUnauthenticatedEntry = useCallback((replace = false) => {
    navigate(isTauriDesktopRuntime() ? authRoute : "/", { replace });
  }, [navigate]);

  function applyThemePreference(preference: ApiThemePreference) {
    const nextThemeId = normalizeThemeId(preference.themeId);
    const nextDisplaySize = normalizeDisplaySize(preference.displaySize);
    const nextFontFamily = normalizeFontFamily(preference.fontFamily);

    setThemeId(nextThemeId);
    setTitleColor(preference.titleColor);
    setFooterVisible(preference.footerVisible);
    setFooterType(preference.footerType);
    setPrintButtonEnabled(preference.printButtonEnabled);
    setFloatingCardHabitCheckInEnabled(preference.floatingCardHabitCheckInEnabled);
    setShowCompletedTasks(preference.showCompletedTasks);
    setTaskViewMode(preference.taskViewMode);
    setTaskCardDisplayMode(preference.taskCardDisplayMode);
    setFloatingCardThemeId(preference.floatingCardThemeId);
    setAppCloseBehavior(preference.appCloseBehavior);
    setDisplaySize(nextDisplaySize);
    setVisibleSidebarModules(preference.visibleSidebarModules ?? defaultVisibleSidebarModules);
    setSidebarCollapsed(preference.sidebarCollapsed ?? false);
    setFontFamily(nextFontFamily);
    localStorage.setItem("tododesk.theme", nextThemeId);
    localStorage.setItem("tododesk.displaySize", nextDisplaySize);
    localStorage.setItem("tododesk.sidebarCollapsed", String(preference.sidebarCollapsed ?? false));
    localStorage.setItem("tododesk.fontFamily", nextFontFamily);
    applyTheme(nextThemeId);
    applyDisplaySize(nextDisplaySize);
    applyFontFamily(nextFontFamily);
    void syncNativeAppCloseBehavior(preference.appCloseBehavior);
  }

  async function syncNativeAppCloseBehavior(next: AppCloseBehavior) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("set_app_close_behavior", { behavior: next });
    } catch {
      // Browser preview fallback.
    }
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
      const [taskPayload, tagPayload, preference, profile] = await Promise.all([
        api.tasks(),
        api.tags(),
        api.getThemePreference().catch(() => defaultThemePreference),
        api.currentUser()
      ]);
      setTaskSnapshot({
        tags: tagPayload.tags,
        tasks: taskPayload.tasks
      });
      setUser(profile.user);
      saveUser(profile.user);
      applyThemePreference(preference);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await clearSession();
        setUser(null);
        resetTaskBoard();
        setTaskTagFilter(allTagsFilterValue);
        navigateToUnauthenticatedEntry(true);
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
    function handleSessionExpired() {
      setUser(null);
      resetTaskBoard();
      setTaskTagFilter(allTagsFilterValue);
      navigateToUnauthenticatedEntry(true);
      setMessage("");
      setLoading(false);
      setEntryLoading(false);
    }

    window.addEventListener(authSessionExpiredEvent, handleSessionExpired);
    return () => window.removeEventListener(authSessionExpiredEvent, handleSessionExpired);
  }, [navigateToUnauthenticatedEntry, resetTaskBoard]);

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
    if (
      taskTagFilter !== allTagsFilterValue &&
      taskTagFilter !== untaggedTagsFilterValue &&
      !tags.some((tag) => tag.id === taskTagFilter)
    ) {
      setTaskTagFilter(allTagsFilterValue);
    }
  }, [tags, taskTagFilter]);

  useEffect(() => {
    if (
      (activeView === "anniversaries" && !featureFlags.anniversaries) ||
      (activeView === "habits" && !featureFlags.habits) ||
      (activeView === "calendar" && !featureFlags.calendar) ||
      (activeView === "pomodoro" && !featureFlags.pomodoro)
    ) {
      navigateToView("tasks", true);
    }
  }, [activeView, featureFlags.anniversaries, featureFlags.calendar, featureFlags.habits, featureFlags.pomodoro, navigateToView]);

  useEffect(() => {
    if (!featureFlags.taskQuadrant && taskViewMode !== "list") {
      setTaskViewMode("list");
    }
  }, [featureFlags.taskQuadrant, taskViewMode]);

  useEffect(() => {
    if (!user) {
      return;
    }

    return listenDesktopSyncEvents((event) => {
      if (event.type === "task:upserted") {
        useTaskBoardStore.getState().upsertTask(event.task);
        return;
      }
      if (event.type === "task:deleted") {
        useTaskBoardStore.getState().deleteTask(event.taskId);
        return;
      }
      if (event.type === "preference:changed") {
        applyThemePreference(event.preference);
        return;
      }
      if (event.type === "task-board:reload-requested") {
        void loadAppData();
      }
    });
  }, [user?.id]);

  useEffect(() => {
    if (entryLoading) {
      setShowEntryLoading(true);
      return;
    }

    const timeout = window.setTimeout(() => setShowEntryLoading(false), 460);
    return () => window.clearTimeout(timeout);
  }, [entryLoading]);

  useEffect(() => {
    if (!message?.countdownSeconds) {
      return;
    }

    const messageId = message.id;
    let nextCountdownSeconds = message.countdownSeconds;
    const interval = window.setInterval(() => {
      nextCountdownSeconds -= 1;
      setAppMessage((current) => {
        if (!current || current.id !== messageId) {
          return current;
        }
        if (nextCountdownSeconds <= 0) {
          return null;
        }
        return { ...current, countdownSeconds: nextCountdownSeconds };
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [message?.id]);

  async function handleAuthed(nextUser: ApiUser) {
    saveUser(nextUser);
    setUser(nextUser);
    navigateToView("tasks", true);
  }

  async function handleLogout() {
    await api.logout();
    setUser(null);
    resetTaskBoard();
    setTaskTagFilter(allTagsFilterValue);
    navigateToUnauthenticatedEntry(true);
  }

  function handleUserChanged(nextUser: ApiUser) {
    saveUser(nextUser);
    setUser(nextUser);
  }

  function handlePasswordChanged() {
    setUser(null);
    resetTaskBoard();
    setTaskTagFilter(allTagsFilterValue);
    navigateToUnauthenticatedEntry(true);
  }

  function handlePasswordResetCompleted() {
    setUser(null);
    resetTaskBoard();
    setTaskTagFilter(allTagsFilterValue);
  }

  function publishThemePreference(preference: ApiThemePreference) {
    applyThemePreference(preference);
    void emitDesktopSyncEvent({ type: "preference:changed", preference });
  }

  async function syncProfilePreferences() {
    if (!user || profileSyncing) {
      return;
    }

    setProfileSyncing(true);
    setMessage("");
    try {
      const [profile, preference] = await Promise.all([
        api.currentUser(),
        api.getThemePreference()
      ]);
      handleUserChanged(profile.user);
      publishThemePreference(preference);
      setCountdownMessage("多端配置已同步", profileSyncSuccessNoticeSeconds);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await clearSession();
        setUser(null);
        resetTaskBoard();
        setTaskTagFilter(allTagsFilterValue);
        navigateToUnauthenticatedEntry(true);
        return;
      }
      setMessage(error instanceof Error ? error.message : "同步配置失败");
    } finally {
      setProfileSyncing(false);
    }
  }

  function handleThemeChanged(next: ThemeId) {
    setThemeId(next);
    localStorage.setItem("tododesk.theme", next);
    void api.setThemePreference({ themeId: next })
      .then(publishThemePreference)
      .catch((error) => {
        setMessage(error instanceof Error ? error.message : "主题保存失败");
      });
  }

  function handleTitleColorChanged(next: TitleColor) {
    setTitleColor(next);
    void api.setThemePreference({ titleColor: next })
      .then(publishThemePreference)
      .catch((error) => {
        setMessage(error instanceof Error ? error.message : "标题颜色保存失败");
      });
  }

  function handleFooterVisibleChanged(next: boolean) {
    setFooterVisible(next);
    void api.setThemePreference({ footerVisible: next })
      .then(publishThemePreference)
      .catch((error) => {
        setMessage(error instanceof Error ? error.message : "Footer 显示配置保存失败");
      });
  }

  function handleFooterTypeChanged(next: AppFooterType) {
    setFooterType(next);
    void api.setThemePreference({ footerType: next })
      .then(publishThemePreference)
      .catch((error) => {
        setMessage(error instanceof Error ? error.message : "Footer 样式保存失败");
      });
  }

  function handlePrintButtonEnabledChanged(next: boolean) {
    const previous = printButtonEnabled;
    setPrintButtonEnabled(next);
    void api.setThemePreference({ printButtonEnabled: next })
      .then(publishThemePreference)
      .catch((error) => {
        setPrintButtonEnabled(previous);
        setMessage(error instanceof Error ? error.message : "便签打印配置保存失败");
      });
  }

  function handleFloatingCardHabitCheckInEnabledChanged(next: boolean) {
    const previous = floatingCardHabitCheckInEnabled;
    setFloatingCardHabitCheckInEnabled(next);
    void api.setThemePreference({ floatingCardHabitCheckInEnabled: next })
      .then(publishThemePreference)
      .catch((error) => {
        setFloatingCardHabitCheckInEnabled(previous);
        setMessage(error instanceof Error ? error.message : "固定卡片习惯打卡配置保存失败");
      });
  }

  function handleShowCompletedTasksChanged(next: boolean) {
    setShowCompletedTasks(next);
    void api.setThemePreference({ showCompletedTasks: next })
      .then(publishThemePreference)
      .catch((error) => {
        setShowCompletedTasks(!next);
        setMessage(error instanceof Error ? error.message : "待办显示配置保存失败");
      });
  }

  function handleTaskViewModeChanged(next: TaskViewMode) {
    setTaskViewMode(next);
    void api.setThemePreference({ taskViewMode: next })
      .then(publishThemePreference)
      .catch((error) => {
        setMessage(error instanceof Error ? error.message : "待办样式配置保存失败");
      });
  }

  function handleTaskCardDisplayModeChanged(next: TaskCardDisplayMode) {
    const previous = taskCardDisplayMode;
    setTaskCardDisplayMode(next);
    void api.setThemePreference({ taskCardDisplayMode: next })
      .then(publishThemePreference)
      .catch((error) => {
        setTaskCardDisplayMode(previous);
        setMessage(error instanceof Error ? error.message : "待办事项卡片显示配置保存失败");
      });
  }

  function handleFloatingCardThemeChanged(next: FloatingCardThemeId) {
    const previous = floatingCardThemeId;
    setFloatingCardThemeId(next);
    void api.setThemePreference({ floatingCardThemeId: next })
      .then(publishThemePreference)
      .catch((error) => {
        setFloatingCardThemeId(previous);
        setMessage(error instanceof Error ? error.message : "固定卡片主题保存失败");
      });
  }

  function handleAppCloseBehaviorChanged(next: AppCloseBehavior) {
    const previous = appCloseBehavior;
    setAppCloseBehavior(next);
    void syncNativeAppCloseBehavior(next);
    void api.setThemePreference({ appCloseBehavior: next })
      .then(publishThemePreference)
      .catch((error) => {
        setAppCloseBehavior(previous);
        void syncNativeAppCloseBehavior(previous);
        setMessage(error instanceof Error ? error.message : "关闭应用配置保存失败");
      });
  }

  function handleDisplaySizeChanged(next: DisplaySize) {
    setDisplaySize(next);
    localStorage.setItem("tododesk.displaySize", next);
    applyDisplaySize(next);
    void api.setThemePreference({ displaySize: next })
      .then(publishThemePreference)
      .catch((error) => {
        setMessage(error instanceof Error ? error.message : "界面显示大小保存失败");
      });
  }

  function handleVisibleSidebarModulesChanged(next: SidebarModule[]) {
    const previous = visibleSidebarModules;
    setVisibleSidebarModules(next);
    void api.setThemePreference({ visibleSidebarModules: next })
      .then(publishThemePreference)
      .catch((error) => {
        setVisibleSidebarModules(previous);
        setMessage(error instanceof Error ? error.message : "显示模块配置保存失败");
      });
  }

  function handleSidebarCollapsedChanged(next: boolean) {
    const previous = sidebarCollapsed;
    setSidebarCollapsed(next);
    localStorage.setItem("tododesk.sidebarCollapsed", String(next));
    void api.setThemePreference({ sidebarCollapsed: next })
      .then(publishThemePreference)
      .catch((error) => {
        setSidebarCollapsed(previous);
        localStorage.setItem("tododesk.sidebarCollapsed", String(previous));
        setMessage(error instanceof Error ? error.message : "侧边栏配置保存失败");
      });
  }

  function handleFontFamilyChanged(next: FontFamily) {
    const previous = fontFamily;
    const normalized = applyFontFamily(next);
    setFontFamily(normalized);
    localStorage.setItem("tododesk.fontFamily", normalized);
    void api.setThemePreference({ fontFamily: normalized })
      .then(publishThemePreference)
      .catch((error) => {
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

  if (location.pathname === "/reset-password") {
    return (
      <Routes>
        <Route path="/reset-password" element={<ResetPasswordView onSessionCleared={handlePasswordResetCompleted} />} />
        <Route path="*" element={<Navigate to="/reset-password" replace />} />
      </Routes>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/" element={isTauriDesktopRuntime() ? <Navigate to={authRoute} replace /> : <LandingPage />} />
        <Route path={authRoute} element={<AuthView onAuthed={handleAuthed} />} />
        <Route path="/register" element={<AuthView initialMode="register" onAuthed={handleAuthed} />} />
        <Route path="/reset-password" element={<ResetPasswordView onSessionCleared={handlePasswordResetCompleted} />} />
        <Route path="*" element={<Navigate to={unauthenticatedEntryPath} replace />} />
      </Routes>
    );
  }

  return (
    <div className={appShellClassName}>
      <div
        aria-hidden="true"
        className="window-drag-strip"
        data-tauri-drag-region=""
        onPointerDown={startWindowDrag}
      />
      <aside className="sidebar">
        <div className="brand-block app-brand app-drag-region" onPointerDown={startWindowDrag}>
          <button
            aria-expanded={!sidebarCollapsed}
            aria-label={sidebarToggleAction}
            className="sidebar-brand-button"
            type="button"
            onClick={() => handleSidebarCollapsedChanged(!sidebarCollapsed)}
          >
            <SidebarLogo className="sidebar-brand-logo" />
          </button>
        </div>

        <nav className="nav-list" aria-label="主要导航">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            const button = (
              <Button
                block
                aria-label={item.label}
                aria-current={isActive ? "page" : undefined}
                className={isActive ? "nav-button is-active" : "nav-button"}
                onClick={() => navigateToView(item.id)}
                type="text"
              >
                <span className="nav-button-icon" aria-hidden="true">
                  <Icon size={18} />
                </span>
                <span className="nav-button-label">{item.label}</span>
              </Button>
            );
            return sidebarCollapsed ? (
              <Tooltip className="sidebar-nav-tooltip" key={item.id} placement="right" title={item.label} trigger="hover" variant="default">
                <span className="sidebar-tooltip-target">{button}</span>
              </Tooltip>
            ) : (
              <span className="sidebar-tooltip-target" key={item.id}>{button}</span>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="user-menu">
            <button className={activeView === "profile" ? "sidebar-user-card is-active" : "sidebar-user-card"} type="button" aria-haspopup="menu" aria-label={`打开个人中心：${userDisplayName}`} title={sidebarCollapsed ? userDisplayName : undefined} onClick={() => navigateToView("profile")}>
              <span className="sidebar-user-avatar">
                {user.avatarUrl ? <img src={user.avatarUrl} alt={userDisplayName} /> : <span>{userInitial}</span>}
              </span>
              <span className="sidebar-user-copy">
                <strong>{userDisplayName}</strong>
                <span>{user.email}</span>
              </span>
            </button>
            <div className="user-menu-panel" role="menu">
              <Button className="ghost-button" icon={<UserRound size={16} />} type="default" onClick={() => navigateToView("profile")}>
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

        <header className="topbar app-drag-region" aria-busy={loading && !entryLoading} onPointerDown={startWindowDrag}>
          <div>
            <Title className="view-title" color={titleColor} size={viewTitleSize}>
              {viewTitle}
            </Title>
          </div>
          <div className="topbar-actions">
            {activeView === "tasks" || activeView === "calendar" || activeView === "pomodoro" ? (
              <span className="status-pill"><Bell size={14} /> {openTasks.length} 个未完成</span>
            ) : null}
            {activeView === "tasks" ? (
              <label className="topbar-date-filter">
                <span>日期</span>
                <Select aria-label="日期" value={taskDateFilter} onChange={(next) => setTaskDateFilter(next as TaskDateFilter)} options={taskDateFilterOptions} />
              </label>
            ) : null}
            {activeView === "profile" ? (
              <Button
                className="primary-button"
                disabled={profileSyncing}
                icon={<RefreshCw size={14} />}
                loading={profileSyncing}
                size="small"
                type="default"
                onClick={() => void syncProfilePreferences()}
              >
                同步配置
              </Button>
            ) : null}
            {activeView === "tasks" ? (
              <>
                {effectiveTaskViewMode === "kanban" ? null : (
                  <label className="topbar-tag-filter">
                    <span>标签</span>
                    <Select value={taskTagFilter} onChange={setTaskTagFilter} options={taskTagFilterOptions} />
                  </label>
                )}
                <Button className="task-tag-maintenance-button" icon={<Tags size={14} />} size="small" type="default" onClick={() => setTaskTagMaintenanceOpen(true)}>
                  标签维护
                </Button>
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
                    <Button
                      className={taskViewMode === "kanban" ? "is-active" : ""}
                      icon={<Kanban size={14} />}
                      size="small"
                      type={taskViewMode === "kanban" ? "primary" : "text"}
                      onClick={() => handleTaskViewModeChanged("kanban")}
                    >
                      看板
                    </Button>
                  </div>
                ) : null}
                {printButtonEnabled ? (
                  <Button aria-label="便签打印" className="task-print-button" icon={<Printer size={14} />} size="small" type="default" onClick={() => setTaskPrintDialogOpen(true)}>
                    打印
                  </Button>
                ) : null}
                <Button className="primary-button" icon={<Plus size={14} />} size="small" type="default" onClick={() => setTaskCreateOpen(true)}>
                  新增
                </Button>
              </>
            ) : (
              activeView === "anniversaries" ? (
                <Button className="primary-button" icon={<Plus size={14} />} size="small" type="default" onClick={() => setAnniversaryCreateOpen(true)}>
                  新增
                </Button>
              ) : activeView === "habits" ? (
                <>
                  <Button
                    aria-label={showArchivedHabitsAction}
                    className={`habit-archive-toggle${habitShowArchived ? " is-active" : ""}`}
                    icon={habitShowArchived ? <EyeOff size={14} /> : <Eye size={14} />}
                    size="small"
                    type={habitShowArchived ? "primary" : "text"}
                    onClick={() => setHabitShowArchived((showArchived) => !showArchived)}
                  >
                    {showArchivedHabitsAction}
                  </Button>
                  {habitDetailOpen ? (
                    <Tooltip className="habit-list-return-tooltip" placement="bottom" title="返回习惯列表" trigger="hover" variant="default">
                      <Button
                        aria-label="返回习惯列表"
                        className="habit-list-return"
                        icon={<List size={14} />}
                        size="small"
                        type="default"
                        onClick={() => setHabitReturnToListSignal((signal) => signal + 1)}
                      />
                    </Tooltip>
                  ) : null}
                  <Button className="primary-button" icon={<Plus size={14} />} size="small" type="default" onClick={() => setHabitCreateOpen(true)}>
                    新增
                  </Button>
                </>
              ) : null
            )}
          </div>
        </header>

        {forcedUpdateMessage ? <div className="inline-alert">{forcedUpdateMessage}</div> : null}
        {message ? (
          <div className="inline-alert app-message-alert" role="status">
            <span className="app-message-text">{message.text}</span>
            {message.countdownSeconds ? (
              <span className="app-message-countdown">{message.countdownSeconds}秒后关闭</span>
            ) : null}
          </div>
        ) : null}

        <Routes>
          <Route path="/" element={<Navigate to={viewRoutes.tasks} replace />} />
          <Route
            path={viewRoutes.tasks}
            element={(
              <TaskPanel
                createOpen={taskCreateOpen}
                showCompletedTasks={showCompletedTasks}
                tags={tags}
                taskCardDisplayMode={taskCardDisplayMode}
                tagMaintenanceOpen={taskTagMaintenanceOpen}
                taskDateFilter={taskDateFilter}
                taskTagFilter={taskTagFilter}
                tasks={tasks}
                viewMode={effectiveTaskViewMode}
                onChanged={loadAppData}
                onCreateOpenChange={setTaskCreateOpen}
                onPanelMessageChange={setMessage}
                onTagMaintenanceOpenChange={setTaskTagMaintenanceOpen}
              />
            )}
          />
          <Route path={viewRoutes.memos} element={<MemoPanel printButtonEnabled={printButtonEnabled} />} />
          <Route
            path={viewRoutes.anniversaries}
            element={featureFlags.anniversaries ? <AnniversaryPanel createOpen={anniversaryCreateOpen} onCreateOpenChange={setAnniversaryCreateOpen} /> : <Navigate to={viewRoutes.tasks} replace />}
          />
          <Route
            path={viewRoutes.habits}
            element={featureFlags.habits ? (
              <HabitPanel
                createOpen={habitCreateOpen}
                returnToListSignal={habitReturnToListSignal}
                showArchived={habitShowArchived}
                onCreateOpenChange={setHabitCreateOpen}
                onDetailModeChange={setHabitDetailOpen}
              />
            ) : <Navigate to={viewRoutes.tasks} replace />}
          />
          <Route
            path={viewRoutes.calendar}
            element={featureFlags.calendar ? <CalendarView onChanged={loadAppData} /> : <Navigate to={viewRoutes.tasks} replace />}
          />
          <Route
            path={viewRoutes.pomodoro}
            element={featureFlags.pomodoro ? <PomodoroView tasks={openTasks} onChanged={loadAppData} /> : <Navigate to={viewRoutes.tasks} replace />}
          />
          <Route
            path={viewRoutes.profile}
            element={(
              <ProfileCenter
                user={user}
                footerType={footerType}
                footerVisible={footerVisible}
                floatingCardHabitCheckInEnabled={floatingCardHabitCheckInEnabled}
                floatingCardThemeId={floatingCardThemeId}
                appCloseBehavior={appCloseBehavior}
                displaySize={displaySize}
                fontFamily={fontFamily}
                printButtonEnabled={printButtonEnabled}
                sidebarModuleOptions={sidebarModuleOptions}
                themeId={themeId}
                titleColor={titleColor}
                visibleSidebarModules={visibleSidebarModules}
                onDisplaySizeChanged={handleDisplaySizeChanged}
                onFontFamilyChanged={handleFontFamilyChanged}
                onFooterTypeChanged={handleFooterTypeChanged}
                onFooterVisibleChanged={handleFooterVisibleChanged}
                onFloatingCardHabitCheckInEnabledChanged={handleFloatingCardHabitCheckInEnabledChanged}
                onFloatingCardThemeChanged={handleFloatingCardThemeChanged}
                onAppCloseBehaviorChanged={handleAppCloseBehaviorChanged}
                onPasswordChanged={handlePasswordChanged}
                onPrintButtonEnabledChanged={handlePrintButtonEnabledChanged}
                onTaskCardDisplayModeChanged={handleTaskCardDisplayModeChanged}
                onTitleColorChanged={handleTitleColorChanged}
                onThemeChanged={handleThemeChanged}
                onUserChanged={handleUserChanged}
                onVisibleSidebarModulesChanged={handleVisibleSidebarModulesChanged}
                appBootstrap={appBootstrap}
                taskCardDisplayMode={taskCardDisplayMode}
                updater={updater}
              />
            )}
          />
          <Route path="*" element={<Navigate to={viewRoutes.tasks} replace />} />
        </Routes>
        {printButtonEnabled ? (
          <PrintShareDialog
            open={taskPrintDialogOpen}
            preview={{ tasks: taskPrintPreviewTasks }}
            sourceType="tasks"
            source={{
              tagFilter: taskPrintTagFilter,
              showCompletedTasks: false,
              viewMode: effectiveTaskViewMode
            }}
            onClose={() => setTaskPrintDialogOpen(false)}
          />
        ) : null}
        {footerVisible ? (
          <div className="workspace-footer-decoration" aria-hidden="true">
            <Footer
              className="workspace-footer-art workspace-footer-art-seamless"
              type={footerType}
            />
          </div>
        ) : null}
      </main>
    </div>
  );
}
