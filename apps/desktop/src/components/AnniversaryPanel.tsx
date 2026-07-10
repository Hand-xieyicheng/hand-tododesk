import { type CSSProperties, type FormEvent, useEffect, useMemo, useState } from "react";
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, type DragEndEvent, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import DatePicker from "antd/es/date-picker";
import "antd/es/date-picker/style/index";
import dayjs, { type Dayjs } from "dayjs";
import {
  anniversaryCategoryLabels,
  anniversaryCardStyleValues,
  anniversaryRepeatLabels,
  builtInAnniversaryHolidayTemplates,
  lunarDateToSolarKey,
  parseDateKey,
  resolveBuiltInAnniversaryTemplate,
  solarDateToLunarParts,
  toLocalDateKey,
  type AnniversaryCardStyle,
  type AnniversaryCategory,
  type AnniversaryDirection,
  type AnniversaryRepeat,
  type ApiAnniversaryEvent,
  type CreateAnniversaryRequest
} from "@todo/shared";
import { Button, Card, Input, Modal, Select } from "animal-island-ui";
import { Cake, CalendarHeart, Edit3, Gift, Heart, Hourglass, Plus, Trash2 } from "lucide-react";
import { api } from "../api/client";
import { NoDataPlaceholder } from "./NoDataPlaceholder";

interface AnniversaryPanelProps {
  createOpen: boolean;
  pageAnimationEnabled?: boolean;
  refreshSignal?: number;
  onCreateOpenChange(open: boolean): void;
}

type CategoryFilter = "ALL" | AnniversaryCategory;

interface AnniversaryDraft {
  title: string;
  notes: string;
  category: AnniversaryCategory;
  date: string;
  repeat: AnniversaryRepeat;
  direction: AnniversaryDirection;
  cardStyle: AnniversaryCardStyle;
  calendarType: "SOLAR" | "LUNAR" | "SOLAR_TERM";
  lunarMonth: string;
  lunarDay: string;
  solarTerm: "QINGMING" | "";
}

const categoryTabs: Array<{ key: CategoryFilter; label: string }> = [
  { key: "ALL", label: "所有" },
  { key: "ANNIVERSARY", label: "纪念日" },
  { key: "COUNTDOWN", label: "倒数日" },
  { key: "BIRTHDAY", label: "生日" },
  { key: "HOLIDAY", label: "节日" }
];

const categoryOptions = categoryTabs
  .filter((item): item is { key: AnniversaryCategory; label: string } => item.key !== "ALL")
  .map((item) => ({ key: item.key, label: item.label }));

const repeatOptions = (Object.entries(anniversaryRepeatLabels) as Array<[AnniversaryRepeat, string]>)
  .map(([key, label]) => ({ key, label }));

const directionOptions: Array<{ key: AnniversaryDirection; label: string }> = [
  { key: "AUTO", label: "按类型自动" },
  { key: "ELAPSED", label: "正数日（已经）" },
  { key: "COUNTDOWN", label: "倒数日（还有）" }
];

const holidayTemplateOptions = [
  { key: "CUSTOM", label: "手动输入" },
  ...builtInAnniversaryHolidayTemplates.map((template) => ({ key: template.id, label: template.title }))
];

const birthdayCalendarTypeOptions = [
  { key: "SOLAR", label: "阳历" },
  { key: "LUNAR", label: "阴历" }
];

const lunarMonthOptions = Array.from({ length: 12 }, (_, index) => {
  const value = String(index + 1);
  return { key: value, label: `${value}月` };
});

const lunarDayOptions = Array.from({ length: 30 }, (_, index) => {
  const value = String(index + 1);
  return { key: value, label: `${value}日` };
});

const styleLabels: Record<AnniversaryCardStyle, string> = {
  classic: "经典",
  lavender: "薰衣草",
  mint: "薄荷",
  ocean: "海风",
  rose: "玫瑰",
  sunrise: "朝阳"
};

const categoryIcons: Record<AnniversaryCategory, typeof Heart> = {
  ANNIVERSARY: Heart,
  COUNTDOWN: Hourglass,
  BIRTHDAY: Cake,
  HOLIDAY: Gift
};

function emptyDraft(category: AnniversaryCategory = "COUNTDOWN"): AnniversaryDraft {
  return {
    title: "",
    notes: "",
    category,
    date: toLocalDateKey(),
    repeat: "NONE",
    direction: "AUTO",
    cardStyle: category === "HOLIDAY" ? "sunrise" : "lavender",
    calendarType: "SOLAR",
    lunarMonth: "",
    lunarDay: "",
    solarTerm: ""
  };
}

function draftFromEvent(event: ApiAnniversaryEvent): AnniversaryDraft {
  return {
    title: event.title,
    notes: event.notes ?? "",
    category: event.category,
    date: event.date,
    repeat: event.repeat,
    direction: event.direction,
    cardStyle: event.cardStyle,
    calendarType: event.calendarType,
    lunarMonth: event.lunarMonth ? String(event.lunarMonth) : "",
    lunarDay: event.lunarDay ? String(event.lunarDay) : "",
    solarTerm: event.solarTerm ?? ""
  };
}

function draftFromTemplate(templateId: string): AnniversaryDraft | null {
  const input = resolveBuiltInAnniversaryTemplate(templateId);
  if (!input) {
    return null;
  }

  return {
    title: input.title,
    notes: input.notes ?? "",
    category: input.category,
    date: input.date,
    repeat: input.repeat,
    direction: input.direction,
    cardStyle: input.cardStyle,
    calendarType: input.calendarType,
    lunarMonth: input.lunarMonth ? String(input.lunarMonth) : "",
    lunarDay: input.lunarDay ? String(input.lunarDay) : "",
    solarTerm: input.solarTerm ?? ""
  };
}

function calendarTypeForCategory(category: AnniversaryCategory, calendarType: AnniversaryDraft["calendarType"]): AnniversaryDraft["calendarType"] {
  if (category === "HOLIDAY") {
    return calendarType;
  }
  if (category === "BIRTHDAY") {
    return calendarType === "LUNAR" ? "LUNAR" : "SOLAR";
  }
  return "SOLAR";
}

function datePickerValue(value: string): Dayjs | null {
  if (!value) {
    return null;
  }

  const parsed = dayjs(`${value}T00:00:00`);
  return parsed.isValid() ? parsed : null;
}

function parseTypedDateKey(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(trimmed);
  if (!match) {
    return "";
  }

  const year = match[1] ?? "";
  const month = match[2] ?? "";
  const day = match[3] ?? "";
  const candidate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  const parsed = dayjs(`${candidate}T00:00:00`);
  return parsed.isValid() && parsed.format("YYYY-MM-DD") === candidate ? candidate : "";
}

function lunarFieldsFromSolarDate(dateKey: string): Partial<AnniversaryDraft> {
  try {
    const lunar = solarDateToLunarParts(dateKey);
    return {
      lunarMonth: String(lunar.month),
      lunarDay: String(lunar.day)
    };
  } catch {
    return {};
  }
}

function lunarYearFromSolarDate(dateKey: string) {
  try {
    return solarDateToLunarParts(dateKey).year;
  } catch {
    const parsed = parseDateKey(dateKey);
    return parsed.year || new Date().getFullYear();
  }
}

function solarDateFromLunarFields(dateKey: string, lunarMonth: string, lunarDay: string): string | null {
  const month = Number(lunarMonth);
  const day = Number(lunarDay);
  if (!month || !day) {
    return null;
  }

  try {
    return lunarDateToSolarKey(lunarYearFromSolarDate(dateKey), month, day);
  } catch {
    return null;
  }
}

function draftToPayload(draft: AnniversaryDraft): CreateAnniversaryRequest {
  const calendarType = calendarTypeForCategory(draft.category, draft.calendarType);
  return {
    title: draft.title,
    notes: draft.notes || null,
    category: draft.category,
    date: draft.date,
    repeat: draft.repeat,
    direction: draft.direction,
    cardStyle: draft.cardStyle,
    calendarType,
    lunarMonth: calendarType === "LUNAR" && draft.lunarMonth ? Number(draft.lunarMonth) : null,
    lunarDay: calendarType === "LUNAR" && draft.lunarDay ? Number(draft.lunarDay) : null,
    solarTerm: calendarType === "SOLAR_TERM" && draft.solarTerm ? draft.solarTerm : null
  };
}

function directionBadge(event: ApiAnniversaryEvent) {
  if (event.displayValue === "今天") {
    return "今天";
  }
  return event.displayDirection === "COUNTDOWN" ? "倒数" : "正数";
}

function pageMotionStyle(pageAnimationEnabled: boolean, animationIndex: number): CSSProperties | undefined {
  return pageAnimationEnabled
    ? { "--page-motion-delay": `${animationIndex * 100}ms` } as CSSProperties
    : undefined;
}

interface SortableAnniversaryCardProps {
  animationIndex?: number;
  event: ApiAnniversaryEvent;
  pageAnimationEnabled?: boolean;
  onDelete(event: ApiAnniversaryEvent): void;
  onEdit(event: ApiAnniversaryEvent): void;
}

function SortableAnniversaryCard({ animationIndex = 0, event, pageAnimationEnabled = true, onDelete, onEdit }: SortableAnniversaryCardProps) {
  const Icon = categoryIcons[event.category];
  const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({ id: event.id });
  const isToday = event.displayValue === "今天" || event.daysDelta === 0;
  const cardClassName = `anniversary-card style-${event.cardStyle}${isToday ? " is-today" : ""}${isDragging ? " is-dragging" : ""}${pageAnimationEnabled ? " page-motion-card page-motion-from-right" : ""}`;
  const style: CSSProperties = {
    opacity: isDragging ? 0.72 : undefined,
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 5 : undefined
  };

  return (
    <div
      className="anniversary-sortable"
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
    >
      <Card className={cardClassName} pattern="default" style={pageMotionStyle(pageAnimationEnabled, animationIndex)}>
        <header>
          <span className="anniversary-icon" aria-hidden="true">
            <Icon size={18} />
          </span>
          <div>
            <h3>{event.title}</h3>
            <span>{anniversaryCategoryLabels[event.category]}</span>
          </div>
        </header>
        <div className="anniversary-value">
          <strong>{event.displayValue}</strong>
          <span>{directionBadge(event)}</span>
        </div>
        <p>{event.displaySubtext}</p>
        <div className="anniversary-card-footer">
          <span>{event.repeat === "NONE" ? "不重复" : anniversaryRepeatLabels[event.repeat]}</span>
          <span>{event.date}</span>
        </div>
        {event.notes ? <p className="anniversary-notes">{event.notes}</p> : null}
        <div className="anniversary-actions" onKeyDown={(actionEvent) => actionEvent.stopPropagation()} onPointerDown={(actionEvent) => actionEvent.stopPropagation()}>
          <Button aria-label={`编辑${event.title}`} icon={<Edit3 size={15} />} size="small" type="default" onClick={() => onEdit(event)} />
          <Button aria-label={`删除${event.title}`} danger icon={<Trash2 size={15} />} size="small" type="default" onClick={() => onDelete(event)} />
        </div>
      </Card>
    </div>
  );
}

export function AnniversaryPanel({ createOpen, pageAnimationEnabled = true, refreshSignal = 0, onCreateOpenChange }: AnniversaryPanelProps) {
  const [anniversaries, setAnniversaries] = useState<ApiAnniversaryEvent[]>([]);
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>("ALL");
  const [draft, setDraft] = useState<AnniversaryDraft>(() => emptyDraft());
  const [editingEvent, setEditingEvent] = useState<ApiAnniversaryEvent | null>(null);
  const [templateId, setTemplateId] = useState("CUSTOM");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [formMessage, setFormMessage] = useState("");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const modalOpen = createOpen || Boolean(editingEvent);
  const visibleAnniversaries = useMemo(() => (
    activeCategory === "ALL"
      ? anniversaries
      : anniversaries.filter((event) => event.category === activeCategory)
  ), [activeCategory, anniversaries]);
  const anniversaryListEmpty = visibleAnniversaries.length === 0 && !loading;

  async function load() {
    setMessage("");
    setLoading(true);
    try {
      const payload = await api.anniversaries();
      setAnniversaries(payload.anniversaries);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "倒数纪念日加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (refreshSignal > 0) {
      void load();
    }
  }, [refreshSignal]);

  useEffect(() => {
    if (createOpen && !editingEvent) {
      const category = activeCategory === "ALL" ? "COUNTDOWN" : activeCategory;
      setDraft(emptyDraft(category));
      setTemplateId("CUSTOM");
      setFormMessage("");
    }
  }, [activeCategory, createOpen, editingEvent]);

  function updateDraft(patch: Partial<AnniversaryDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function updateDate(nextDate: string) {
    const calendarType = calendarTypeForCategory(draft.category, draft.calendarType);
    updateDraft({
      date: nextDate,
      ...(calendarType === "LUNAR" ? lunarFieldsFromSolarDate(nextDate) : {})
    });
  }

  function updateDateFromPicker(nextValue: Dayjs | null) {
    if (nextValue) {
      updateDate(nextValue.format("YYYY-MM-DD"));
    }
  }

  function commitTypedDateValue(nextValue: string) {
    const parsed = parseTypedDateKey(nextValue);
    if (parsed) {
      updateDate(parsed);
    }
  }

  function updateBirthdayCalendarType(next: string) {
    const calendarType = next === "LUNAR" ? "LUNAR" : "SOLAR";
    updateDraft({
      calendarType,
      lunarMonth: "",
      lunarDay: "",
      ...(calendarType === "LUNAR" ? lunarFieldsFromSolarDate(draft.date) : {}),
      solarTerm: ""
    });
  }

  function updateLunarDateField(patch: Pick<Partial<AnniversaryDraft>, "lunarMonth" | "lunarDay">) {
    const lunarMonth = patch.lunarMonth ?? draft.lunarMonth;
    const lunarDay = patch.lunarDay ?? draft.lunarDay;
    const solarDate = solarDateFromLunarFields(draft.date, lunarMonth, lunarDay);
    updateDraft({
      ...patch,
      ...(solarDate ? { date: solarDate } : {})
    });
  }

  function closeModal() {
    setEditingEvent(null);
    setFormMessage("");
    setTemplateId("CUSTOM");
    onCreateOpenChange(false);
  }

  function beginEdit(event: ApiAnniversaryEvent) {
    setEditingEvent(event);
    setDraft(draftFromEvent(event));
    setTemplateId("CUSTOM");
    setFormMessage("");
  }

  function applyTemplate(nextTemplateId: string) {
    setTemplateId(nextTemplateId);
    if (nextTemplateId === "CUSTOM") {
      return;
    }

    const nextDraft = draftFromTemplate(nextTemplateId);
    if (nextDraft) {
      setDraft(nextDraft);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFormMessage("");
    try {
      const payload = draftToPayload(draft);
      if (editingEvent) {
        await api.updateAnniversary(editingEvent.id, payload);
      } else {
        await api.createAnniversary(payload);
      }
      closeModal();
      await load();
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function deleteAnniversary(event: ApiAnniversaryEvent) {
    setMessage("");
    try {
      await api.deleteAnniversary(event.id);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除失败");
    }
  }

  async function persistAnniversaryOrder(nextAnniversaries: ApiAnniversaryEvent[]) {
    setMessage("");
    try {
      await api.updateAnniversaryOrder({ orderedIds: nextAnniversaries.map((event) => event.id) });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "排序保存失败");
      await load();
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const activeId = String(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : "";
    if (!overId || activeId === overId) {
      return;
    }

    const oldIndex = visibleAnniversaries.findIndex((item) => item.id === activeId);
    const newIndex = visibleAnniversaries.findIndex((item) => item.id === overId);
    if (oldIndex < 0 || newIndex < 0) {
      return;
    }

    const visibleIds = new Set(visibleAnniversaries.map((item) => item.id));
    const reorderedVisibleAnniversaries = arrayMove(visibleAnniversaries, oldIndex, newIndex);
    let visibleIndex = 0;
    const nextAnniversaries = anniversaries.map((item) => {
      if (!visibleIds.has(item.id)) {
        return item;
      }
      return reorderedVisibleAnniversaries[visibleIndex++] ?? item;
    }).map((item, index) => ({
      ...item,
      sortOrder: (index + 1) * 1000
    }));
    setAnniversaries(nextAnniversaries);
    void persistAnniversaryOrder(nextAnniversaries);
  }

  return (
    <>
      <Modal
        className="anniversary-modal"
        open={modalOpen}
        title={editingEvent ? "编辑倒数纪念日" : "新建倒数纪念日"}
        width={760}
        footer={null}
        typewriter={false}
        onClose={closeModal}
      >
        <form className="task-form anniversary-form" onSubmit={submit}>
          <label>
            <span>标题</span>
            <Input value={draft.title} onChange={(event) => updateDraft({ title: event.target.value })} required maxLength={160} allowClear shadow />
          </label>
          <div className="form-grid">
            <label>
              <span>分类</span>
              <Select
                aria-label="分类"
                value={draft.category}
                options={categoryOptions}
                onChange={(next) => {
                  const category = next as AnniversaryCategory;
                  const calendarType = calendarTypeForCategory(category, draft.calendarType);
                  updateDraft({
                    category,
                    cardStyle: category === "HOLIDAY" ? "sunrise" : draft.cardStyle,
                    calendarType,
                    lunarMonth: calendarType === "LUNAR" ? draft.lunarMonth : "",
                    lunarDay: calendarType === "LUNAR" ? draft.lunarDay : "",
                    solarTerm: calendarType === "SOLAR_TERM" ? draft.solarTerm : ""
                  });
                  if (category !== "HOLIDAY") {
                    setTemplateId("CUSTOM");
                  }
                }}
              />
            </label>
            <label
              onChangeCapture={(event) => {
                const target = event.nativeEvent.target;
                if (target instanceof HTMLInputElement) {
                  commitTypedDateValue(target.value);
                }
              }}
            >
              <span>日期</span>
              <DatePicker
                allowClear={false}
                aria-label="日期"
                className="anniversary-date-picker"
                classNames={{ popup: { root: "anniversary-date-picker-dropdown" } }}
                format="YYYY/MM/DD"
                inputReadOnly={false}
                placeholder="选择日期"
                showNow={false}
                styles={{ popup: { root: { zIndex: 2147483000 } } }}
                value={datePickerValue(draft.date)}
                onBlur={(event) => {
                  const target = event.target as HTMLInputElement;
                  commitTypedDateValue(target.value);
                }}
                onChange={updateDateFromPicker}
              />
            </label>
          </div>
          {draft.category === "BIRTHDAY" ? (
            <div className="form-grid">
              <label>
                <span>历法</span>
                <Select
                  aria-label="历法"
                  value={calendarTypeForCategory(draft.category, draft.calendarType)}
                  options={birthdayCalendarTypeOptions}
                  onChange={(next) => updateBirthdayCalendarType(String(next))}
                />
              </label>
              {draft.calendarType === "LUNAR" ? (
                <>
                  <label className="anniversary-scrollable-select-field">
                    <span>阴历月份</span>
                    <Select aria-label="阴历月份" value={draft.lunarMonth} options={lunarMonthOptions} onChange={(next) => updateLunarDateField({ lunarMonth: String(next) })} />
                  </label>
                  <label className="anniversary-scrollable-select-field">
                    <span>阴历日期</span>
                    <Select aria-label="阴历日期" value={draft.lunarDay} options={lunarDayOptions} onChange={(next) => updateLunarDateField({ lunarDay: String(next) })} />
                  </label>
                </>
              ) : null}
            </div>
          ) : null}
          {draft.category === "HOLIDAY" ? (
            <label className="anniversary-template-field">
              <span>节日模板</span>
              <Select aria-label="节日模板" value={templateId} options={holidayTemplateOptions} onChange={(next) => applyTemplate(String(next))} />
            </label>
          ) : null}
          <div className="form-grid">
            <label>
              <span>重复</span>
              <Select aria-label="重复" value={draft.repeat} onChange={(next) => updateDraft({ repeat: next as AnniversaryRepeat })} options={repeatOptions} />
            </label>
            <label>
              <span>方向</span>
              <Select aria-label="方向" value={draft.direction} onChange={(next) => updateDraft({ direction: next as AnniversaryDirection })} options={directionOptions} />
            </label>
          </div>
          <label>
            <span>卡片样式</span>
            <div className="anniversary-style-picker">
              {anniversaryCardStyleValues.map((style) => (
                <button
                  aria-pressed={draft.cardStyle === style}
                  className={`anniversary-style-chip style-${style}${draft.cardStyle === style ? " is-active" : ""}`}
                  key={style}
                  type="button"
                  onClick={() => updateDraft({ cardStyle: style })}
                >
                  <span aria-hidden="true" />
                  {styleLabels[style]}
                </button>
              ))}
            </div>
          </label>
          <label>
            <span>备注</span>
            <textarea value={draft.notes} onChange={(event) => updateDraft({ notes: event.target.value })} rows={3} />
          </label>
          {formMessage ? <div className="inline-alert">{formMessage}</div> : null}
          <Button block className="primary-button" disabled={saving} htmlType="submit" icon={<Plus size={16} />} loading={saving} type="primary">
            {editingEvent ? "保存" : "添加"}
          </Button>
        </form>
      </Modal>

      <section className={anniversaryListEmpty ? "anniversary-panel is-empty" : "anniversary-panel"}>
        <div className="anniversary-tabs segmented-control" aria-label="倒数纪念日分类">
          {categoryTabs.map((tab) => (
            <Button
              className={activeCategory === tab.key ? "is-active" : ""}
              key={tab.key}
              type={activeCategory === tab.key ? "primary" : "text"}
              onClick={() => setActiveCategory(tab.key)}
            >
              {tab.label}
            </Button>
          ))}
        </div>
        {message ? <div className="inline-alert">{message}</div> : null}
        <DndContext collisionDetection={closestCenter} sensors={sensors} onDragEnd={handleDragEnd}>
          <SortableContext items={visibleAnniversaries.map((event) => event.id)} strategy={rectSortingStrategy}>
            <div className={anniversaryListEmpty ? "anniversary-grid is-empty" : "anniversary-grid"} aria-busy={loading}>
              {anniversaryListEmpty ? <NoDataPlaceholder className="anniversary-empty-placeholder" /> : null}
              {visibleAnniversaries.map((event, index) => (
                <SortableAnniversaryCard
                  animationIndex={index}
                  event={event}
                  key={event.id}
                  pageAnimationEnabled={pageAnimationEnabled}
                  onDelete={(nextEvent) => void deleteAnniversary(nextEvent)}
                  onEdit={beginEdit}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </section>
    </>
  );
}
