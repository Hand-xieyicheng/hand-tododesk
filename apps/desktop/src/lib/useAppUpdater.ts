import { useCallback, useEffect, useRef, useState } from "react";
import type { DownloadEvent, Update } from "@tauri-apps/plugin-updater";

export type UpdaterStatus = "idle" | "checking" | "available" | "downloading" | "installing" | "installed" | "current" | "error" | "unsupported";

export interface UpdaterState {
  status: UpdaterStatus;
  currentVersion: string;
  targetVersion: string | null;
  releaseDate: string | null;
  releaseNotes: string | null;
  error: string;
  checkedAt: string | null;
  receivedBytes: number;
  totalBytes: number | null;
}

export interface CheckOptions {
  silent?: boolean;
}

export interface AppUpdaterController extends UpdaterState {
  checkForUpdate(options?: CheckOptions): Promise<Update | null>;
  installUpdate(): Promise<void>;
  restartApp(): Promise<void>;
}

const fallbackVersion = "0.2.0";

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function baseState(): UpdaterState {
  return {
    status: "idle",
    currentVersion: fallbackVersion,
    targetVersion: null,
    releaseDate: null,
    releaseNotes: null,
    error: "",
    checkedAt: null,
    receivedBytes: 0,
    totalBytes: null
  };
}

export function useAppUpdater(): AppUpdaterController {
  const updateRef = useRef<Update | null>(null);
  const [state, setState] = useState<UpdaterState>(() => baseState());

  useEffect(() => {
    let cancelled = false;

    async function loadVersion() {
      if (!isTauriRuntime()) {
        return;
      }

      try {
        const { getVersion } = await import("@tauri-apps/api/app");
        const currentVersion = await getVersion();
        if (!cancelled) {
          setState((current) => ({ ...current, currentVersion }));
        }
      } catch {
        // Keep the package fallback during browser previews and test runs.
      }
    }

    void loadVersion();

    return () => {
      cancelled = true;
    };
  }, []);

  const checkForUpdate = useCallback(async (options: CheckOptions = {}) => {
    if (!isTauriRuntime()) {
      updateRef.current = null;
      setState((current) => ({
        ...current,
        status: "unsupported",
        error: options.silent ? "" : "当前运行环境不支持应用内更新",
        checkedAt: new Date().toISOString()
      }));
      return null;
    }

    updateRef.current = null;
    setState((current) => ({
      ...current,
      status: "checking",
      error: "",
      receivedBytes: 0,
      totalBytes: null
    }));

    try {
      const [{ getVersion }, { check }] = await Promise.all([
        import("@tauri-apps/api/app"),
        import("@tauri-apps/plugin-updater")
      ]);
      const currentVersion = await getVersion().catch(() => fallbackVersion);
      const update = await check();
      const checkedAt = new Date().toISOString();

      if (!update) {
        setState((current) => ({
          ...current,
          status: "current",
          currentVersion,
          targetVersion: null,
          releaseDate: null,
          releaseNotes: null,
          checkedAt
        }));
        return null;
      }

      updateRef.current = update;
      setState((current) => ({
        ...current,
        status: "available",
        currentVersion: update.currentVersion || currentVersion,
        targetVersion: update.version,
        releaseDate: update.date ?? null,
        releaseNotes: update.body ?? null,
        checkedAt
      }));
      return update;
    } catch (error) {
      updateRef.current = null;
      setState((current) => ({
        ...current,
        status: options.silent ? "idle" : "error",
        error: options.silent ? "" : errorMessage(error),
        checkedAt: new Date().toISOString()
      }));
      return null;
    }
  }, []);

  const installUpdate = useCallback(async () => {
    const update = updateRef.current;
    if (!update) {
      setState((current) => ({
        ...current,
        status: "error",
        error: "没有可安装的更新"
      }));
      return;
    }

    setState((current) => ({
      ...current,
      status: "downloading",
      error: "",
      receivedBytes: 0,
      totalBytes: null
    }));

    try {
      await update.downloadAndInstall((event: DownloadEvent) => {
        if (event.event === "Started") {
          setState((current) => ({
            ...current,
            status: "downloading",
            totalBytes: event.data.contentLength ?? null,
            receivedBytes: 0
          }));
          return;
        }

        if (event.event === "Progress") {
          setState((current) => ({
            ...current,
            receivedBytes: current.receivedBytes + event.data.chunkLength
          }));
          return;
        }

        setState((current) => ({
          ...current,
          status: "installing"
        }));
      });

      setState((current) => ({
        ...current,
        status: "installed",
        receivedBytes: current.totalBytes ?? current.receivedBytes
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        status: "error",
        error: errorMessage(error)
      }));
    }
  }, []);

  const restartApp = useCallback(async () => {
    try {
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (error) {
      setState((current) => ({
        ...current,
        status: "error",
        error: errorMessage(error)
      }));
    }
  }, []);

  return {
    ...state,
    checkForUpdate,
    installUpdate,
    restartApp
  };
}
