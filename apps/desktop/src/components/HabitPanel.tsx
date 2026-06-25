import { memo, type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  habitColorValues,
  habitWeekdayValues,
  toLocalDateKey,
  type ApiHabit,
  type ApiHabitDetail,
  type ApiHabitLog,
  type CreateHabitRequest,
  type HabitColor,
  type HabitFrequency,
  type HabitIcon,
  type HabitWeekday
} from "@todo/shared";
import { Button, Card, Input, Modal, Select } from "animal-island-ui";
import {
  Check,
  Edit3,
  Flame,
  MoreHorizontal,
  Plus,
  RotateCcw,
  PenLine,
  Search,
  Trash2
} from "lucide-react";
import { api } from "../api/client";
import { allHabitIconNames, getHabitIcon, habitIconOptions, iconSearchText, normalizeHabitIconName, presetHabitIconOptions } from "../lib/habitIcons";
import { ConfirmDialog } from "./ConfirmDialog";

interface HabitPanelProps {
  createOpen: boolean;
  showArchived: boolean;
  onCreateOpenChange(open: boolean): void;
}

interface HabitDraft {
  title: string;
  notes: string;
  icon: HabitIcon;
  color: HabitColor;
  frequency: HabitFrequency;
  interval: string;
  weekDays: HabitWeekday[];
  monthDays: number[];
  startDate: string;
  endDate: string;
}

const iconPageSize = 42;

const colorLabels: Record<HabitColor, string> = {
  blue: "蓝",
  mint: "薄荷",
  orange: "橙",
  purple: "紫",
  rose: "玫瑰",
  slate: "灰",
  teal: "青",
  yellow: "黄"
};

const frequencyOptions = [
  { key: "DAILY", label: "按天" },
  { key: "WEEKLY", label: "按周" },
  { key: "MONTHLY", label: "按月" }
];

const frequencyLabels: Record<HabitFrequency, string> = {
  DAILY: "按天",
  WEEKLY: "按周",
  MONTHLY: "按月"
};

const weekdayLabels: Record<HabitWeekday, string> = {
  MO: "一",
  TU: "二",
  WE: "三",
  TH: "四",
  FR: "五",
  SA: "六",
  SU: "日"
};

const weekdayFromDate = (dateKey: string): HabitWeekday => {
  const day = new Date(`${dateKey}T00:00:00`).getDay();
  return (["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as HabitWeekday[])[day] ?? "MO";
};

function currentMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function moveMonth(month: string, delta: number) {
  const [year, monthValue] = month.split("-").map(Number);
  const next = new Date(year ?? 0, (monthValue ?? 1) - 1 + delta, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string) {
  const [year, monthValue] = month.split("-").map(Number);
  return `${year}年${monthValue}月`;
}

function emptyDraft(): HabitDraft {
  const today = toLocalDateKey();
  return {
    title: "",
    notes: "",
    icon: "Smile",
    color: "mint",
    frequency: "DAILY",
    interval: "1",
    weekDays: [weekdayFromDate(today)],
    monthDays: [Number(today.slice(-2))],
    startDate: today,
    endDate: ""
  };
}

function draftFromHabit(habit: ApiHabit): HabitDraft {
  return {
    title: habit.title,
    notes: habit.notes ?? "",
    icon: normalizeHabitIconName(habit.icon),
    color: habit.color,
    frequency: habit.frequency,
    interval: String(habit.interval),
    weekDays: habit.weekDays.length > 0 ? habit.weekDays : [weekdayFromDate(toLocalDateKey())],
    monthDays: habit.monthDays.length > 0 ? habit.monthDays : [Number(toLocalDateKey().slice(-2))],
    startDate: habit.startDate,
    endDate: habit.endDate ?? ""
  };
}

function draftToPayload(draft: HabitDraft): CreateHabitRequest {
  return {
    title: draft.title,
    notes: draft.notes || null,
    icon: draft.icon,
    color: draft.color,
    frequency: draft.frequency,
    interval: Math.max(1, Number(draft.interval) || 1),
    weekDays: draft.frequency === "WEEKLY" ? draft.weekDays : [],
    monthDays: draft.frequency === "MONTHLY" ? draft.monthDays : [],
    startDate: draft.startDate,
    endDate: draft.endDate || null
  };
}

function scheduleLabel(habit: ApiHabit) {
  if (habit.frequency === "DAILY") {
    return habit.interval === 1 ? "每天" : `每 ${habit.interval} 天`;
  }
  if (habit.frequency === "WEEKLY") {
    const days = habit.weekDays.map((day) => weekdayLabels[day]).join("、");
    return habit.interval === 1 ? `每周 ${days}` : `每 ${habit.interval} 周 ${days}`;
  }
  const days = habit.monthDays.map((day) => `${day}号`).join("、");
  return habit.interval === 1 ? `每月 ${days}` : `每 ${habit.interval} 月 ${days}`;
}

function HabitIconBadge({ habit, size = 20 }: { habit: Pick<ApiHabit, "color" | "icon" | "title">; size?: number }) {
  const Icon = getHabitIcon(habit.icon);
  return (
    <span className={`habit-icon-badge color-${habit.color}`} aria-hidden="true">
      <Icon size={size} />
    </span>
  );
}

interface HabitIconOptionButtonProps {
  active: boolean;
  icon: string;
  onSelect(icon: HabitIcon): void;
}

const HabitIconOptionButton = memo(function HabitIconOptionButton({ active, icon, onSelect }: HabitIconOptionButtonProps) {
  const Icon = getHabitIcon(icon);

  return (
    <button
      aria-label={`习惯图标 ${icon}`}
      aria-pressed={active}
      className={active ? "is-active" : ""}
      title={icon}
      type="button"
      onClick={() => onSelect(normalizeHabitIconName(icon))}
    >
      <Icon size={20} />
      <span>{icon}</span>
    </button>
  );
});

export function HabitPanel({ createOpen, showArchived, onCreateOpenChange }: HabitPanelProps) {
  const [habits, setHabits] = useState<ApiHabit[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [detail, setDetail] = useState<ApiHabitDetail | null>(null);
  const [detailMonth, setDetailMonth] = useState(() => currentMonthKey());
  const [editingHabit, setEditingHabit] = useState<ApiHabit | null>(null);
  const [draft, setDraft] = useState<HabitDraft>(() => emptyDraft());
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [formMessage, setFormMessage] = useState("");
  const [noteLog, setNoteLog] = useState<ApiHabitLog | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [deleteHabitTarget, setDeleteHabitTarget] = useState<ApiHabit | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [iconQuery, setIconQuery] = useState("");
  const [visibleIconCount, setVisibleIconCount] = useState(iconPageSize);
  const selectedHabit = useMemo(() => habits.find((habit) => habit.id === selectedId) ?? null, [habits, selectedId]);
  const modalOpen = createOpen || Boolean(editingHabit);
  const matchingIconOptions = useMemo(() => {
    const query = iconQuery.trim().toLowerCase();
    return query
      ? habitIconOptions.filter((icon) => icon.toLowerCase().includes(query) || iconSearchText(icon).includes(query))
      : habitIconOptions;
  }, [iconQuery]);
  const filteredIconOptions = useMemo(() => matchingIconOptions.slice(0, visibleIconCount), [matchingIconOptions, visibleIconCount]);
  const hasMoreIcons = filteredIconOptions.length < matchingIconOptions.length;
  const normalizedDraftIcon = normalizeHabitIconName(draft.icon);
  const SelectedIcon = getHabitIcon(normalizedDraftIcon);
  const draftIconInPreset = presetHabitIconOptions.includes(normalizedDraftIcon);
  const MoreIcon = draftIconInPreset ? MoreHorizontal : SelectedIcon;
  const SelectedHabitCalendarIcon = getHabitIcon(selectedHabit?.icon ?? "Smile");
  const selectHabitIcon = useCallback((icon: HabitIcon) => {
    setDraft((current) => ({ ...current, icon }));
    setIconPickerOpen(false);
    setIconQuery("");
    setVisibleIconCount(iconPageSize);
  }, []);
  const toggleIconPicker = useCallback(() => {
    setIconPickerOpen((open) => {
      const nextOpen = !open;
      if (nextOpen) {
        setVisibleIconCount(iconPageSize);
      }
      return nextOpen;
    });
  }, []);

  async function loadHabits(preferredId = selectedId) {
    setMessage("");
    setLoading(true);
    try {
      const payload = await api.habits(showArchived);
      setHabits(payload.habits);
      const nextSelectedId = preferredId && payload.habits.some((habit) => habit.id === preferredId)
        ? preferredId
        : payload.habits[0]?.id ?? "";
      setSelectedId(nextSelectedId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "习惯加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(habitId = selectedId, month = detailMonth) {
    if (!habitId) {
      setDetail(null);
      return;
    }

    setDetailLoading(true);
    try {
      setDetail(await api.habitDetail(habitId, month));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "习惯详情加载失败");
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    void loadHabits();
  }, [showArchived]);

  useEffect(() => {
    void loadDetail();
  }, [selectedId, detailMonth]);

  useEffect(() => {
    if (createOpen && !editingHabit) {
      setDraft(emptyDraft());
      setFormMessage("");
      setIconPickerOpen(false);
      setIconQuery("");
      setVisibleIconCount(iconPageSize);
    }
  }, [createOpen, editingHabit]);

  function updateDraft(patch: Partial<HabitDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function closeModal() {
    setEditingHabit(null);
    setFormMessage("");
    setIconPickerOpen(false);
    setIconQuery("");
    setVisibleIconCount(iconPageSize);
    onCreateOpenChange(false);
  }

  function beginEdit(habit: ApiHabit) {
    setEditingHabit(habit);
    setDraft(draftFromHabit(habit));
    setFormMessage("");
    setIconPickerOpen(false);
    setIconQuery("");
    setVisibleIconCount(iconPageSize);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFormMessage("");
    try {
      const payload = draftToPayload(draft);
      const response = editingHabit
        ? await api.updateHabit(editingHabit.id, payload)
        : await api.createHabit(payload);
      closeModal();
      await loadHabits(response.habit.id);
      setDetailMonth(currentMonthKey());
      await loadDetail(response.habit.id, currentMonthKey());
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function toggleToday(habit: ApiHabit) {
    const today = toLocalDateKey();
    try {
      if (habit.todayChecked) {
        await api.cancelHabitCheckIn(habit.id, today);
      } else {
        await api.checkInHabit(habit.id, today);
      }
      await loadHabits(habit.id);
      await loadDetail(habit.id, detailMonth);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "打卡失败");
    }
  }

  async function toggleCalendarDay(date: string, checked: boolean) {
    if (!selectedId) {
      return;
    }
    try {
      if (checked) {
        await api.cancelHabitCheckIn(selectedId, date);
      } else {
        await api.checkInHabit(selectedId, date);
      }
      await loadHabits(selectedId);
      await loadDetail(selectedId, detailMonth);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "打卡失败");
    }
  }

  async function archiveHabit(habit: ApiHabit, archived: boolean) {
    try {
      const response = await api.updateHabit(habit.id, { archived });
      await loadHabits(response.habit.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "归档失败");
    }
  }

  function requestDeleteHabit(habit: ApiHabit) {
    if (deleteBusy) {
      return;
    }

    setDeleteHabitTarget(habit);
  }

  function closeDeleteHabitConfirm() {
    if (!deleteBusy) {
      setDeleteHabitTarget(null);
    }
  }

  async function confirmDeleteHabit() {
    if (!deleteHabitTarget || deleteBusy) {
      return;
    }

    const habitId = deleteHabitTarget.id;
    setDeleteBusy(true);
    setMessage("");
    try {
      await api.deleteHabit(habitId);
      setDeleteHabitTarget(null);
      await loadHabits("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除失败");
    } finally {
      setDeleteBusy(false);
    }
  }

  function openNote(log: ApiHabitLog) {
    setNoteLog(log);
    setNoteDraft(log.note ?? "");
  }

  async function submitNote(event: FormEvent) {
    event.preventDefault();
    if (!selectedId || !noteLog) {
      return;
    }
    try {
      await api.checkInHabit(selectedId, noteLog.date, noteDraft);
      setNoteLog(null);
      setNoteDraft("");
      await loadHabits(selectedId);
      await loadDetail(selectedId, detailMonth);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "日志保存失败");
    }
  }

  return (
    <>
      <Modal
        className="habit-modal habit-editor-modal"
        open={modalOpen}
        title={editingHabit ? "编辑习惯" : "新建习惯"}
        width={780}
        footer={null}
        typewriter={false}
        onClose={closeModal}
      >
        <form className="task-form habit-form" onSubmit={submit}>
          <label>
            <span>习惯名称</span>
            <Input value={draft.title} onChange={(event) => updateDraft({ title: event.target.value })} required maxLength={160} allowClear shadow />
          </label>
          <div className="habit-form-field">
            <span>选择图标</span>
            <div className="habit-icon-select">
              <div className="habit-icon-preset-grid">
                {presetHabitIconOptions.map((icon) => {
                  const active = normalizedDraftIcon === icon;
                  return (
                    <HabitIconOptionButton
                      active={active}
                      icon={icon}
                      key={icon}
                      onSelect={selectHabitIcon}
                    />
                  );
                })}
                <button
                  aria-expanded={iconPickerOpen}
                  aria-label="更多图标"
                  className={`habit-icon-more-button${!draftIconInPreset || iconPickerOpen ? " is-active" : ""}`}
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    toggleIconPicker();
                  }}
                >
                  <MoreIcon size={20} />
                  <span>更多</span>
                  <small>{draftIconInPreset ? `${allHabitIconNames.length} 个` : normalizedDraftIcon}</small>
                </button>
              </div>
              {iconPickerOpen ? (
                <div className="habit-icon-dropdown">
                  <label className="habit-icon-search">
                    <Search size={15} aria-hidden="true" />
                    <input
                      aria-label="搜索习惯图标"
                      placeholder="搜索图标，例如 book、run、heart"
                      value={iconQuery}
                      onChange={(event) => {
                        setIconQuery(event.target.value);
                        setVisibleIconCount(iconPageSize);
                      }}
                    />
                  </label>
                  <div className="habit-icon-picker">
                    {filteredIconOptions.map((icon) => {
                      const active = normalizeHabitIconName(draft.icon) === icon;
                      return (
                        <HabitIconOptionButton
                          active={active}
                          icon={icon}
                          key={icon}
                          onSelect={selectHabitIcon}
                        />
                      );
                    })}
                    {hasMoreIcons ? (
                      <button
                        className="habit-icon-load-more"
                        type="button"
                        onClick={() => setVisibleIconCount((count) => count + iconPageSize)}
                      >
                        <MoreHorizontal size={20} />
                        <span>加载更多</span>
                        <small>{matchingIconOptions.length - filteredIconOptions.length} 个</small>
                      </button>
                    ) : null}
                    {filteredIconOptions.length === 0 ? <div className="habit-icon-empty">没有匹配的图标</div> : null}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          <label>
            <span>主题颜色</span>
            <div className="habit-color-picker">
              {habitColorValues.map((color) => (
                <button
                  aria-label={`习惯颜色 ${colorLabels[color]}`}
                  aria-pressed={draft.color === color}
                  className={`color-${color}${draft.color === color ? " is-active" : ""}`}
                  key={color}
                  type="button"
                  onClick={() => updateDraft({ color })}
                >
                  {draft.color === color ? <Check size={15} /> : null}
                </button>
              ))}
            </div>
          </label>
          <div className="form-grid">
            <label>
              <span>频率</span>
              <Select
                value={draft.frequency}
                options={frequencyOptions}
                onChange={(next) => updateDraft({ frequency: next as HabitFrequency })}
              />
            </label>
            <label>
              <span>间隔</span>
              <Input value={draft.interval} onChange={(event) => updateDraft({ interval: event.target.value })} type="number" min="1" shadow />
            </label>
          </div>
          {draft.frequency === "WEEKLY" ? (
            <label>
              <span>每周哪几天</span>
              <div className="habit-day-picker">
                {habitWeekdayValues.map((day) => {
                  const active = draft.weekDays.includes(day);
                  return (
                    <button
                      aria-pressed={active}
                      className={active ? "is-active" : ""}
                      key={day}
                      type="button"
                      onClick={() => updateDraft({
                        weekDays: active ? draft.weekDays.filter((item) => item !== day) : [...draft.weekDays, day]
                      })}
                    >
                      {weekdayLabels[day]}
                    </button>
                  );
                })}
              </div>
            </label>
          ) : null}
          {draft.frequency === "MONTHLY" ? (
            <label>
              <span>每月哪几天</span>
              <div className="habit-monthday-picker">
                {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => {
                  const active = draft.monthDays.includes(day);
                  return (
                    <button
                      aria-pressed={active}
                      className={active ? "is-active" : ""}
                      key={day}
                      type="button"
                      onClick={() => updateDraft({
                        monthDays: active ? draft.monthDays.filter((item) => item !== day) : [...draft.monthDays, day].sort((left, right) => left - right)
                      })}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </label>
          ) : null}
          <div className="form-grid">
            <label>
              <span>开始日期</span>
              <Input value={draft.startDate} onChange={(event) => updateDraft({ startDate: event.target.value })} type="date" required shadow />
            </label>
            <label>
              <span>结束日期</span>
              <Input value={draft.endDate} onChange={(event) => updateDraft({ endDate: event.target.value })} type="date" shadow />
            </label>
          </div>
          <label>
            <span>备注</span>
            <textarea value={draft.notes} onChange={(event) => updateDraft({ notes: event.target.value })} rows={3} />
          </label>
          {formMessage ? <div className="inline-alert">{formMessage}</div> : null}
          <Button block className="primary-button" disabled={saving} htmlType="submit" icon={<Plus size={16} />} loading={saving} type="primary">
            {editingHabit ? "保存" : "添加"}
          </Button>
        </form>
      </Modal>

      <Modal
        className="habit-modal habit-note-modal"
        open={Boolean(noteLog)}
        title="记录日志"
        width={520}
        footer={null}
        typewriter={false}
        onClose={() => setNoteLog(null)}
      >
        <form className="task-form habit-note-form" onSubmit={submitNote}>
          <label>
            <span>{noteLog?.date ?? ""}</span>
            <textarea value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} rows={5} placeholder="写一点这次打卡的记录" />
          </label>
          <Button block className="primary-button" htmlType="submit" icon={<PenLine size={16} />} type="primary">
            保存日志
          </Button>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteHabitTarget)}
        title="删除习惯"
        description={<span>永久删除「{deleteHabitTarget?.title ?? ""}」及所有打卡记录？</span>}
        confirmText="删除"
        danger
        loading={deleteBusy}
        onCancel={closeDeleteHabitConfirm}
        onConfirm={() => void confirmDeleteHabit()}
      />

      <section className="habit-panel">
        <aside className="habit-list-panel">
          {message ? <div className="inline-alert">{message}</div> : null}
          <div className="habit-list" aria-busy={loading}>
            {habits.length === 0 && !loading ? <Card className="empty-state" type="dashed">暂无习惯</Card> : null}
            {habits.map((habit) => (
              <Card
                className={`habit-list-card color-${habit.color}${selectedId === habit.id ? " is-active" : ""}${habit.archivedAt ? " is-archived" : ""}`}
                key={habit.id}
                onClick={() => setSelectedId(habit.id)}
                pattern="default"
              >
                <button className="habit-list-main" type="button" onClick={() => setSelectedId(habit.id)}>
                  <HabitIconBadge habit={habit} />
                  <span>
                    <strong>{habit.title}</strong>
                    <small>{scheduleLabel(habit)}</small>
                  </span>
                </button>
                <div className="habit-card-stats">
                  <span><Flame size={14} /> {habit.stats.currentStreak}{habit.stats.currentStreakUnit}</span>
                  <span>{habit.stats.monthCompletionRate}%</span>
                </div>
                <div className="habit-card-actions" onClick={(event) => event.stopPropagation()}>
                  <Button
                    aria-label={!habit.todayPlanned ? `今日${habit.title}非计划` : habit.todayChecked ? `取消今日${habit.title}打卡` : `今日${habit.title}打卡`}
                    className={habit.todayChecked ? "habit-check-button is-checked" : "habit-check-button"}
                    disabled={!habit.todayPlanned || Boolean(habit.archivedAt)}
                    icon={habit.todayChecked ? <Check size={16} /> : habit.todayPlanned ? <Plus size={16} /> : <Flame size={16} />}
                    size="small"
                    type={habit.todayChecked ? "primary" : "default"}
                    onClick={() => void toggleToday(habit)}
                  />
                  <Button aria-label={`编辑${habit.title}`} icon={<Edit3 size={15} />} size="small" type="default" onClick={() => beginEdit(habit)} />
                </div>
              </Card>
            ))}
          </div>
        </aside>

        <section className="habit-detail-panel" aria-busy={detailLoading}>
          {selectedHabit ? (
            <>
              <Card className={`habit-detail-header color-${selectedHabit.color}`} pattern="default">
                <div className="habit-detail-title">
                  <HabitIconBadge habit={selectedHabit} size={24} />
                  <div>
                    <h2>{selectedHabit.title}</h2>
                    <span>{frequencyLabels[selectedHabit.frequency]} · {scheduleLabel(selectedHabit)}</span>
                  </div>
                </div>
                <div className="habit-detail-actions">
                  <Button icon={<Edit3 size={15} />} size="small" type="default" onClick={() => beginEdit(selectedHabit)}>
                  </Button>
                  <Button icon={<RotateCcw size={15} />} size="small" type="default" onClick={() => void archiveHabit(selectedHabit, !selectedHabit.archivedAt)}>
                  </Button>
                  <Button aria-label="删除" danger icon={<Trash2 size={15} />} size="small" type="default" onClick={() => requestDeleteHabit(selectedHabit)}>
                  </Button>
                </div>
              </Card>

              {detail ? (
                <>
                  <div className="habit-stat-grid">
                    <Card className="habit-stat-card" pattern="default">
                      <span>月打卡</span>
                      <strong>{detail.stats.monthCheckIns}</strong>
                      <small>次</small>
                    </Card>
                    <Card className="habit-stat-card" pattern="default">
                      <span>总打卡</span>
                      <strong>{detail.stats.totalCheckIns}</strong>
                      <small>次</small>
                    </Card>
                    <Card className="habit-stat-card" pattern="default">
                      <span>月完成率</span>
                      <strong>{detail.stats.monthCompletionRate}</strong>
                      <small>%</small>
                    </Card>
                    <Card className="habit-stat-card" pattern="default">
                      <span>当前连续</span>
                      <strong>{detail.stats.currentStreak}</strong>
                      <small>{detail.stats.currentStreakUnit}</small>
                    </Card>
                  </div>

                  <Card className={`habit-calendar-card color-${selectedHabit.color}`} pattern="default">
                    <header className="habit-calendar-header">
                      <Button size="small" type="default" onClick={() => setDetailMonth(moveMonth(detailMonth, -1))}>上月</Button>
                      <strong>{monthLabel(detailMonth)}</strong>
                      <Button size="small" type="default" onClick={() => setDetailMonth(moveMonth(detailMonth, 1))}>下月</Button>
                    </header>
                    <div className="habit-calendar-weekdays">
                      {["一", "二", "三", "四", "五", "六", "日"].map((day) => <span key={day}>周{day}</span>)}
                    </div>
                    <div className="habit-calendar-grid">
                      {detail.calendarDays.map((day) => {
                        const firstDay = day.day === 1 ? new Date(`${day.date}T00:00:00`).getDay() : 0;
                        const gridColumnStart = day.day === 1 ? (firstDay === 0 ? 7 : firstDay) : undefined;
                        return (
                          <button
                            aria-label={`${day.date}${day.checked ? "已打卡" : day.planned ? "未打卡" : "非计划日"}`}
                            className={[
                              "habit-calendar-day",
                              day.planned ? "is-planned" : "",
                              day.checked ? "is-checked" : "",
                              day.future ? "is-future" : ""
                            ].filter(Boolean).join(" ")}
                            disabled={!day.planned || day.future}
                            key={day.date}
                            style={gridColumnStart ? { gridColumnStart } : undefined}
                            type="button"
                            onClick={() => void toggleCalendarDay(day.date, day.checked)}
                          >
                            <span>{day.day}</span>
                            {day.checked ? <SelectedHabitCalendarIcon className="habit-calendar-day-icon" size={18} aria-hidden="true" /> : null}
                          </button>
                        );
                      })}
                    </div>
                  </Card>

                  <Card className="habit-log-card" pattern="default">
                    <header>
                      <h3>记录日志</h3>
                      <span>{detail.logs.length} 条</span>
                    </header>
                    <div className="habit-log-list">
                      {detail.logs.length === 0 ? <p className="inline-muted">这个月还没有打卡日志</p> : null}
                      {detail.logs.map((log) => (
                        <article className="habit-log-item" key={log.id}>
                          <div>
                            <strong>{log.date}</strong>
                            <p>{log.note || "未填写日志"}</p>
                          </div>
                          <Button icon={<PenLine size={15} />} size="small" type="default" onClick={() => openNote(log)}>
                            编辑日志
                          </Button>
                        </article>
                      ))}
                    </div>
                  </Card>
                </>
              ) : null}
            </>
          ) : (
            <Card className="empty-state" type="dashed">选择或新建一个习惯</Card>
          )}
        </section>
      </section>
    </>
  );
}
