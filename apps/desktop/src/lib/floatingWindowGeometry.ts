import { PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";

export const floatingTaskWindowGeometryStorageKey = "tododesk.floatingWindowGeometry.task";

const memoWindowGeometryStorageKeyPrefix = "tododesk.floatingWindowGeometry.memo";
const fallbackWindowGeometryStorageKey = "tododesk.floatingWindowGeometry.window";
const defaultMinimumGeometry = {
  height: 340,
  width: 300
};

export interface FloatingWindowGeometry {
  height: number;
  width: number;
  x: number;
  y: number;
}

interface FloatingWindowSize {
  height: number;
  width: number;
}

interface FloatingWindowPosition {
  x: number;
  y: number;
}

type FloatingWindowEventHandler<T> = (event: { payload: T }) => void | Promise<void>;
type FloatingWindowUnlisten = () => void;

export interface FloatingWindowGeometryApi {
  innerSize: () => Promise<FloatingWindowSize>;
  onMoved?: (handler: FloatingWindowEventHandler<FloatingWindowPosition>) => Promise<FloatingWindowUnlisten>;
  onResized?: (handler: FloatingWindowEventHandler<FloatingWindowSize>) => Promise<FloatingWindowUnlisten>;
  outerPosition: () => Promise<FloatingWindowPosition>;
  setPosition: (position: PhysicalPosition) => Promise<void>;
  setSize: (size: PhysicalSize) => Promise<void>;
}

interface FloatingWindowGeometryOptions {
  minimumSize?: FloatingWindowSize;
  persistDelayMs?: number;
  storage?: Storage;
  storageKey: string;
  windowApi: FloatingWindowGeometryApi;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function sanitizeStorageKeyPart(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9_-]/g, "_") || "unknown";
}

function getStorage(storage?: Storage) {
  return storage ?? globalThis.localStorage;
}

function normalizeFloatingWindowGeometry(
  value: unknown,
  minimumSize: FloatingWindowSize = defaultMinimumGeometry
): FloatingWindowGeometry | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<FloatingWindowGeometry>;
  if (
    !isFiniteNumber(candidate.height) ||
    !isFiniteNumber(candidate.width) ||
    !isFiniteNumber(candidate.x) ||
    !isFiniteNumber(candidate.y)
  ) {
    return null;
  }

  const height = Math.round(candidate.height);
  const width = Math.round(candidate.width);
  const x = Math.round(candidate.x);
  const y = Math.round(candidate.y);
  if (height < minimumSize.height || width < minimumSize.width) {
    return null;
  }

  return { height, width, x, y };
}

export function resolveFloatingWindowGeometryStorageKey(url: URL = new URL(globalThis.location.href)) {
  const windowKind = url.searchParams.get("window");
  if (windowKind === "floating") {
    return floatingTaskWindowGeometryStorageKey;
  }

  if (windowKind === "memo") {
    const memoId = sanitizeStorageKeyPart(url.searchParams.get("memoId") ?? "");
    return `${memoWindowGeometryStorageKeyPrefix}.${memoId}`;
  }

  return fallbackWindowGeometryStorageKey;
}

export function loadFloatingWindowGeometry(
  storageKey: string,
  storage?: Storage,
  minimumSize: FloatingWindowSize = defaultMinimumGeometry
) {
  try {
    const rawValue = getStorage(storage).getItem(storageKey);
    return rawValue ? normalizeFloatingWindowGeometry(JSON.parse(rawValue), minimumSize) : null;
  } catch {
    return null;
  }
}

export function saveFloatingWindowGeometry(
  storageKey: string,
  geometry: FloatingWindowGeometry,
  storage?: Storage,
  minimumSize: FloatingWindowSize = defaultMinimumGeometry
) {
  const normalized = normalizeFloatingWindowGeometry(geometry, minimumSize);
  if (!normalized) {
    return false;
  }

  try {
    getStorage(storage).setItem(storageKey, JSON.stringify(normalized));
    return true;
  } catch {
    return false;
  }
}

async function restoreFloatingWindowGeometry(options: FloatingWindowGeometryOptions) {
  const geometry = loadFloatingWindowGeometry(options.storageKey, options.storage, options.minimumSize);
  if (!geometry) {
    return;
  }

  await options.windowApi.setSize(new PhysicalSize(geometry.width, geometry.height));
  await options.windowApi.setPosition(new PhysicalPosition(geometry.x, geometry.y));
}

async function persistCurrentFloatingWindowGeometry(options: FloatingWindowGeometryOptions) {
  const [position, size] = await Promise.all([
    options.windowApi.outerPosition(),
    options.windowApi.innerSize()
  ]);

  saveFloatingWindowGeometry(options.storageKey, {
    height: size.height,
    width: size.width,
    x: position.x,
    y: position.y
  }, options.storage, options.minimumSize);
}

export async function installFloatingWindowGeometryPersistence(options: FloatingWindowGeometryOptions) {
  const unlisteners: FloatingWindowUnlisten[] = [];
  let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;

  const clearScheduledPersist = () => {
    if (timeoutId !== null) {
      globalThis.clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  const schedulePersist = () => {
    clearScheduledPersist();
    if ((options.persistDelayMs ?? 160) <= 0) {
      return persistCurrentFloatingWindowGeometry(options).catch(() => undefined);
    }

    timeoutId = globalThis.setTimeout(() => {
      timeoutId = null;
      void persistCurrentFloatingWindowGeometry(options).catch(() => undefined);
    }, options.persistDelayMs ?? 160);
  };

  try {
    await restoreFloatingWindowGeometry(options);
  } catch {
    // A broken or off-screen cache should not prevent the card from opening.
  }

  try {
    if (typeof options.windowApi.onMoved === "function") {
      unlisteners.push(await options.windowApi.onMoved(() => schedulePersist()));
    }
  } catch {
    // Browser preview and unsupported platforms can skip geometry persistence.
  }

  try {
    if (typeof options.windowApi.onResized === "function") {
      unlisteners.push(await options.windowApi.onResized(() => schedulePersist()));
    }
  } catch {
    // Browser preview and unsupported platforms can skip geometry persistence.
  }

  return () => {
    clearScheduledPersist();
    for (const unlisten of unlisteners) {
      unlisten();
    }
  };
}
