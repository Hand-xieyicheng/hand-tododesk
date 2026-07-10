import type { ApiAiActionItem, HabitCheckInRequest } from "@todo/shared";

export interface AiCheckInActionEditorProps {
  action: ApiAiActionItem;
  disabled: boolean;
  onChange(action: ApiAiActionItem): void;
}

export function AiCheckInActionEditor({ action, disabled, onChange }: AiCheckInActionEditorProps) {
  const input = action.input as HabitCheckInRequest;
  if (action.actionType === "CANCEL_CHECK_IN") {
    return <p>取消打卡：{String(action.targetSnapshot?.title ?? action.targetId)} · {input.date}</p>;
  }
  const update = (patch: Partial<HabitCheckInRequest>) => onChange({ ...action, input: { ...input, ...patch } });
  return (
    <div className="ai-action-editor-grid">
      <label>习惯目标<input disabled readOnly value={String(action.targetSnapshot?.title ?? action.targetId ?? "")} /></label>
      <label>打卡日期<input disabled={disabled} type="date" value={input.date} onChange={(event) => update({ date: event.target.value })} /></label>
      <label className="is-wide">打卡备注<textarea disabled={disabled} value={input.note ?? ""} onChange={(event) => update({ note: event.target.value || null })} /></label>
    </div>
  );
}
