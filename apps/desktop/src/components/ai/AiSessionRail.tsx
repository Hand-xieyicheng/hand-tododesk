import { useState } from "react";
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import type { ApiAiSession } from "@todo/shared";

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

  function rename(session: ApiAiSession) {
    const title = window.prompt("会话名称", session.title);
    if (title?.trim()) {
      void onRename(session.id, title.trim());
    }
  }

  return (
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
                  onClick={() => rename(session)}
                >
                  <Pencil aria-hidden="true" size={13} />
                </button>
                <button
                  aria-label={`删除会话：${session.title}`}
                  type="button"
                  onClick={() => void onDelete(session.id)}
                >
                  <Trash2 aria-hidden="true" size={13} />
                </button>
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </aside>
  );
}
