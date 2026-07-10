import type {
  ApiAiActionItem,
  CreateTaskRequest,
  RecurrenceRuleInput
} from "@todo/shared";

export interface AiTaskActionEditorProps {
  action: ApiAiActionItem;
  disabled: boolean;
  onChange(action: ApiAiActionItem): void;
}

function toLocalDateTimeValue(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function toIsoDateTime(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function beijingLabel(value: string | null | undefined) {
  return value
    ? new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value))
    : "未设置";
}

export function AiTaskActionEditor({
  action,
  disabled,
  onChange
}: AiTaskActionEditorProps) {
  if (action.actionType === "DELETE") {
    return <p>删除待办：{String(action.targetSnapshot?.title ?? action.targetId)}</p>;
  }
  const input = action.input as Partial<CreateTaskRequest>;
  const update = (patch: Partial<CreateTaskRequest>) => onChange({
    ...action,
    input: { ...input, ...patch }
  });
  const recurrence = input.recurrenceRule ?? null;

  return (
    <div className="ai-action-editor-grid">
      <label>
        待办标题
        <input
          aria-label="待办标题"
          disabled={disabled}
          maxLength={160}
          value={input.title ?? ""}
          onChange={(event) => update({ title: event.target.value })}
        />
      </label>
      <label className="is-wide">
        备注
        <textarea
          disabled={disabled}
          maxLength={4000}
          value={input.notes ?? ""}
          onChange={(event) => update({ notes: event.target.value || null })}
        />
      </label>
      <label>
        开始时间
        <input
          disabled={disabled}
          type="datetime-local"
          value={toLocalDateTimeValue(input.startAt)}
          onChange={(event) => update({ startAt: toIsoDateTime(event.target.value) })}
        />
      </label>
      <label>
        截止时间
        <input
          disabled={disabled}
          type="datetime-local"
          value={toLocalDateTimeValue(input.dueAt)}
          onChange={(event) => update({ dueAt: toIsoDateTime(event.target.value) })}
        />
        <small>北京时间：{beijingLabel(input.dueAt)}</small>
      </label>
      <label>
        优先级
        <select
          disabled={disabled}
          value={input.priority ?? "IMPORTANT_NOT_URGENT"}
          onChange={(event) => update({ priority: event.target.value as CreateTaskRequest["priority"] })}
        >
          <option value="IMPORTANT_URGENT">重要且紧急</option>
          <option value="IMPORTANT_NOT_URGENT">重要不紧急</option>
          <option value="NOT_IMPORTANT_URGENT">不重要但紧急</option>
          <option value="NOT_IMPORTANT_NOT_URGENT">不重要不紧急</option>
        </select>
      </label>
      <label>
        状态
        <select
          disabled={disabled}
          value={input.status ?? "TODO"}
          onChange={(event) => update({ status: event.target.value as CreateTaskRequest["status"] })}
        >
          <option value="TODO">待处理</option>
          <option value="IN_PROGRESS">进行中</option>
          <option value="COMPLETED">已完成</option>
          <option value="ARCHIVED">已归档</option>
        </select>
      </label>
      <label>
        标签 ID
        <input
          disabled={disabled}
          value={input.tagId ?? ""}
          onChange={(event) => update({ tagId: event.target.value || null })}
        />
      </label>
      <label>
        重复
        <select
          disabled={disabled}
          value={recurrence?.frequency ?? ""}
          onChange={(event) => {
            const frequency = event.target.value as RecurrenceRuleInput["frequency"] | "";
            update({
              recurrenceRule: frequency
                ? { frequency, interval: 1, until: null, count: null, byWeekday: null }
                : null
            });
          }}
        >
          <option value="">不重复</option>
          <option value="DAILY">每天</option>
          <option value="WEEKLY">每周</option>
          <option value="MONTHLY">每月</option>
          <option value="YEARLY">每年</option>
        </select>
      </label>
      {recurrence ? (
        <>
          <label>
            重复间隔
            <input
              disabled={disabled}
              min={1}
              type="number"
              value={recurrence.interval}
              onChange={(event) => update({
                recurrenceRule: { ...recurrence, interval: Number(event.target.value) || 1 }
              })}
            />
          </label>
          <label>
            星期（逗号分隔）
            <input
              disabled={disabled}
              placeholder="MO,WE,FR"
              value={recurrence.byWeekday?.join(",") ?? ""}
              onChange={(event) => update({
                recurrenceRule: {
                  ...recurrence,
                  byWeekday: event.target.value
                    ? event.target.value.split(",").map((value) => value.trim()) as NonNullable<RecurrenceRuleInput["byWeekday"]>
                    : null
                }
              })}
            />
          </label>
          <label>
            重复截止时间
            <input
              disabled={disabled}
              type="datetime-local"
              value={toLocalDateTimeValue(recurrence.until)}
              onChange={(event) => update({
                recurrenceRule: {
                  ...recurrence,
                  until: toIsoDateTime(event.target.value)
                }
              })}
            />
          </label>
          <label>
            重复次数
            <input
              disabled={disabled}
              min={1}
              type="number"
              value={recurrence.count ?? ""}
              onChange={(event) => update({
                recurrenceRule: {
                  ...recurrence,
                  count: event.target.value ? Number(event.target.value) : null
                }
              })}
            />
          </label>
        </>
      ) : null}
    </div>
  );
}
