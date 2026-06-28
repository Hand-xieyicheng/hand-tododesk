import { type ChangeEvent, type ClipboardEvent, type DragEvent, type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ApiMemo, ApiMemoListItem } from "@todo/shared";
import { Button, Card, Input } from "animal-island-ui";
import {
  Archive,
  ArchiveRestore,
  Bold,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  ImageIcon,
  Italic,
  List,
  ListOrdered,
  MonitorUp,
  Pin,
  PinOff,
  Plus,
  Printer,
  Quote,
  Search,
  Table2,
  Trash2,
  Underline
} from "lucide-react";
import { api } from "../api/client";
import { escapeHtml, isRichContentEmpty, sanitizeRichHtml } from "../lib/memoRichText";
import { ConfirmDialog } from "./ConfirmDialog";
import { PrintShareDialog } from "./PrintShareDialog";

const autosaveDelayMs = 1200;

type SaveState = "idle" | "saving" | "saved" | "error";

interface MemoPanelProps {
  printButtonEnabled?: boolean;
}

function memoToListItem(memo: ApiMemo): ApiMemoListItem {
  return {
    id: memo.id,
    title: memo.title,
    excerpt: memo.excerpt,
    isPinned: memo.isPinned,
    archivedAt: memo.archivedAt,
    createdAt: memo.createdAt,
    updatedAt: memo.updatedAt
  };
}

function formatMemoTime(value: string) {
  return new Date(value).toLocaleString([], {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function saveStateLabel(state: SaveState) {
  if (state === "error") {
    return "保存失败";
  }
  return "就绪";
}

function imageAltFromFile(file: File) {
  return file.name.replace(/\.[^.]+$/, "") || "图片";
}

function IconButtonTooltip({ children, label }: { children: ReactNode; label: string }) {
  return (
    <span className="icon-button-tooltip-trigger" data-tooltip={label}>
      {children}
      <span className="icon-button-tooltip-label" role="tooltip">{label}</span>
    </span>
  );
}

export function MemoPanel({ printButtonEnabled = false }: MemoPanelProps) {
  const [topbarActions, setTopbarActions] = useState<HTMLElement | null>(null);
  const [memos, setMemos] = useState<ApiMemoListItem[]>([]);
  const [selectedMemo, setSelectedMemo] = useState<ApiMemo | null>(null);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [title, setTitle] = useState("");
  const [contentHtml, setContentHtml] = useState("");
  const [isPinned, setIsPinned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const editorRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const savedSelectionRef = useRef<Range | null>(null);
  const savedDraftRef = useRef({ title: "", contentHtml: "", isPinned: false });
  const titleRef = useRef("");
  const isPinnedRef = useRef(false);
  const selectedMemoId = selectedMemo?.id ?? null;
  const pinActionLabel = isPinned ? "取消置顶" : "置顶";
  const archiveActionLabel = selectedMemo?.archivedAt ? "取消归档" : "归档";
  const deleteMemoTitle = title.trim() || selectedMemo?.title || "未命名备忘录";

  const pinnedMemos = useMemo(() => memos.filter((memo) => memo.isPinned), [memos]);
  const regularMemos = useMemo(() => memos.filter((memo) => !memo.isPinned), [memos]);
  const latestEditorHtml = editorRef.current?.innerHTML ?? contentHtml;
  const hasDraftChanged = selectedMemo
    ? title !== savedDraftRef.current.title ||
      latestEditorHtml !== savedDraftRef.current.contentHtml ||
      isPinned !== savedDraftRef.current.isPinned
    : false;

  function setEditorHtml(nextHtml: string) {
    if (editorRef.current && editorRef.current.innerHTML !== nextHtml) {
      editorRef.current.innerHTML = nextHtml;
    }
  }

  function hydrateMemo(memo: ApiMemo) {
    setSelectedMemo(memo);
    setTitle(memo.title);
    setContentHtml(memo.contentHtml);
    setEditorHtml(memo.contentHtml);
    setIsPinned(memo.isPinned);
    titleRef.current = memo.title;
    isPinnedRef.current = memo.isPinned;
    savedDraftRef.current = {
      title: memo.title,
      contentHtml: memo.contentHtml,
      isPinned: memo.isPinned
    };
    setSaveState("idle");
  }

  function clearSelectedMemo() {
    setSelectedMemo(null);
    setTitle("");
    setContentHtml("");
    setEditorHtml("");
    setIsPinned(false);
    titleRef.current = "";
    isPinnedRef.current = false;
    savedDraftRef.current = { title: "", contentHtml: "", isPinned: false };
    setSaveState("idle");
  }

  function upsertMemoListItem(memo: ApiMemo) {
    const nextItem = memoToListItem(memo);
    setMemos((current) => {
      const next = current.some((item) => item.id === nextItem.id)
        ? current.map((item) => item.id === nextItem.id ? nextItem : item)
        : [nextItem, ...current];
      return next.sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    });
  }

  function syncEditorContent() {
    const nextHtml = editorRef.current?.innerHTML ?? "";
    setContentHtml(nextHtml);
  }

  function changeTitle(nextTitle: string) {
    titleRef.current = nextTitle;
    setTitle(nextTitle);
  }

  function togglePinnedDraft() {
    setIsPinned((current) => {
      const next = !current;
      isPinnedRef.current = next;
      return next;
    });
  }

  function saveSelection() {
    const selection = window.getSelection();
    const editor = editorRef.current;
    if (!selection?.rangeCount || !editor) {
      return;
    }

    const range = selection.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer)) {
      savedSelectionRef.current = range.cloneRange();
    }
  }

  function placeCursorAtEnd() {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    savedSelectionRef.current = range.cloneRange();
  }

  function restoreSelection() {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    editor.focus();
    const selection = window.getSelection();
    selection?.removeAllRanges();

    const range = savedSelectionRef.current;
    if (range && editor.contains(range.commonAncestorContainer)) {
      selection?.addRange(range);
      return;
    }

    placeCursorAtEnd();
  }

  function insertRichHtml(html: string) {
    restoreSelection();
    document.execCommand("insertHTML", false, sanitizeRichHtml(html));
    syncEditorContent();
    saveSelection();
  }

  function runEditorCommand(command: string, value?: string) {
    restoreSelection();
    document.execCommand(command, false, value);
    syncEditorContent();
    saveSelection();
  }

  async function loadMemo(id: string) {
    setDetailLoading(true);
    setMessage("");
    try {
      const payload = await api.memo(id);
      hydrateMemo(payload.memo);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "备忘录加载失败");
    } finally {
      setDetailLoading(false);
    }
  }

  async function refreshList(preferredId = selectedMemoId) {
    setLoading(true);
    setMessage("");
    try {
      const payload = await api.memos(search, showArchived);
      setMemos(payload.memos);
      const nextId = preferredId && payload.memos.some((memo) => memo.id === preferredId)
        ? preferredId
        : payload.memos[0]?.id ?? null;

      if (nextId) {
        if (nextId !== selectedMemoId) {
          await loadMemo(nextId);
        }
      } else {
        clearSelectedMemo();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "备忘录列表加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function saveCurrentMemo() {
    if (!selectedMemo) {
      return true;
    }

    const nextTitle = titleRef.current;
    const nextContentHtml = editorRef.current?.innerHTML ?? contentHtml;
    const nextIsPinned = isPinnedRef.current;
    const changed = nextTitle !== savedDraftRef.current.title ||
      nextContentHtml !== savedDraftRef.current.contentHtml ||
      nextIsPinned !== savedDraftRef.current.isPinned;
    if (!changed) {
      return true;
    }

    try {
      const payload = await api.updateMemo(selectedMemo.id, {
        title: nextTitle,
        contentHtml: nextContentHtml,
        isPinned: nextIsPinned
      });
      savedDraftRef.current = {
        title: nextTitle,
        contentHtml: nextContentHtml,
        isPinned: nextIsPinned
      };
      setSelectedMemo((current) => current?.id === payload.memo.id ? {
        ...payload.memo,
        title: nextTitle,
        contentHtml: nextContentHtml,
        isPinned: nextIsPinned
      } : current);
      upsertMemoListItem(payload.memo);
      setSaveState("idle");
      return true;
    } catch (error) {
      setSaveState("error");
      setMessage(error instanceof Error ? error.message : "备忘录保存失败");
      return false;
    }
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => void refreshList(), 260);
    return () => window.clearTimeout(timeout);
  }, [search, showArchived]);

  useLayoutEffect(() => {
    setTopbarActions(document.querySelector<HTMLElement>(".topbar-actions"));
  }, []);

  useLayoutEffect(() => {
    if (selectedMemo) {
      setEditorHtml(contentHtml);
    }
  }, [selectedMemoId]);

  useEffect(() => {
    if (!selectedMemo || !hasDraftChanged) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void saveCurrentMemo();
    }, autosaveDelayMs);
    return () => window.clearTimeout(timeout);
  }, [title, contentHtml, isPinned, selectedMemoId]);

  async function createMemo() {
    if (!(await saveCurrentMemo())) {
      return;
    }

    setMessage("");
    try {
      const payload = await api.createMemo({ title: "未命名备忘录", contentHtml: "" });
      setShowArchived(false);
      upsertMemoListItem(payload.memo);
      hydrateMemo(payload.memo);
      window.requestAnimationFrame(() => {
        editorRef.current?.focus();
        placeCursorAtEnd();
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "备忘录创建失败");
    }
  }

  async function selectMemo(id: string) {
    if (id === selectedMemoId) {
      return;
    }
    if (!(await saveCurrentMemo())) {
      return;
    }
    await loadMemo(id);
  }

  async function toggleArchive() {
    if (!selectedMemo || !(await saveCurrentMemo())) {
      return;
    }

    try {
      const archived = !selectedMemo.archivedAt;
      const payload = await api.updateMemo(selectedMemo.id, { archived });
      if (archived !== showArchived) {
        await refreshList(null);
        return;
      }
      hydrateMemo(payload.memo);
      upsertMemoListItem(payload.memo);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "归档状态更新失败");
    }
  }

  async function openMemoFloatingCard() {
    if (!selectedMemo || !(await saveCurrentMemo())) {
      return;
    }

    const memoId = selectedMemo.id;
    const query = `/?window=memo&memoId=${encodeURIComponent(memoId)}`;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("open_memo_floating_card", { memoId });
    } catch {
      const child = window.open(query, `tododesk-memo-${memoId}`, "width=380,height=520");
      child?.focus?.();
    }
  }

  async function openMemoPrintDialog() {
    if (!selectedMemo || !(await saveCurrentMemo())) {
      return;
    }
    setPrintDialogOpen(true);
  }

  function requestDeleteMemo() {
    if (!selectedMemo || deleteBusy) {
      return;
    }

    setDeleteConfirmOpen(true);
  }

  function closeDeleteConfirm() {
    if (!deleteBusy) {
      setDeleteConfirmOpen(false);
    }
  }

  async function confirmDeleteMemo() {
    if (!selectedMemo || deleteBusy) {
      return;
    }

    const memoId = selectedMemo.id;
    setDeleteBusy(true);
    setMessage("");
    try {
      await api.deleteMemo(memoId);
      setDeleteConfirmOpen(false);
      await refreshList(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "备忘录删除失败");
    } finally {
      setDeleteBusy(false);
    }
  }

  async function uploadAndInsertImage(file: File) {
    if (!selectedMemo) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      setMessage("请选择图片文件");
      return;
    }

    setUploadBusy(true);
    setMessage("");
    try {
      const payload = await api.uploadMemoAsset(selectedMemo.id, file, file.name || "memo-image.png");
      const alt = escapeHtml(imageAltFromFile(file));
      insertRichHtml(`<figure><img src="${escapeHtml(payload.asset.url)}" alt="${alt}"><figcaption>${alt}</figcaption></figure><p><br></p>`);
      setSelectedMemo((current) => current ? { ...current, assets: [...current.assets, payload.asset] } : current);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "图片上传失败");
    } finally {
      setUploadBusy(false);
    }
  }

  function handleImageInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      void uploadAndInsertImage(file);
    }
    event.target.value = "";
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    const image = Array.from(event.clipboardData.files).find((file) => file.type.startsWith("image/"));
    if (image) {
      event.preventDefault();
      void uploadAndInsertImage(image);
      return;
    }

    const pastedHtml = event.clipboardData.getData("text/html");
    if (pastedHtml) {
      event.preventDefault();
      insertRichHtml(pastedHtml);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    const image = Array.from(event.dataTransfer.files).find((file) => file.type.startsWith("image/"));
    if (!image) {
      return;
    }

    event.preventDefault();
    saveSelection();
    void uploadAndInsertImage(image);
  }

  function renderMemoGroup(titleText: string, items: ApiMemoListItem[]) {
    if (items.length === 0) {
      return null;
    }

    return (
      <section className="memo-list-group" aria-label={titleText}>
        <span className="memo-list-heading">{titleText}</span>
        {items.map((memo) => (
          <button
            key={memo.id}
            className={memo.id === selectedMemoId ? "memo-list-item is-active" : "memo-list-item"}
            type="button"
            onClick={() => void selectMemo(memo.id)}
          >
            <span className="memo-list-title">
              {memo.isPinned ? <Pin size={13} aria-hidden="true" /> : null}
              <strong>{memo.title}</strong>
            </span>
            {memo.excerpt ? <span className="memo-list-excerpt">{memo.excerpt}</span> : null}
            <span className="memo-list-meta">{formatMemoTime(memo.updatedAt)}</span>
          </button>
        ))}
      </section>
    );
  }

  const topbarControls = (
    <div className="memo-topbar-actions" aria-label="备忘录操作">
      <Button
        className={showArchived ? "memo-topbar-button memo-filter-button is-active" : "memo-topbar-button memo-filter-button"}
        icon={showArchived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
        size="small"
        type={showArchived ? "primary" : "default"}
        onClick={() => setShowArchived((current) => !current)}
      >
        {showArchived ? "归档" : "当前"}
      </Button>
      {printButtonEnabled ? (
        <Button
          aria-label="便签打印"
          className="memo-topbar-button"
          disabled={!selectedMemo}
          icon={<Printer size={15} />}
          size="small"
          type="default"
          onClick={() => void openMemoPrintDialog()}
        />
      ) : null}
      <Button className="memo-topbar-button" icon={<Plus size={15} />} size="small" type="default" onClick={() => void createMemo()}>
        新建
      </Button>
    </div>
  );

  return (
    <section className="memo-layout">
      {topbarActions ? createPortal(topbarControls, topbarActions) : null}
      <ConfirmDialog
        open={deleteConfirmOpen && Boolean(selectedMemo)}
        title="删除备忘录"
        description={<span>确定删除「{deleteMemoTitle}」？删除后无法恢复。</span>}
        confirmText="删除"
        danger
        loading={deleteBusy}
        onCancel={closeDeleteConfirm}
        onConfirm={() => void confirmDeleteMemo()}
      />
      <aside className="memo-sidebar-panel">
        <label className="memo-search-field" aria-label="搜索标题或正文">
          <Search className="memo-search-icon" size={16} aria-hidden="true" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索标题或正文" allowClear shadow />
        </label>

        {message ? <div className="inline-alert">{message}</div> : null}

        <div className="memo-list-scroll" aria-busy={loading}>
          {memos.length === 0 && !loading ? <Card className="empty-state" type="dashed">暂无备忘录</Card> : null}
          {renderMemoGroup("置顶", pinnedMemos)}
          {renderMemoGroup(showArchived ? "已归档" : "最近更新", regularMemos)}
        </div>
      </aside>

      <section className="memo-editor-panel" aria-busy={detailLoading}>
        {selectedMemo ? (
          <>
            <header className="memo-editor-header">
              <div className="memo-title-stack">
                <input
                  className="memo-title-input"
                  value={title}
                  maxLength={160}
                  aria-label="备忘录标题"
                  onChange={(event) => changeTitle(event.target.value)}
                />
                {saveState === "error" ? <span className={`memo-save-state memo-save-state-${saveState}`}>{saveStateLabel(saveState)}</span> : null}
              </div>
              <div className="memo-editor-actions">
                <IconButtonTooltip label={pinActionLabel}>
                  <Button
                    aria-label={pinActionLabel}
                    icon={isPinned ? <PinOff size={15} /> : <Pin size={15} />}
                    size="small"
                    type={isPinned ? "primary" : "default"}
                    onClick={togglePinnedDraft}
                  />
                </IconButtonTooltip>
                <IconButtonTooltip label={archiveActionLabel}>
                  <Button
                    aria-label={archiveActionLabel}
                    icon={selectedMemo.archivedAt ? <ArchiveRestore size={15} /> : <Archive size={15} />}
                    size="small"
                    type="default"
                    onClick={() => void toggleArchive()}
                  />
                </IconButtonTooltip>
                <IconButtonTooltip label="固定到桌面">
                  <Button
                    aria-label="固定到桌面"
                    icon={<MonitorUp size={15} />}
                    size="small"
                    type="default"
                    onClick={() => void openMemoFloatingCard()}
                  />
                </IconButtonTooltip>
                <IconButtonTooltip label="删除">
                  <Button aria-label="删除" danger icon={<Trash2 size={15} />} size="small" type="default" onClick={requestDeleteMemo} />
                </IconButtonTooltip>
              </div>
            </header>

            <div className="memo-rich-toolbar" aria-label="富文本工具栏">
              <IconButtonTooltip label="一级标题">
                <Button aria-label="一级标题" icon={<Heading1 size={15} />} size="small" type="default" onClick={() => runEditorCommand("formatBlock", "h1")} />
              </IconButtonTooltip>
              <IconButtonTooltip label="二级标题">
                <Button aria-label="二级标题" icon={<Heading2 size={15} />} size="small" type="default" onClick={() => runEditorCommand("formatBlock", "h2")} />
              </IconButtonTooltip>
              <IconButtonTooltip label="三级标题">
                <Button aria-label="三级标题" icon={<Heading3 size={15} />} size="small" type="default" onClick={() => runEditorCommand("formatBlock", "h3")} />
              </IconButtonTooltip>
              <IconButtonTooltip label="四级标题">
                <Button aria-label="四级标题" icon={<Heading4 size={15} />} size="small" type="default" onClick={() => runEditorCommand("formatBlock", "h4")} />
              </IconButtonTooltip>
              <IconButtonTooltip label="五级标题">
                <Button aria-label="五级标题" icon={<Heading5 size={15} />} size="small" type="default" onClick={() => runEditorCommand("formatBlock", "h5")} />
              </IconButtonTooltip>
              <IconButtonTooltip label="六级标题">
                <Button aria-label="六级标题" icon={<Heading6 size={15} />} size="small" type="default" onClick={() => runEditorCommand("formatBlock", "h6")} />
              </IconButtonTooltip>
              <IconButtonTooltip label="正文">
                <Button aria-label="正文" size="small" type="default" onClick={() => runEditorCommand("formatBlock", "p")}>P</Button>
              </IconButtonTooltip>
              <IconButtonTooltip label="加粗">
                <Button aria-label="加粗" icon={<Bold size={15} />} size="small" type="default" onClick={() => runEditorCommand("bold")} />
              </IconButtonTooltip>
              <IconButtonTooltip label="斜体">
                <Button aria-label="斜体" icon={<Italic size={15} />} size="small" type="default" onClick={() => runEditorCommand("italic")} />
              </IconButtonTooltip>
              <IconButtonTooltip label="下划线">
                <Button aria-label="下划线" icon={<Underline size={15} />} size="small" type="default" onClick={() => runEditorCommand("underline")} />
              </IconButtonTooltip>
              <IconButtonTooltip label="插入无序列表">
                <Button aria-label="插入无序列表" icon={<List size={15} />} size="small" type="default" onClick={() => runEditorCommand("insertUnorderedList")} />
              </IconButtonTooltip>
              <IconButtonTooltip label="插入有序列表">
                <Button aria-label="插入有序列表" icon={<ListOrdered size={15} />} size="small" type="default" onClick={() => runEditorCommand("insertOrderedList")} />
              </IconButtonTooltip>
              <IconButtonTooltip label="插入引用">
                <Button aria-label="插入引用" icon={<Quote size={15} />} size="small" type="default" onClick={() => runEditorCommand("formatBlock", "blockquote")} />
              </IconButtonTooltip>
              <IconButtonTooltip label="插入代码块">
                <Button aria-label="插入代码块" icon={<Code2 size={15} />} size="small" type="default" onClick={() => insertRichHtml("<pre><code>代码</code></pre><p><br></p>")} />
              </IconButtonTooltip>
              <IconButtonTooltip label="插入表格">
                <Button aria-label="插入表格" icon={<Table2 size={15} />} size="small" type="default" onClick={() => insertRichHtml("<table><tbody><tr><th>列 1</th><th>列 2</th><th>列 3</th></tr><tr><td><br></td><td><br></td><td><br></td></tr><tr><td><br></td><td><br></td><td><br></td></tr></tbody></table><p><br></p>")} />
              </IconButtonTooltip>
              <IconButtonTooltip label="插入图片">
                <Button
                  aria-label="插入图片"
                  disabled={uploadBusy}
                  icon={<ImageIcon size={15} />}
                  loading={uploadBusy}
                  size="small"
                  type="default"
                  onClick={() => {
                    saveSelection();
                    fileInputRef.current?.click();
                  }}
                />
              </IconButtonTooltip>
              <input ref={fileInputRef} className="file-input-hidden" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleImageInputChange} />
            </div>

            <div
              ref={editorRef}
              aria-label="备忘录正文"
              className="memo-rich-editor"
              contentEditable
              data-empty={isRichContentEmpty(contentHtml)}
              data-placeholder="写下内容，或粘贴/拖入图片"
              role="textbox"
              suppressContentEditableWarning
              onBlur={() => {
                syncEditorContent();
                saveSelection();
              }}
              onDrop={handleDrop}
              onDragOver={(event) => event.preventDefault()}
              onFocus={saveSelection}
              onInput={syncEditorContent}
              onKeyUp={saveSelection}
              onMouseUp={saveSelection}
              onPaste={handlePaste}
            />
          </>
        ) : (
          <Card className="empty-state memo-empty-editor" type="dashed">
            暂无备忘录
          </Card>
        )}
      </section>
      {selectedMemo ? (
        <PrintShareDialog
          open={printDialogOpen}
          preview={{
            title,
            contentHtml: latestEditorHtml
          }}
          sourceType="memo"
          source={{ memoId: selectedMemo.id }}
          onClose={() => setPrintDialogOpen(false)}
        />
      ) : null}
    </section>
  );
}
