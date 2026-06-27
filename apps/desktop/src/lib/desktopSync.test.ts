import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  desktopSyncBrowserEventName,
  desktopSyncSourceId,
  emitDesktopSyncEvent,
  listenDesktopSyncEvents
} from "./desktopSync";

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
});
