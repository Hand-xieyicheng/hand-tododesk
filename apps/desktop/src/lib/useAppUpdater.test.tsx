import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppUpdater } from "./useAppUpdater";

const mocks = vi.hoisted(() => ({
  getVersion: vi.fn(),
  check: vi.fn(),
  relaunch: vi.fn()
}));

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: mocks.getVersion
}));

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: mocks.check
}));

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: mocks.relaunch
}));

function enableTauriRuntime() {
  Reflect.set(window, "__TAURI_INTERNALS__", {});
}

describe("useAppUpdater", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
    mocks.getVersion.mockResolvedValue("0.2.10");
    mocks.relaunch.mockResolvedValue(undefined);
  });

  it("reports unsupported outside Tauri", async () => {
    const { result } = renderHook(() => useAppUpdater());

    expect(result.current.status).toBe("unsupported");

    await act(async () => {
      await result.current.checkForUpdate();
    });

    expect(result.current.status).toBe("unsupported");
    expect(result.current.error).toBe("当前运行环境不支持应用内更新");
  });

  it("starts idle inside Tauri", () => {
    enableTauriRuntime();
    const { result } = renderHook(() => useAppUpdater());

    expect(result.current.status).toBe("idle");
  });

  it("reports current when no update is available", async () => {
    enableTauriRuntime();
    mocks.check.mockResolvedValue(null);
    const { result } = renderHook(() => useAppUpdater());

    await act(async () => {
      await result.current.checkForUpdate();
    });

    expect(result.current.status).toBe("current");
    expect(result.current.currentVersion).toBe("0.2.10");
    expect(result.current.targetVersion).toBeNull();
  });

  it("downloads and installs an available update", async () => {
    enableTauriRuntime();
    const update = {
      currentVersion: "0.2.1",
      version: "0.2.10",
      date: "2026-06-15T00:00:00.000Z",
      body: "新增应用内更新",
      downloadAndInstall: vi.fn(async (onEvent: (event: unknown) => void) => {
        onEvent({ event: "Started", data: { contentLength: 100 } });
        onEvent({ event: "Progress", data: { chunkLength: 40 } });
        onEvent({ event: "Progress", data: { chunkLength: 60 } });
        onEvent({ event: "Finished" });
      })
    };
    mocks.check.mockResolvedValue(update);
    const { result } = renderHook(() => useAppUpdater());

    await act(async () => {
      await result.current.checkForUpdate();
    });

    expect(result.current.status).toBe("available");
    expect(result.current.targetVersion).toBe("0.2.10");
    expect(result.current.releaseNotes).toBe("新增应用内更新");

    await act(async () => {
      await result.current.installUpdate();
    });

    expect(update.downloadAndInstall).toHaveBeenCalledOnce();
    expect(result.current.status).toBe("installed");
    expect(result.current.receivedBytes).toBe(100);
  });

  it("surfaces check failures for manual checks", async () => {
    enableTauriRuntime();
    mocks.check.mockRejectedValue(new Error("latest.json 读取失败"));
    const { result } = renderHook(() => useAppUpdater());

    await act(async () => {
      await result.current.checkForUpdate();
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe("latest.json 读取失败");
  });
});
