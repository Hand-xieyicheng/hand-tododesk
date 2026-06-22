import { type CSSProperties, type FormEvent, useEffect, useMemo, useState } from "react";
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, type DragEndEvent, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  anniversaryCategoryLabels,
  anniversaryCardStyleValues,
  anniversaryRepeatLabels,
  builtInAnniversaryHolidayTemplates,
  resolveBuiltInAnniversaryTemplate,
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

interface AnniversaryPanelProps {
  createOpen: boolean;
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

function draftToPayload(draft: AnniversaryDraft): CreateAnniversaryRequest {
  const calendarType = draft.category === "HOLIDAY" ? draft.calendarType : "SOLAR";
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

interface SortableAnniversaryCardProps {
  event: ApiAnniversaryEvent;
  onDelete(event: ApiAnniversaryEvent): void;
  onEdit(event: ApiAnniversaryEvent): void;
}

function SortableAnniversaryCard({ event, onDelete, onEdit }: SortableAnniversaryCardProps) {
  const Icon = categoryIcons[event.category];
  const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({ id: event.id });
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
      <Card className={`anniversary-card style-${event.cardStyle}${isDragging ? " is-dragging" : ""}`} pattern="default">
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

export function AnniversaryPanel({ createOpen, onCreateOpenChange }: AnniversaryPanelProps) {
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
                  updateDraft({
                    category,
                    cardStyle: category === "HOLIDAY" ? "sunrise" : draft.cardStyle,
                    calendarType: category === "HOLIDAY" ? draft.calendarType : "SOLAR",
                    lunarMonth: category === "HOLIDAY" ? draft.lunarMonth : "",
                    lunarDay: category === "HOLIDAY" ? draft.lunarDay : "",
                    solarTerm: category === "HOLIDAY" ? draft.solarTerm : ""
                  });
                  if (category !== "HOLIDAY") {
                    setTemplateId("CUSTOM");
                  }
                }}
              />
            </label>
            <label>
              <span>日期</span>
              <Input value={draft.date} onChange={(event) => updateDraft({ date: event.target.value })} type="date" required shadow />
            </label>
          </div>
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

      <section className="anniversary-panel">
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
            <div className="anniversary-grid" aria-busy={loading}>
              {visibleAnniversaries.length === 0 && !loading ? <Card className="empty-state" type="dashed">暂无倒数纪念日</Card> : null}
              {visibleAnniversaries.map((event) => (
                <SortableAnniversaryCard
                  event={event}
                  key={event.id}
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
