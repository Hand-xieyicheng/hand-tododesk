import type { ApiAiActionItem, CreateAnniversaryRequest } from "@todo/shared";

export interface AiAnniversaryActionEditorProps {
  action: ApiAiActionItem;
  disabled: boolean;
  onChange(action: ApiAiActionItem): void;
}

export function AiAnniversaryActionEditor({ action, disabled, onChange }: AiAnniversaryActionEditorProps) {
  if (action.actionType === "DELETE") {
    return <p>删除纪念日：{String(action.targetSnapshot?.title ?? action.targetId)}</p>;
  }
  const input = action.input as Partial<CreateAnniversaryRequest>;
  const update = (patch: Partial<CreateAnniversaryRequest>) => onChange({
    ...action,
    input: { ...input, ...patch }
  });

  return (
    <div className="ai-action-editor-grid">
      <label>纪念日标题<input disabled={disabled} value={input.title ?? ""} onChange={(event) => update({ title: event.target.value })} /></label>
      <label>日期<input disabled={disabled} type="date" value={input.date ?? ""} onChange={(event) => update({ date: event.target.value })} /></label>
      <label className="is-wide">备注<textarea disabled={disabled} value={input.notes ?? ""} onChange={(event) => update({ notes: event.target.value || null })} /></label>
      <label>类别<select disabled={disabled} value={input.category ?? "ANNIVERSARY"} onChange={(event) => update({ category: event.target.value as CreateAnniversaryRequest["category"] })}>
        <option value="ANNIVERSARY">纪念日</option><option value="COUNTDOWN">倒数日</option><option value="BIRTHDAY">生日</option><option value="HOLIDAY">节日</option>
      </select></label>
      <label>重复<select disabled={disabled} value={input.repeat ?? "NONE"} onChange={(event) => update({ repeat: event.target.value as CreateAnniversaryRequest["repeat"] })}>
        <option value="NONE">不重复</option><option value="WEEKLY">每周</option><option value="MONTHLY">每月</option><option value="YEARLY">每年</option>
      </select></label>
      <label>方向<select disabled={disabled} value={input.direction ?? "AUTO"} onChange={(event) => update({ direction: event.target.value as CreateAnniversaryRequest["direction"] })}>
        <option value="AUTO">自动</option><option value="ELAPSED">已过</option><option value="COUNTDOWN">倒数</option>
      </select></label>
      <label>卡片样式<select disabled={disabled} value={input.cardStyle ?? "lavender"} onChange={(event) => update({ cardStyle: event.target.value as CreateAnniversaryRequest["cardStyle"] })}>
        {['lavender','sunrise','mint','ocean','rose','classic'].map((value) => <option key={value} value={value}>{value}</option>)}
      </select></label>
      <label>日历类型<select disabled={disabled} value={input.calendarType ?? "SOLAR"} onChange={(event) => update({ calendarType: event.target.value as CreateAnniversaryRequest["calendarType"] })}>
        <option value="SOLAR">公历</option><option value="LUNAR">农历</option><option value="SOLAR_TERM">节气</option>
      </select></label>
      {input.calendarType === "LUNAR" ? <>
        <label>农历月<input disabled={disabled} min={1} max={12} type="number" value={input.lunarMonth ?? ""} onChange={(event) => update({ lunarMonth: Number(event.target.value) || null })} /></label>
        <label>农历日<input disabled={disabled} min={1} max={30} type="number" value={input.lunarDay ?? ""} onChange={(event) => update({ lunarDay: Number(event.target.value) || null })} /></label>
      </> : null}
      {input.calendarType === "SOLAR_TERM" ? <label>节气<select disabled={disabled} value={input.solarTerm ?? "QINGMING"} onChange={() => update({ solarTerm: "QINGMING" })}><option value="QINGMING">清明</option></select></label> : null}
    </div>
  );
}
