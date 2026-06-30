import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  floatingTaskWindowGeometryStorageKey,
  installFloatingWindowGeometryPersistence,
  loadFloatingWindowGeometry,
  resolveFloatingWindowGeometryStorageKey,
  saveFloatingWindowGeometry
} from "./floatingWindowGeometry";

function createWindowApi() {
  const movedHandlers: Array<(event: { payload: { x: number; y: number } }) => void | Promise<void>> = [];
  const resizedHandlers: Array<(event: { payload: { height: number; width: number } }) => void | Promise<void>> = [];
  const unlistenMoved = vi.fn();
  const unlistenResized = vi.fn();
  const windowApi = {
    innerSize: vi.fn(async () => ({ height: 640, width: 420 })),
    onMoved: vi.fn(async (handler: (event: { payload: { x: number; y: number } }) => void | Promise<void>) => {
      movedHandlers.push(handler);
      return unlistenMoved;
    }),
    onResized: vi.fn(async (handler: (event: { payload: { height: number; width: number } }) => void | Promise<void>) => {
      resizedHandlers.push(handler);
      return unlistenResized;
    }),
    outerPosition: vi.fn(async () => ({ x: 120, y: 160 })),
    setPosition: vi.fn(async () => undefined),
    setSize: vi.fn(async () => undefined)
  };

  return {
    movedHandlers,
    resizedHandlers,
    unlistenMoved,
    unlistenResized,
    windowApi
  };
}

describe("floatingWindowGeometry", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("restores cached task floating-card geometry before installing listeners", async () => {
    localStorage.setItem(floatingTaskWindowGeometryStorageKey, JSON.stringify({
      height: 580,
      width: 390,
      x: 40,
      y: 60
    }));
    const { windowApi } = createWindowApi();

    await installFloatingWindowGeometryPersistence({
      persistDelayMs: 0,
      storageKey: floatingTaskWindowGeometryStorageKey,
      windowApi
    });

    expect(windowApi.setSize).toHaveBeenCalledWith(expect.objectContaining({ height: 580, width: 390 }));
    expect(windowApi.setPosition).toHaveBeenCalledWith(expect.objectContaining({ x: 40, y: 60 }));
    expect(windowApi.onMoved).toHaveBeenCalledTimes(1);
    expect(windowApi.onResized).toHaveBeenCalledTimes(1);
  });

  it("persists latest size and position when the window moves or resizes", async () => {
    const { movedHandlers, resizedHandlers, windowApi } = createWindowApi();
    await installFloatingWindowGeometryPersistence({
      persistDelayMs: 0,
      storageKey: floatingTaskWindowGeometryStorageKey,
      windowApi
    });

    await movedHandlers[0]?.({ payload: { x: 120, y: 160 } });
    expect(loadFloatingWindowGeometry(floatingTaskWindowGeometryStorageKey)).toEqual({
      height: 640,
      width: 420,
      x: 120,
      y: 160
    });

    windowApi.innerSize.mockResolvedValueOnce({ height: 700, width: 460 });
    windowApi.outerPosition.mockResolvedValueOnce({ x: 180, y: 210 });
    await resizedHandlers[0]?.({ payload: { height: 700, width: 460 } });

    expect(loadFloatingWindowGeometry(floatingTaskWindowGeometryStorageKey)).toEqual({
      height: 700,
      width: 460,
      x: 180,
      y: 210
    });
  });

  it("ignores malformed cached geometry and removes cleanup listeners", async () => {
    localStorage.setItem(floatingTaskWindowGeometryStorageKey, "{\"width\":\"wide\"}");
    const { unlistenMoved, unlistenResized, windowApi } = createWindowApi();

    const cleanup = await installFloatingWindowGeometryPersistence({
      persistDelayMs: 0,
      storageKey: floatingTaskWindowGeometryStorageKey,
      windowApi
    });

    expect(windowApi.setSize).not.toHaveBeenCalled();
    expect(windowApi.setPosition).not.toHaveBeenCalled();

    cleanup();
    expect(unlistenMoved).toHaveBeenCalledTimes(1);
    expect(unlistenResized).toHaveBeenCalledTimes(1);
  });

  it("uses separate localStorage keys for task and memo floating cards", () => {
    expect(resolveFloatingWindowGeometryStorageKey(new URL("http://localhost/?window=floating"))).toBe("tododesk.floatingWindowGeometry.task");
    expect(resolveFloatingWindowGeometryStorageKey(new URL("http://localhost/?window=memo&memoId=memo-1"))).toBe("tododesk.floatingWindowGeometry.memo.memo-1");
  });

  it("does not save geometry below minimum floating-card size", () => {
    saveFloatingWindowGeometry(floatingTaskWindowGeometryStorageKey, {
      height: 300,
      width: 299,
      x: 10,
      y: 10
    });

    expect(localStorage.getItem(floatingTaskWindowGeometryStorageKey)).toBeNull();
  });
});
