import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, LoaderCircle, Trash2 } from "lucide-react";
import type {
  AiChangedDomain,
  ApiAiProposal
} from "@todo/shared";
import { ApiError, api } from "../../api/client";
import { AiActionEditor } from "./AiActionEditor";
import {
  removeAction,
  replaceAction,
  toUpdateAiProposalRequest
} from "./proposalDraft";

export interface AiProposalCardProps {
  proposal: ApiAiProposal;
  onChanged(proposal: ApiAiProposal): void;
  onDomainsChanged(domains: AiChangedDomain[]): void | Promise<void>;
}

function uuid() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function statusLabel(status: ApiAiProposal["status"]) {
  const labels: Record<ApiAiProposal["status"], string> = {
    PENDING_CONFIRMATION: "等待确认",
    EXECUTING: "正在执行",
    SUCCEEDED: "执行成功",
    PARTIAL_FAILED: "部分失败",
    FAILED: "执行失败",
    CANCELLED: "已取消",
    EXPIRED: "已过期"
  };
  return labels[status];
}

export function AiProposalCard({
  proposal,
  onChanged,
  onDomainsChanged
}: AiProposalCardProps) {
  const [draft, setDraft] = useState(proposal);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const busyRef = useRef(false);
  const idempotencyKeyRef = useRef<string | null>(null);

  useEffect(() => {
    setDraft(proposal);
  }, [proposal]);

  async function runBusy(name: string, operation: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(name);
    setError("");
    try {
      await operation();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "提案操作失败");
      throw caught;
    } finally {
      busyRef.current = false;
      setBusy("");
    }
  }

  async function save() {
    await runBusy("save", async () => {
      const result = await api.updateAiProposal(
        draft.id,
        toUpdateAiProposalRequest(draft)
      );
      setDraft(result.proposal);
      onChanged(result.proposal);
    }).catch(() => undefined);
  }

  async function cancel() {
    await runBusy("cancel", async () => {
      const result = await api.cancelAiProposal(draft.id, {
        version: draft.version
      });
      setDraft(result.proposal);
      onChanged(result.proposal);
    }).catch(() => undefined);
  }

  async function confirm() {
    if (busyRef.current) return;
    idempotencyKeyRef.current ??= uuid();
    await runBusy("confirm", async () => {
      try {
        const result = await api.confirmAiProposal(draft.id, {
          version: draft.version,
          idempotencyKey: idempotencyKeyRef.current!
        });
        idempotencyKeyRef.current = null;
        setDraft(result.proposal);
        onChanged(result.proposal);
        await onDomainsChanged(result.changedDomains);
      } catch (caught) {
        if (caught instanceof ApiError && caught.status > 0) {
          idempotencyKeyRef.current = null;
        }
        throw caught;
      }
    }).catch(() => undefined);
  }

  async function retry() {
    await runBusy("retry", async () => {
      const result = await api.retryAiProposal(draft.id, {
        version: draft.version,
        idempotencyKey: uuid()
      });
      setDraft(result.proposal);
      onChanged(result.proposal);
      await onDomainsChanged(result.changedDomains);
    }).catch(() => undefined);
  }

  const editable = draft.status === "PENDING_CONFIRMATION";
  const retryable = draft.status === "FAILED" || draft.status === "PARTIAL_FAILED";

  return (
    <section className={`ai-proposal-card is-${draft.status.toLowerCase()}`}>
      <header>
        <div>
          <strong>操作确认</strong>
          <span>{statusLabel(draft.status)}</span>
        </div>
        <small>版本 {draft.version}</small>
      </header>
      <div className="ai-proposal-actions">
        {draft.items.map((action, index) => (
          <section className="ai-proposal-action" key={action.id}>
            <header>
              <strong>{index + 1}. {action.objectType} · {action.actionType}</strong>
              {editable && draft.items.length > 1 ? (
                <button
                  aria-label={`移除第 ${index + 1} 项操作`}
                  disabled={Boolean(busy)}
                  type="button"
                  onClick={() => setDraft((current) => removeAction(current, action.id))}
                >
                  <Trash2 aria-hidden="true" size={14} />
                </button>
              ) : null}
            </header>
            <AiActionEditor
              action={action}
              disabled={!editable || Boolean(busy)}
              onChange={(next) => setDraft((current) => replaceAction(
                current,
                action.id,
                () => next
              ))}
            />
            {action.status === "SUCCEEDED" ? (
              <p className="ai-action-result is-success"><CheckCircle2 aria-hidden="true" size={14} /> 已完成</p>
            ) : null}
            {action.status === "FAILED" ? (
              <p className="ai-action-result is-error"><AlertCircle aria-hidden="true" size={14} /> {action.errorMessage ?? "执行失败"}</p>
            ) : null}
          </section>
        ))}
      </div>
      {error ? <p className="ai-proposal-error" role="alert">{error}</p> : null}
      {draft.status === "EXECUTING" ? (
        <p className="ai-proposal-executing"><LoaderCircle aria-hidden="true" size={15} /> 正在执行，请稍候…</p>
      ) : null}
      {editable ? (
        <footer>
          <button disabled={Boolean(busy)} type="button" onClick={() => void cancel()}>
            {busy === "cancel" ? "取消中…" : "取消提案"}
          </button>
          <button disabled={Boolean(busy) || draft.items.length === 0} type="button" onClick={() => void save()}>
            {busy === "save" ? "保存中…" : "保存修改"}
          </button>
          <button disabled={Boolean(busy) || draft.items.length === 0} type="button" onClick={() => void confirm()}>
            {busy === "confirm" ? "执行中…" : "确认执行"}
          </button>
        </footer>
      ) : null}
      {retryable ? (
        <footer>
          <button disabled={Boolean(busy)} type="button" onClick={() => void retry()}>
            {busy === "retry" ? "重试中…" : "重试失败项"}
          </button>
        </footer>
      ) : null}
    </section>
  );
}
