import type { ApiMemo, ApiTask, ApiThemePreference } from "@todo/shared";

export const desktopSyncTauriEventName = "tododesk:desktop-sync";
export const desktopSyncBrowserEventName = "tododesk:desktop-sync:fallback";

export type DesktopSyncEvent =
  | {
    sourceId: string;
    task: ApiTask;
    type: "task:upserted";
  }
  | {
    sourceId: string;
    taskId: string;
    type: "task:deleted";
  }
  | {
    preference: ApiThemePreference;
    sourceId: string;
    type: "preference:changed";
  }
  | {
    memo: ApiMemo;
    sourceId: string;
    type: "memo:upserted";
  }
  | {
    memoId: string;
    sourceId: string;
    type: "memo:deleted";
  }
  | {
    sourceId: string;
    type: "task-board:reload-requested";
  }
  | {
    sourceId: string;
    type: "habit-board:reload-requested";
  };

type WithoutSource<T> = T extends { sourceId: string } ? Omit<T, "sourceId"> : never;

export type OutboundDesktopSyncEvent = WithoutSource<DesktopSyncEvent>;

function createSourceId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `window-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export const desktopSyncSourceId = createSourceId();

let browserChannel: BroadcastChannel | null | undefined;

function getBrowserChannel() {
  if (browserChannel !== undefined) {
    return browserChannel;
  }
  if (typeof BroadcastChannel === "undefined") {
    browserChannel = null;
    return browserChannel;
  }
  browserChannel = new BroadcastChannel(desktopSyncBrowserEventName);
  return browserChannel;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}

function isDesktopSyncEvent(value: unknown): value is DesktopSyncEvent {
  if (!isRecord(value) || typeof value.sourceId !== "string") {
    return false;
  }

  if (value.type === "task:upserted") {
    return isRecord(value.task) && typeof value.task.id === "string";
  }
  if (value.type === "task:deleted") {
    return typeof value.taskId === "string";
  }
  if (value.type === "preference:changed") {
    return isRecord(value.preference);
  }
  if (value.type === "memo:upserted") {
    return isRecord(value.memo) && typeof value.memo.id === "string";
  }
  if (value.type === "memo:deleted") {
    return typeof value.memoId === "string";
  }
  if (value.type === "task-board:reload-requested") {
    return true;
  }
  if (value.type === "habit-board:reload-requested") {
    return true;
  }
  return false;
}

function dispatchBrowserFallback(event: DesktopSyncEvent) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(desktopSyncBrowserEventName, { detail: event }));
  }
  getBrowserChannel()?.postMessage(event);
}

export async function emitDesktopSyncEvent(event: OutboundDesktopSyncEvent) {
  const payload = {
    sourceId: desktopSyncSourceId,
    ...event
  } as DesktopSyncEvent;

  dispatchBrowserFallback(payload);

  try {
    const { emit } = await import("@tauri-apps/api/event");
    await emit(desktopSyncTauriEventName, payload);
  } catch {
    // Browser preview and unit tests use the fallback path above.
  }
}

export function listenDesktopSyncEvents(handler: (event: DesktopSyncEvent) => void) {
  let cancelled = false;
  let unlistenTauri: (() => void) | null = null;

  function handlePayload(payload: unknown) {
    if (!isDesktopSyncEvent(payload) || payload.sourceId === desktopSyncSourceId) {
      return;
    }
    handler(payload);
  }

  const handleBrowserEvent = (event: Event) => {
    handlePayload((event as CustomEvent<unknown>).detail);
  };
  const handleBroadcastMessage = (event: MessageEvent<unknown>) => {
    handlePayload(event.data);
  };

  if (typeof window !== "undefined") {
    window.addEventListener(desktopSyncBrowserEventName, handleBrowserEvent);
  }
  getBrowserChannel()?.addEventListener("message", handleBroadcastMessage);

  void import("@tauri-apps/api/event")
    .then(({ listen }) => listen<DesktopSyncEvent>(desktopSyncTauriEventName, (event) => {
      handlePayload(event.payload);
    }))
    .then((unlisten) => {
      if (cancelled) {
        unlisten();
        return;
      }
      unlistenTauri = unlisten;
    })
    .catch(() => {
      // Browser preview and unit tests use the fallback listeners above.
    });

  return () => {
    cancelled = true;
    if (typeof window !== "undefined") {
      window.removeEventListener(desktopSyncBrowserEventName, handleBrowserEvent);
    }
    getBrowserChannel()?.removeEventListener("message", handleBroadcastMessage);
    unlistenTauri?.();
  };
}
