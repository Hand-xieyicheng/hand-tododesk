import { useEffect, useState } from "react";
import type { AiChangedDomain, AiObjectType, ApiAiMessage, ApiAiProposal } from "@todo/shared";
import { AiProposalCard } from "./AiProposalCard";

export interface AiMessageListProps {
  messages: ApiAiMessage[];
  thinking?: boolean;
  onDomainsChanged(domains: AiChangedDomain[]): void | Promise<void>;
  onProposalChanged(messageId: string, proposal: ApiAiProposal): void;
}

type QueryRecord = {
  objectType: AiObjectType;
  id: string;
  data: Record<string, unknown>;
};

function recordTitle(record: QueryRecord) {
  const data = record.data;
  return typeof data.title === "string"
    ? data.title
    : typeof data.date === "string"
      ? data.date
      : record.id;
}

function useElapsedSeconds(active: boolean) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!active) {
      setElapsedSeconds(0);
      return;
    }
    const startedAt = Date.now();
    setElapsedSeconds(0);
    const interval = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1_000);
    return () => window.clearInterval(interval);
  }, [active]);

  return elapsedSeconds;
}

function thinkingLabel(elapsedSeconds: number) {
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  const duration = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
  return `思考中(${duration})...`;
}

export function AiMessageList({
  messages,
  thinking = false,
  onDomainsChanged,
  onProposalChanged
}: AiMessageListProps) {
  const lastMessage = messages[messages.length - 1];
  const thinkingForLastUser = thinking && lastMessage?.role === "USER";
  const elapsedSeconds = useElapsedSeconds(thinkingForLastUser);

  if (messages.length === 0) {
    return (
      <div className="ai-message-empty">
        <strong>我可以帮你管理 todoDesk</strong>
        <p>试试输入“我今天喝咖啡了”或“3月12号是我生日”。所有写入都会先给你确认。</p>
      </div>
    );
  }

  return (
    <div aria-live="polite" className="ai-message-list">
      {messages.map((message, index) => (
        <article
          className={`ai-message is-${message.role.toLowerCase()}`}
          key={message.id}
        >
          <p>{message.content}</p>
          {thinkingForLastUser && index === messages.length - 1 ? (
            <small className="ai-message-thinking" role="status">{thinkingLabel(elapsedSeconds)}</small>
          ) : null}
          {message.kind === "QUERY_RESULT" && message.metadata?.records ? (
            <div className="ai-query-records">
              {message.metadata.records.map((record) => (
                <div className="ai-query-record" key={`${record.objectType}:${record.id}`}>
                  <span>{record.objectType}</span>
                  <strong>{recordTitle(record)}</strong>
                  {typeof record.data.dueAt === "string" ? (
                    <small>{new Date(record.data.dueAt).toLocaleString("zh-CN")}</small>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
          {message.kind === "CLARIFICATION" && message.metadata?.candidates ? (
            <ul className="ai-clarification-candidates">
              {message.metadata.candidates.map((candidate) => (
                <li key={`${candidate.objectType}:${candidate.id}`}>{candidate.label}</li>
              ))}
            </ul>
          ) : null}
          {message.kind === "PROPOSAL" && message.metadata?.proposal ? (
            <AiProposalCard
              proposal={message.metadata.proposal}
              onChanged={(proposal) => onProposalChanged(message.id, proposal)}
              onDomainsChanged={onDomainsChanged}
            />
          ) : null}
        </article>
      ))}
    </div>
  );
}
