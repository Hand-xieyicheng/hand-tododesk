import type { ApiAiActionItem, CreateHabitRequest, HabitWeekday } from "@todo/shared";

export interface AiHabitActionEditorProps {
  action: ApiAiActionItem;
  disabled: boolean;
  onChange(action: ApiAiActionItem): void;
}

const weekdays: HabitWeekday[] = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

export function AiHabitActionEditor({ action, disabled, onChange }: AiHabitActionEditorProps) {
  if (["DELETE", "ARCHIVE", "RESTORE"].includes(action.actionType)) {
    return <p>{action.actionType}：{String(action.targetSnapshot?.title ?? action.targetId)}</p>;
  }
  const input = action.input as Partial<CreateHabitRequest>;
  const update = (patch: Partial<CreateHabitRequest>) => onChange({ ...action, input: { ...input, ...patch } });
  return (
    <div className="ai-action-editor-grid">
      <label>习惯标题<input disabled={disabled} value={input.title ?? ""} onChange={(event) => update({ title: event.target.value })} /></label>
      <label>图标<input disabled={disabled} value={input.icon ?? "Smile"} onChange={(event) => update({ icon: event.target.value })} /></label>
      <label className="is-wide">备注<textarea disabled={disabled} value={input.notes ?? ""} onChange={(event) => update({ notes: event.target.value || null })} /></label>
      <label>颜色<select disabled={disabled} value={input.color ?? "mint"} onChange={(event) => update({ color: event.target.value as CreateHabitRequest["color"] })}>
        {['mint','blue','yellow','orange','rose','purple','teal','slate'].map((value) => <option key={value} value={value}>{value}</option>)}
      </select></label>
      <label>频率<select disabled={disabled} value={input.frequency ?? "DAILY"} onChange={(event) => update({ frequency: event.target.value as CreateHabitRequest["frequency"] })}>
        <option value="DAILY">每天</option><option value="WEEKLY">每周</option><option value="MONTHLY">每月</option>
      </select></label>
      <label>间隔<input disabled={disabled} min={1} type="number" value={input.interval ?? 1} onChange={(event) => update({ interval: Number(event.target.value) || 1 })} /></label>
      <label>开始日期<input disabled={disabled} type="date" value={input.startDate ?? ""} onChange={(event) => update({ startDate: event.target.value })} /></label>
      <label>结束日期（可留空）<input disabled={disabled} type="date" value={input.endDate ?? ""} onChange={(event) => update({ endDate: event.target.value || null })} /></label>
      {input.frequency === "WEEKLY" ? <fieldset className="is-wide"><legend>星期</legend>{weekdays.map((day) => <label key={day}><input checked={(input.weekDays ?? []).includes(day)} disabled={disabled} type="checkbox" onChange={(event) => update({ weekDays: event.target.checked ? [...(input.weekDays ?? []), day] : (input.weekDays ?? []).filter((value) => value !== day) })} />{day}</label>)}</fieldset> : null}
      {input.frequency === "MONTHLY" ? <label className="is-wide">每月日期（逗号分隔）<input disabled={disabled} value={(input.monthDays ?? []).join(",")} onChange={(event) => update({ monthDays: event.target.value.split(",").map(Number).filter((value) => value >= 1 && value <= 31) })} /></label> : null}
    </div>
  );
}
