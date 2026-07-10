import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent
} from "react";
import { Sparkles, X } from "lucide-react";
import type { AiChangedDomain } from "@todo/shared";
import { AiComposer } from "./AiComposer";
import { AiMessageList } from "./AiMessageList";
import { AiSessionRail } from "./AiSessionRail";
import { useAiAssistant } from "./useAiAssistant";

export interface AiAssistantProps {
  enabled: boolean;
  onDomainsChanged(domains: AiChangedDomain[]): void | Promise<void>;
}

interface FloatingPosition {
  left: number;
  top: number;
}

interface TriggerDragState {
  pointerId: number;
  startX: number;
  startY: number;
  startLeft: number;
  startTop: number;
  currentTop: number;
  width: number;
  height: number;
  moved: boolean;
}

interface PanelDragState {
  pointerId: number;
  startX: number;
  startY: number;
  startLeft: number;
  startTop: number;
  currentLeft: number;
  currentTop: number;
  width: number;
  height: number;
}

const TRIGGER_DRAG_THRESHOLD = 4;
const PANEL_POSITION_STORAGE_KEY = "tododesk.ai-assistant.panel-position.v1";
const TRIGGER_POSITION_STORAGE_KEY = "tododesk.ai-assistant.trigger-position.v1";

function triggerEdgeGap() {
  return window.innerWidth <= 700 ? 12 : 22;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function clampFloatingPosition(
  position: FloatingPosition,
  width: number,
  height: number,
  gap = 0
): FloatingPosition {
  return {
    left: clamp(position.left, gap, window.innerWidth - width - gap),
    top: clamp(position.top, gap, window.innerHeight - height - gap)
  };
}

function readStoredPosition(key: string): FloatingPosition | null {
  try {
    const stored = window.localStorage.getItem(key);
    if (!stored) {
      return null;
    }
    const parsed = JSON.parse(stored) as { x?: unknown; y?: unknown };
    if (
      typeof parsed.x !== "number"
      || !Number.isFinite(parsed.x)
      || typeof parsed.y !== "number"
      || !Number.isFinite(parsed.y)
    ) {
      return null;
    }
    return { left: parsed.x, top: parsed.y };
  } catch {
    return null;
  }
}

function persistPosition(key: string, position: FloatingPosition) {
  try {
    window.localStorage.setItem(key, JSON.stringify({
      x: position.left,
      y: position.top
    }));
  } catch {
    // Position persistence is optional when browser storage is unavailable.
  }
}

export function AiAssistant({ enabled, onDomainsChanged }: AiAssistantProps) {
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [panelDragging, setPanelDragging] = useState(false);
  const [panelPosition, setPanelPosition] = useState<FloatingPosition | null>(() => (
    readStoredPosition(PANEL_POSITION_STORAGE_KEY)
  ));
  const [triggerPosition, setTriggerPosition] = useState<FloatingPosition | null>(() => (
    readStoredPosition(TRIGGER_POSITION_STORAGE_KEY)
  ));
  const messageAreaRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelDragStateRef = useRef<PanelDragState | null>(null);
  const dragStateRef = useRef<TriggerDragState | null>(null);
  const suppressNextClickRef = useRef(false);
  const state = useAiAssistant(open);

  useLayoutEffect(() => {
    function keepFloatingElementsInViewport() {
      const trigger = triggerRef.current;
      if (trigger) {
        const { width, height } = trigger.getBoundingClientRect();
        const gap = triggerEdgeGap();
        setTriggerPosition((current) => current
          ? clampFloatingPosition(current, width, height, gap)
          : current);
      }

      const panel = panelRef.current;
      if (open && panel) {
        const { width, height } = panel.getBoundingClientRect();
        setPanelPosition((current) => current
          ? clampFloatingPosition(current, width, height)
          : current);
      }
    }

    keepFloatingElementsInViewport();
    window.addEventListener("resize", keepFloatingElementsInViewport);
    return () => window.removeEventListener("resize", keepFloatingElementsInViewport);
  }, [open]);

  useLayoutEffect(() => {
    const messageArea = messageAreaRef.current;
    if (!open || !messageArea) {
      return;
    }
    messageArea.scrollTop = messageArea.scrollHeight;
  }, [open, state.activeSessionId, state.messages]);

  function handlePanelPointerDown(event: ReactPointerEvent<HTMLElement>) {
    const target = event.target;
    if (
      event.button !== 0
      || (target instanceof Element && target.closest("button"))
    ) {
      return;
    }
    const panel = panelRef.current;
    if (!panel) {
      return;
    }
    const bounds = panel.getBoundingClientRect();
    panelDragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startLeft: bounds.left,
      startTop: bounds.top,
      currentLeft: bounds.left,
      currentTop: bounds.top,
      width: bounds.width,
      height: bounds.height
    };
    setPanelPosition({ left: bounds.left, top: bounds.top });
    setPanelDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function handlePanelPointerMove(event: ReactPointerEvent<HTMLElement>) {
    const drag = panelDragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    const next = clampFloatingPosition({
      left: drag.startLeft + event.clientX - drag.startX,
      top: drag.startTop + event.clientY - drag.startY
    }, drag.width, drag.height);
    drag.currentLeft = next.left;
    drag.currentTop = next.top;
    setPanelPosition(next);
  }

  function finishPanelDrag(event: ReactPointerEvent<HTMLElement>) {
    const drag = panelDragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    const next = {
      left: drag.currentLeft,
      top: drag.currentTop
    };
    setPanelPosition(next);
    persistPosition(PANEL_POSITION_STORAGE_KEY, next);
    setPanelDragging(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    panelDragStateRef.current = null;
  }

  function handleTriggerPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) {
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startLeft: bounds.left,
      startTop: bounds.top,
      currentTop: bounds.top,
      width: bounds.width,
      height: bounds.height,
      moved: false
    };
    setTriggerPosition({ left: bounds.left, top: bounds.top });
    setDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handleTriggerPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (Math.hypot(deltaX, deltaY) >= TRIGGER_DRAG_THRESHOLD) {
      drag.moved = true;
    }
    const gap = triggerEdgeGap();
    const left = clamp(
      drag.startLeft + deltaX,
      gap,
      window.innerWidth - drag.width - gap
    );
    const top = clamp(
      drag.startTop + deltaY,
      gap,
      window.innerHeight - drag.height - gap
    );
    drag.currentTop = top;
    setTriggerPosition({ left, top });
  }

  function finishTriggerDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    const gap = triggerEdgeGap();
    const next = {
      left: Math.max(gap, window.innerWidth - drag.width - gap),
      top: clamp(drag.currentTop, gap, window.innerHeight - drag.height - gap)
    };
    setTriggerPosition(next);
    persistPosition(TRIGGER_POSITION_STORAGE_KEY, next);
    setDragging(false);
    if (drag.moved) {
      suppressNextClickRef.current = true;
      window.setTimeout(() => {
        suppressNextClickRef.current = false;
      }, 0);
    }
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    dragStateRef.current = null;
  }

  function toggleOpen() {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    setOpen((value) => !value);
  }

  if (!enabled) {
    return null;
  }

  return (
    <div className={`ai-assistant${open ? " is-open" : ""}`}>
      {open ? (
        <section
          aria-label="AI 助手"
          className={`ai-assistant-panel${panelPosition ? " is-positioned" : ""}${panelDragging ? " is-dragging" : ""}`}
          ref={panelRef}
          role="dialog"
          style={panelPosition ? {
            left: `${panelPosition.left}px`,
            top: `${panelPosition.top}px`
          } satisfies CSSProperties : undefined}
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
            <header
              className="ai-assistant-header"
              onPointerCancel={finishPanelDrag}
              onPointerDown={handlePanelPointerDown}
              onPointerMove={handlePanelPointerMove}
              onPointerUp={finishPanelDrag}
            >
              <div>
                <strong>AI 助手<span> 待办 · 纪念日 · 习惯</span></strong>
              </div>
              <button
                aria-label="关闭 AI 助手弹窗"
                className="ai-assistant-close"
                type="button"
                onClick={() => setOpen(false)}
              >
                <X aria-hidden="true" size={18} />
              </button>
            </header>
            {state.error ? (
              <div className="ai-assistant-error" role="alert">{state.error}</div>
            ) : null}
            <div className="ai-assistant-message-area" ref={messageAreaRef}>
              {state.loading && state.messages.length === 0 ? (
                <p className="ai-assistant-loading">正在加载…</p>
              ) : (
                <AiMessageList
                  messages={state.messages}
                  thinking={state.sending}
                  onDomainsChanged={onDomainsChanged}
                  onProposalChanged={state.replaceProposal}
                />
              )}
            </div>
            <AiComposer
              disabled={!state.activeSessionId}
              sendDisabled={state.sending}
              showSuggestions={!state.loading && state.messages.length === 0}
              onSend={state.send}
            />
          </div>
        </section>
      ) : null}
      <button
        aria-label={open ? "关闭 AI 助手" : "打开 AI 助手"}
        className={`ai-assistant-trigger${triggerPosition ? " is-positioned" : ""}${dragging ? " is-dragging" : ""}`}
        ref={triggerRef}
        style={triggerPosition ? {
          left: `${triggerPosition.left}px`,
          top: `${triggerPosition.top}px`
        } satisfies CSSProperties : undefined}
        type="button"
        onClick={toggleOpen}
        onPointerCancel={finishTriggerDrag}
        onPointerDown={handleTriggerPointerDown}
        onPointerMove={handleTriggerPointerMove}
        onPointerUp={finishTriggerDrag}
      >
        <Sparkles aria-hidden="true" size={22} />
      </button>
    </div>
  );
}
