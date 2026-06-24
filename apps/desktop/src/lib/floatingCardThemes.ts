import { floatingCardThemeIdValues, type FloatingCardThemeId } from "@todo/shared";

export interface FloatingCardThemeDefinition {
  id: FloatingCardThemeId;
  label: string;
  background: string;
  surface: string;
  surfaceStrong: string;
  text: string;
  muted: string;
  border: string;
  accent: string;
  check: string;
  shadow: string;
  dots: string;
}

export const defaultFloatingCardThemeId = "warm-paper" satisfies FloatingCardThemeId;

export const floatingCardThemeRegistry: Record<FloatingCardThemeId, FloatingCardThemeDefinition> = {
  "warm-paper": {
    id: "warm-paper",
    label: "暖纸",
    background: "#fffdf1",
    surface: "#fffdf1",
    surfaceStrong: "#f0e8d8",
    text: "#725d42",
    muted: "#9f927d",
    border: "#c4b89e",
    accent: "#19c8b9",
    check: "#ffffff",
    shadow: "rgba(114, 93, 66, 0.13)",
    dots: "rgba(114, 93, 66, 0.08)"
  },
  "white-ink": {
    id: "white-ink",
    label: "白底黑字",
    background: "#ffffff",
    surface: "#ffffff",
    surfaceStrong: "#f3f4f6",
    text: "#111827",
    muted: "#4b5563",
    border: "#cbd5e1",
    accent: "#2563eb",
    check: "#ffffff",
    shadow: "rgba(17, 24, 39, 0.12)",
    dots: "rgba(17, 24, 39, 0.08)"
  },
  "black-snow": {
    id: "black-snow",
    label: "黑底白字",
    background: "#111827",
    surface: "#1f2937",
    surfaceStrong: "#374151",
    text: "#ffffff",
    muted: "#d1d5db",
    border: "#6b7280",
    accent: "#93c5fd",
    check: "#111827",
    shadow: "rgba(0, 0, 0, 0.28)",
    dots: "rgba(255, 255, 255, 0.12)"
  },
  cream: {
    id: "cream",
    label: "奶油",
    background: "#fff8e7",
    surface: "#fffdf4",
    surfaceStrong: "#f4e5bf",
    text: "#3d3428",
    muted: "#7c6b53",
    border: "#d4bc89",
    accent: "#d97706",
    check: "#ffffff",
    shadow: "rgba(61, 52, 40, 0.13)",
    dots: "rgba(61, 52, 40, 0.08)"
  },
  blush: {
    id: "blush",
    label: "粉雾",
    background: "#ffe4e6",
    surface: "#fff1f2",
    surfaceStrong: "#fecdd3",
    text: "#3d3428",
    muted: "#7f565c",
    border: "#f2a9b2",
    accent: "#e11d48",
    check: "#ffffff",
    shadow: "rgba(127, 86, 92, 0.14)",
    dots: "rgba(61, 52, 40, 0.08)"
  },
  peach: {
    id: "peach",
    label: "蜜桃",
    background: "#ffd8b5",
    surface: "#ffe7cf",
    surfaceStrong: "#ffc08c",
    text: "#3d3428",
    muted: "#7d5634",
    border: "#e79a5b",
    accent: "#ea580c",
    check: "#ffffff",
    shadow: "rgba(125, 86, 52, 0.16)",
    dots: "rgba(61, 52, 40, 0.09)"
  },
  lemon: {
    id: "lemon",
    label: "柠檬",
    background: "#fff3a3",
    surface: "#fff8c6",
    surfaceStrong: "#f7df69",
    text: "#3d3428",
    muted: "#6f6127",
    border: "#d8be45",
    accent: "#ca8a04",
    check: "#ffffff",
    shadow: "rgba(111, 97, 39, 0.15)",
    dots: "rgba(61, 52, 40, 0.09)"
  },
  mint: {
    id: "mint",
    label: "薄荷",
    background: "#ddfbe7",
    surface: "#effff4",
    surfaceStrong: "#bdf2d0",
    text: "#1f3d2b",
    muted: "#53725d",
    border: "#8ed7aa",
    accent: "#16a34a",
    check: "#ffffff",
    shadow: "rgba(31, 61, 43, 0.13)",
    dots: "rgba(31, 61, 43, 0.08)"
  },
  sage: {
    id: "sage",
    label: "鼠尾草",
    background: "#ddebd7",
    surface: "#edf5e9",
    surfaceStrong: "#c5d6bd",
    text: "#243524",
    muted: "#5d705b",
    border: "#a7ba9e",
    accent: "#4d7c0f",
    check: "#ffffff",
    shadow: "rgba(36, 53, 36, 0.13)",
    dots: "rgba(36, 53, 36, 0.08)"
  },
  sky: {
    id: "sky",
    label: "天空",
    background: "#dceeff",
    surface: "#edf7ff",
    surfaceStrong: "#b9defc",
    text: "#1f3352",
    muted: "#5f7390",
    border: "#94c4ef",
    accent: "#2563eb",
    check: "#ffffff",
    shadow: "rgba(31, 51, 82, 0.13)",
    dots: "rgba(31, 51, 82, 0.08)"
  },
  aqua: {
    id: "aqua",
    label: "浅水绿",
    background: "#d8f6f5",
    surface: "#efffff",
    surfaceStrong: "#aee4e2",
    text: "#143b3a",
    muted: "#537b79",
    border: "#86cfcc",
    accent: "#0f766e",
    check: "#ffffff",
    shadow: "rgba(20, 59, 58, 0.13)",
    dots: "rgba(20, 59, 58, 0.08)"
  },
  lavender: {
    id: "lavender",
    label: "薰衣草",
    background: "#e9e0ff",
    surface: "#f5f1ff",
    surfaceStrong: "#d3c3fa",
    text: "#33264f",
    muted: "#6b5c85",
    border: "#b9a6ea",
    accent: "#7c3aed",
    check: "#ffffff",
    shadow: "rgba(51, 38, 79, 0.13)",
    dots: "rgba(51, 38, 79, 0.08)"
  },
  coral: {
    id: "coral",
    label: "珊瑚",
    background: "#ff6b6b",
    surface: "#ff8585",
    surfaceStrong: "#e74d4d",
    text: "#ffffff",
    muted: "#fff1f1",
    border: "#ffc1c1",
    accent: "#7f1d1d",
    check: "#ffffff",
    shadow: "rgba(127, 29, 29, 0.22)",
    dots: "rgba(255, 255, 255, 0.16)"
  },
  teal: {
    id: "teal",
    label: "深青",
    background: "#0f766e",
    surface: "#12867d",
    surfaceStrong: "#0b5f58",
    text: "#ffffff",
    muted: "#d6fffb",
    border: "#83d4cd",
    accent: "#99f6e4",
    check: "#0f766e",
    shadow: "rgba(8, 47, 43, 0.24)",
    dots: "rgba(255, 255, 255, 0.14)"
  },
  navy: {
    id: "navy",
    label: "深海蓝",
    background: "#1e3a8a",
    surface: "#2546a4",
    surfaceStrong: "#172f73",
    text: "#ffffff",
    muted: "#dbeafe",
    border: "#93c5fd",
    accent: "#bfdbfe",
    check: "#1e3a8a",
    shadow: "rgba(15, 23, 42, 0.24)",
    dots: "rgba(255, 255, 255, 0.14)"
  }
};

export const floatingCardThemeOptions = floatingCardThemeIdValues.map((id) => floatingCardThemeRegistry[id]);

const floatingCardWhiteTextThemeIds = new Set<FloatingCardThemeId>(["black-snow", "coral", "teal", "navy"]);

export function normalizeFloatingCardThemeId(value: string | null | undefined): FloatingCardThemeId {
  return floatingCardThemeIdValues.includes(value as FloatingCardThemeId) ? value as FloatingCardThemeId : defaultFloatingCardThemeId;
}

export function getFloatingCardTheme(themeId: string | null | undefined) {
  return floatingCardThemeRegistry[normalizeFloatingCardThemeId(themeId)];
}

export function getFloatingCardThemeStyle(themeId: string | null | undefined) {
  const theme = getFloatingCardTheme(themeId);
  const useLightControlIcons = floatingCardWhiteTextThemeIds.has(theme.id);
  return {
    "--floating-card-background": theme.background,
    "--floating-card-surface": theme.surface,
    "--floating-card-surface-strong": theme.surfaceStrong,
    "--floating-card-text": theme.text,
    "--floating-card-muted": theme.muted,
    "--floating-card-border": theme.border,
    "--floating-card-accent": theme.accent,
    "--floating-card-check": theme.check,
    "--floating-card-shadow": theme.shadow,
    "--floating-card-dots": theme.dots,
    "--floating-card-control-color-scheme": useLightControlIcons ? "dark" : "light",
    "--floating-card-control-icon-filter": useLightControlIcons ? "brightness(0) invert(1)" : "none"
  };
}
