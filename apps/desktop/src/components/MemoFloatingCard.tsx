import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ClipboardEvent } from "react";
import { defaultVisibleSidebarModules, type ApiMemo, type ApiThemePreference, type FloatingCardThemeId } from "@todo/shared";
import { Button, Card } from "animal-island-ui";
import { RefreshCw } from "lucide-react";
import { api } from "../api/client";
import { applyDisplaySize } from "../lib/displaySize";
import { defaultFloatingCardThemeId, getFloatingCardThemeStyle, normalizeFloatingCardThemeId } from "../lib/floatingCardThemes";
import { applyFontFamily } from "../lib/fonts";
import { isRichContentEmpty, sanitizeRichHtml } from "../lib/memoRichText";
import { applyTheme } from "../lib/themes";
import { FloatingWindowHeader } from "./FloatingWindowHeader";

const autosaveDelayMs = 1200;
const preferenceSyncIntervalMs = 5000;

type SaveState = "idle" | "saving" | "error";

const defaultThemePreference: ApiThemePreference = {
  themeId: "default",
  titleColor: "app-teal",
  footerVisible: true,
  footerType: "sea",
  showCompletedTasks: true,
  taskViewMode: "list",
  taskCardDisplayMode: "full",
  floatingCardThemeId: defaultFloatingCardThemeId,
  appCloseBehavior: "hide",
  displaySize: "default",
  visibleSidebarModules: defaultVisibleSidebarModules,
  sidebarCollapsed: false,
  fontFamily: "system"
};

function saveStateLabel(state: SaveState) {
  if (state === "saving") {
    return "保存中";
  }
  if (state === "error") {
    return "保存失败";
  }
  return "已保存";
}

interface MemoFloatingCardProps {
  memoId: string | null;
}

export function MemoFloatingCard({ memoId }: MemoFloatingCardProps) {
  const [memo, setMemo] = useState<ApiMemo | null>(null);
  const [title, setTitle] = useState("");
  const [contentHtml, setContentHtml] = useState("");
  const [floatingCardThemeId, setFloatingCardThemeId] = useState<FloatingCardThemeId>(() => normalizeFloatingCardThemeId(localStorage.getItem("tododesk.floatingCardThemeId")));
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const editorRef = useRef<HTMLDivElement | null>(null);
  const savedDraftRef = useRef({ title: "", contentHtml: "" });
  const titleRef = useRef("");
  const floatingCardStyle = useMemo(() => getFloatingCardThemeStyle(floatingCardThemeId) as CSSProperties, [floatingCardThemeId]);
  const hasDraftChanged = Boolean(memo) && (
    title !== savedDraftRef.current.title ||
    (editorRef.current?.innerHTML ?? contentHtml) !== savedDraftRef.current.contentHtml
  );

  function setEditorHtml(nextHtml: string) {
    if (editorRef.current && editorRef.current.innerHTML !== nextHtml) {
      editorRef.current.innerHTML = nextHtml;
    }
  }

  function hydrateMemo(nextMemo: ApiMemo) {
    setMemo(nextMemo);
    setTitle(nextMemo.title);
    setContentHtml(nextMemo.contentHtml);
    setEditorHtml(nextMemo.contentHtml);
    titleRef.current = nextMemo.title;
    savedDraftRef.current = {
      title: nextMemo.title,
      contentHtml: nextMemo.contentHtml
    };
    setSaveState("idle");
  }

  function applyThemePreference(preference: ApiThemePreference) {
    const nextFloatingCardThemeId = normalizeFloatingCardThemeId(preference.floatingCardThemeId);
    setFloatingCardThemeId(nextFloatingCardThemeId);
    localStorage.setItem("tododesk.theme", preference.themeId);
    localStorage.setItem("tododesk.displaySize", preference.displaySize);
    localStorage.setItem("tododesk.floatingCardThemeId", nextFloatingCardThemeId);
    localStorage.setItem("tododesk.fontFamily", preference.fontFamily);
    applyTheme(preference.themeId);
    applyDisplaySize(preference.displaySize);
    applyFontFamily(preference.fontFamily);
  }

  async function loadData(options: { silent?: boolean } = {}) {
    if (!memoId) {
      setMessage("缺少备忘录 ID");
      return;
    }

    if (!options.silent) {
      setLoading(true);
    }
    setMessage("");
    try {
      const [memoPayload, preference] = await Promise.all([
        api.memo(memoId),
        api.getThemePreference().catch(() => defaultThemePreference)
      ]);
      hydrateMemo(memoPayload.memo);
      applyThemePreference(preference);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "备忘录加载失败");
    } finally {
      if (!options.silent) {
        setLoading(false);
      }
    }
  }

  async function saveCurrentMemo() {
    if (!memo || !memoId) {
      return true;
    }

    const nextTitle = titleRef.current;
    const nextContentHtml = editorRef.current?.innerHTML ?? contentHtml;
    const changed = nextTitle !== savedDraftRef.current.title || nextContentHtml !== savedDraftRef.current.contentHtml;
    if (!changed) {
      return true;
    }

    setSaveState("saving");
    setMessage("");
    try {
      const payload = await api.updateMemo(memoId, {
        title: nextTitle,
        contentHtml: nextContentHtml
      });
      savedDraftRef.current = {
        title: nextTitle,
        contentHtml: nextContentHtml
      };
      setMemo({
        ...payload.memo,
        title: nextTitle,
        contentHtml: nextContentHtml
      });
      setSaveState("idle");
      return true;
    } catch (error) {
      setSaveState("error");
      setMessage(error instanceof Error ? error.message : "备忘录保存失败");
      return false;
    }
  }

  function changeTitle(nextTitle: string) {
    titleRef.current = nextTitle;
    setTitle(nextTitle);
  }

  function syncEditorContent() {
    const nextHtml = editorRef.current?.innerHTML ?? "";
    setContentHtml(nextHtml);
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    const pastedHtml = event.clipboardData.getData("text/html");
    if (!pastedHtml) {
      return;
    }

    event.preventDefault();
    document.execCommand("insertHTML", false, sanitizeRichHtml(pastedHtml));
    syncEditorContent();
  }

  async function refreshMemo() {
    if (!(await saveCurrentMemo())) {
      return;
    }
    await loadData();
  }

  useEffect(() => {
    applyTheme(localStorage.getItem("tododesk.theme") ?? defaultThemePreference.themeId);
    applyDisplaySize(localStorage.getItem("tododesk.displaySize") ?? defaultThemePreference.displaySize);
    applyFontFamily(localStorage.getItem("tododesk.fontFamily") ?? defaultThemePreference.fontFamily);
    void loadData();
  }, [memoId]);

  useLayoutEffect(() => {
    if (memo) {
      setEditorHtml(contentHtml);
    }
  }, [memo?.id, memo?.updatedAt, memo?.contentHtml]);

  useEffect(() => {
    let cancelled = false;
    const syncPreference = async () => {
      try {
        const preference = await api.getThemePreference();
        if (!cancelled) {
          applyThemePreference(preference);
        }
      } catch {
        // Background preference sync should not interrupt the memo card.
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
  }, []);

  useEffect(() => {
    if (!memo || !hasDraftChanged) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void saveCurrentMemo();
    }, autosaveDelayMs);
    return () => window.clearTimeout(timeout);
  }, [title, contentHtml, memoId]);

  return (
    <div className="floating-card memo-floating-card" style={floatingCardStyle}>
      <FloatingWindowHeader />
      <div className="floating-toolbar memo-floating-toolbar">
        <span className={`memo-floating-save-state memo-floating-save-state-${saveState}`}>
          {saveStateLabel(saveState)}
        </span>
        <Button
          aria-label="刷新备忘录"
          icon={<RefreshCw size={15} />}
          loading={loading}
          size="small"
          title="刷新备忘录"
          type="default"
          onClick={() => void refreshMemo()}
        />
      </div>
      <main className="memo-floating-main" aria-busy={loading}>
        {message ? <div className="inline-alert">{message}</div> : null}
        {memo ? (
          <>
            <input
              className="memo-floating-title-input"
              value={title}
              maxLength={160}
              aria-label="备忘录标题"
              onChange={(event) => changeTitle(event.target.value)}
            />
            <div
              ref={editorRef}
              aria-label="备忘录正文"
              className="memo-rich-editor memo-floating-editor"
              contentEditable
              data-empty={isRichContentEmpty(contentHtml)}
              data-placeholder="写下备忘录"
              role="textbox"
              suppressContentEditableWarning
              onBlur={syncEditorContent}
              onInput={syncEditorContent}
              onPaste={handlePaste}
            />
          </>
        ) : !loading ? (
          <Card className="empty-state memo-floating-empty" type="dashed">
            暂无备忘录
          </Card>
        ) : null}
      </main>
    </div>
  );
}
