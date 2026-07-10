import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  desktopSyncBrowserEventName,
  desktopSyncSourceId,
  emitDesktopSyncEvent,
  listenDesktopSyncEvents
} from "./desktopSync";

const memo = {
  id: "memo-1",
  title: "同步备忘录",
  excerpt: "同步摘要",
  isPinned: false,
  archivedAt: null,
  createdAt: "2026-06-17T08:00:00.000Z",
  updatedAt: "2026-06-17T08:00:00.000Z",
  contentHtml: "<p>同步正文</p>",
  assets: []
};

const tauriEventMock = vi.hoisted(() => ({
  emit: vi.fn(async () => {
    throw new Error("Tauri event API unavailable");
  }),
  listen: vi.fn(async () => {
    throw new Error("Tauri event API unavailable");
  })
}));

vi.mock("@tauri-apps/api/event", () => tauriEventMock);

describe("desktopSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("emits typed browser fallback events with the current source id", async () => {
    const rawListener = vi.fn();
    window.addEventListener(desktopSyncBrowserEventName, rawListener);

    await emitDesktopSyncEvent({ type: "task:deleted", taskId: "task-1" });

    expect(rawListener).toHaveBeenCalledTimes(1);
    const firstCall = rawListener.mock.calls[0];
    expect(firstCall).toBeDefined();
    expect((firstCall![0] as CustomEvent).detail).toEqual({
      sourceId: desktopSyncSourceId,
      taskId: "task-1",
      type: "task:deleted"
    });
    expect(tauriEventMock.emit).toHaveBeenCalled();

    window.removeEventListener(desktopSyncBrowserEventName, rawListener);
  });

  it("ignores events from the current source and handles external events", () => {
    const listener = vi.fn();
    const unsubscribe = listenDesktopSyncEvents(listener);

    window.dispatchEvent(new CustomEvent(desktopSyncBrowserEventName, {
      detail: {
        sourceId: desktopSyncSourceId,
        taskId: "task-1",
        type: "task:deleted"
      }
    }));
    window.dispatchEvent(new CustomEvent(desktopSyncBrowserEventName, {
      detail: {
        sourceId: "another-window",
        taskId: "task-2",
        type: "task:deleted"
      }
    }));

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({
      sourceId: "another-window",
      taskId: "task-2",
      type: "task:deleted"
    });

    unsubscribe();
  });

  it("handles external memo upsert and delete events", () => {
    const listener = vi.fn();
    const unsubscribe = listenDesktopSyncEvents(listener);

    window.dispatchEvent(new CustomEvent(desktopSyncBrowserEventName, {
      detail: {
        memo,
        sourceId: "memo-card",
        type: "memo:upserted"
      }
    }));
    window.dispatchEvent(new CustomEvent(desktopSyncBrowserEventName, {
      detail: {
        memoId: "memo-1",
        sourceId: "memo-card",
        type: "memo:deleted"
      }
    }));

    expect(listener).toHaveBeenCalledWith({
      memo,
      sourceId: "memo-card",
      type: "memo:upserted"
    });
    expect(listener).toHaveBeenCalledWith({
      memoId: "memo-1",
      sourceId: "memo-card",
      type: "memo:deleted"
    });

    unsubscribe();
  });

  it("handles external habit board reload events", () => {
    const listener = vi.fn();
    const unsubscribe = listenDesktopSyncEvents(listener);

    window.dispatchEvent(new CustomEvent(desktopSyncBrowserEventName, {
      detail: {
        sourceId: desktopSyncSourceId,
        type: "habit-board:reload-requested"
      }
    }));
    window.dispatchEvent(new CustomEvent(desktopSyncBrowserEventName, {
      detail: {
        sourceId: "floating-card",
        type: "habit-board:reload-requested"
      }
    }));

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({
      sourceId: "floating-card",
      type: "habit-board:reload-requested"
    });

    unsubscribe();
  });

  it("handles validated external domain reload events", () => {
    const listener = vi.fn();
    const unsubscribe = listenDesktopSyncEvents(listener);

    window.dispatchEvent(new CustomEvent(desktopSyncBrowserEventName, {
      detail: {
        domains: ["tasks", "anniversaries", "habits"],
        sourceId: "ai-assistant",
        type: "domain-data:reload-requested"
      }
    }));
    window.dispatchEvent(new CustomEvent(desktopSyncBrowserEventName, {
      detail: {
        domains: ["unknown"],
        sourceId: "invalid-window",
        type: "domain-data:reload-requested"
      }
    }));

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({
      domains: ["tasks", "anniversaries", "habits"],
      sourceId: "ai-assistant",
      type: "domain-data:reload-requested"
    });

    unsubscribe();
  });
});
