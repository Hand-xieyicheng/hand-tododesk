import { useState } from "react";
import { Button, Modal } from "animal-island-ui";
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import type { ApiAiSession } from "@todo/shared";
import { ConfirmDialog } from "../ConfirmDialog";

export interface AiSessionRailProps {
  sessions: ApiAiSession[];
  activeSessionId: string | null;
  onCreate(): void | Promise<unknown>;
  onDelete(sessionId: string): void | Promise<void>;
  onRename(sessionId: string, title: string): void | Promise<void>;
  onSelect(sessionId: string): void | Promise<void>;
}

export function AiSessionRail({
  sessions,
  activeSessionId,
  onCreate,
  onDelete,
  onRename,
  onSelect
}: AiSessionRailProps) {
  const [expanded, setExpanded] = useState(false);
  const [renameTarget, setRenameTarget] = useState<ApiAiSession | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ApiAiSession | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  function openRenameDialog(session: ApiAiSession) {
    setRenameTarget(session);
    setRenameTitle(session.title);
  }

  async function confirmRename() {
    const title = renameTitle.trim();
    if (!renameTarget || !title || renameBusy) {
      return;
    }
    setRenameBusy(true);
    try {
      await onRename(renameTarget.id, title);
      setRenameTarget(null);
    } catch {
      // Request errors are surfaced by the assistant; keep the dialog open for retry.
    } finally {
      setRenameBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || deleteBusy) {
      return;
    }
    setDeleteBusy(true);
    try {
      await onDelete(deleteTarget.id);
      setDeleteTarget(null);
    } catch {
      // Request errors are surfaced by the assistant; keep the dialog open for retry.
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <>
      <aside className={`ai-session-rail${expanded ? " is-expanded" : ""}`}>
        <div className="ai-session-rail-header">
          {expanded ? <strong>会话</strong> : null}
          <button
            aria-label={expanded ? "收起会话列表" : "展开会话列表"}
            type="button"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded
              ? <ChevronLeft aria-hidden="true" size={16} />
              : <ChevronRight aria-hidden="true" size={16} />}
          </button>
        </div>
        <button
          aria-label="新建 AI 会话"
          className="ai-session-create"
          type="button"
          onClick={() => void onCreate()}
        >
          <Plus aria-hidden="true" size={17} />
          {expanded ? <span>新会话</span> : null}
        </button>
        <div className="ai-session-list">
          {sessions.map((session) => (
            <div
              className={`ai-session-item${session.id === activeSessionId ? " is-active" : ""}`}
              key={session.id}
            >
              <button
                aria-label={`切换到会话：${session.title}`}
                className="ai-session-select"
                title={session.title}
                type="button"
                onClick={() => void onSelect(session.id)}
              >
                {expanded ? session.title : session.title.slice(0, 1)}
              </button>
              {expanded ? (
                <span className="ai-session-actions">
                  <button
                    aria-label={`重命名会话：${session.title}`}
                    type="button"
                    onClick={() => openRenameDialog(session)}
                  >
                    <Pencil aria-hidden="true" size={13} />
                  </button>
                  <button
                    aria-label={`删除会话：${session.title}`}
                    type="button"
                    onClick={() => setDeleteTarget(session)}
                  >
                    <Trash2 aria-hidden="true" size={13} />
                  </button>
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </aside>
      <Modal
        className="ai-session-rename-dialog"
        footer={null}
        maskClosable={!renameBusy}
        open={Boolean(renameTarget)}
        title="重命名会话"
        typewriter={false}
        width={420}
        onClose={() => {
          if (!renameBusy) {
            setRenameTarget(null);
          }
        }}
      >
        <div className="ai-session-rename-content">
          <label>
            <span>会话名称</span>
            <input
              aria-label="会话名称"
              autoFocus
              disabled={renameBusy}
              maxLength={80}
              value={renameTitle}
              onChange={(event) => setRenameTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void confirmRename();
                }
              }}
            />
          </label>
          <div className="ai-session-rename-actions">
            <Button
              disabled={renameBusy}
              type="default"
              onClick={() => setRenameTarget(null)}
            >
              取消
            </Button>
            <Button
              disabled={renameBusy || !renameTitle.trim()}
              loading={renameBusy}
              type="primary"
              onClick={() => void confirmRename()}
            >
              保存
            </Button>
          </div>
        </div>
      </Modal>
      <ConfirmDialog
        className="ai-session-delete-dialog"
        confirmText="删除"
        danger
        description={deleteTarget
          ? <span>确定删除「{deleteTarget.title}」？删除后无法恢复。</span>
          : null}
        loading={deleteBusy}
        open={Boolean(deleteTarget)}
        title="删除会话"
        onCancel={() => {
          if (!deleteBusy) {
            setDeleteTarget(null);
          }
        }}
        onConfirm={() => void confirmDelete()}
      />
    </>
  );
}
