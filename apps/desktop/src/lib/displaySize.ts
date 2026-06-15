import { displaySizeValues, type DisplaySize } from "@todo/shared";

export const defaultDisplaySize: DisplaySize = "default";

export function normalizeDisplaySize(value: string | null | undefined): DisplaySize {
  return displaySizeValues.includes(value as DisplaySize) ? value as DisplaySize : defaultDisplaySize;
}

export function applyDisplaySize(value: string | null | undefined) {
  const displaySize = normalizeDisplaySize(value);
  document.documentElement.dataset.displaySize = displaySize;
  return displaySize;
}
