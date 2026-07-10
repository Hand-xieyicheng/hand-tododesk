import { useState } from "react";
import { Sparkles } from "lucide-react";
import type { AiChangedDomain } from "@todo/shared";
import { AiComposer } from "./AiComposer";
import { AiMessageList } from "./AiMessageList";
import { AiSessionRail } from "./AiSessionRail";
import { useAiAssistant } from "./useAiAssistant";

export interface AiAssistantProps {
  enabled: boolean;
  onDomainsChanged(domains: AiChangedDomain[]): void | Promise<void>;
}

export function AiAssistant({ enabled, onDomainsChanged }: AiAssistantProps) {
  const [open, setOpen] = useState(false);
  const state = useAiAssistant(open);

  if (!enabled) {
    return null;
  }

  return (
    <div className={`ai-assistant${open ? " is-open" : ""}`}>
      {open ? (
        <section
          aria-label="AI 助手"
          className="ai-assistant-panel"
          role="dialog"
        >
          <AiSessionRail
            activeSessionId={state.activeSessionId}
            sessions={state.sessions}
            onCreate={state.createSession}
            onDelete={state.deleteSession}
            onRename={state.renameSession}
            onSelect={state.selectSession}
          />
          <div className="ai-assistant-conversation">
            <header className="ai-assistant-header">
              <div>
                <strong>AI 助手</strong>
                <span>待办 · 纪念日 · 习惯</span>
              </div>
              {state.sending ? <small>正在思考…</small> : null}
            </header>
            {state.error ? (
              <div className="ai-assistant-error" role="alert">{state.error}</div>
            ) : null}
            <div className="ai-assistant-message-area">
              {state.loading && state.messages.length === 0 ? (
                <p className="ai-assistant-loading">正在加载…</p>
              ) : (
                <AiMessageList
                  messages={state.messages}
                  onDomainsChanged={onDomainsChanged}
                  onProposalChanged={state.replaceProposal}
                />
              )}
            </div>
            <AiComposer
              disabled={state.sending || !state.activeSessionId}
              showSuggestions={!state.loading && state.messages.length === 0}
              onSend={state.send}
            />
          </div>
        </section>
      ) : null}
      <button
        aria-label={open ? "关闭 AI 助手" : "打开 AI 助手"}
        className="ai-assistant-trigger"
        type="button"
        onClick={() => setOpen((value) => !value)}
      >
        <Sparkles aria-hidden="true" size={22} />
      </button>
    </div>
  );
}
