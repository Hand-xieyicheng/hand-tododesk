import type { ThemeId } from "@todo/shared";

export interface ThemeDefinition {
  id: ThemeId;
  label: string;
  palette: {
    background: string;
    surface: string;
    surfaceStrong: string;
    text: string;
    muted: string;
    primary: string;
    accent: string;
    warning: string;
    border: string;
  };
  assets: {
    hero?: string;
    sticker?: string;
  };
}

export const themeRegistry: Record<ThemeId, ThemeDefinition> = {
  default: {
    id: "default",
    label: "海岛晨光",
    palette: {
      background: "#f7f3df",
      surface: "#fffdf1",
      surfaceStrong: "#f0e8d8",
      text: "#725d42",
      muted: "#9f927d",
      primary: "#19c8b9",
      accent: "#e59266",
      warning: "#f7cd67",
      border: "#c4b89e"
    },
    assets: {}
  },
  shinchan: {
    id: "shinchan",
    label: "蜡笔午后",
    palette: {
      background: "#fff1df",
      surface: "#fffaf0",
      surfaceStrong: "#ffe0c8",
      text: "#70462d",
      muted: "#a17056",
      primary: "#fc736d",
      accent: "#889df0",
      warning: "#f7cd67",
      border: "#e9b48f"
    },
    assets: {}
  },
  labubu: {
    id: "labubu",
    label: "莓果森林",
    palette: {
      background: "#f4efe7",
      surface: "#fff9ef",
      surfaceStrong: "#eadcf4",
      text: "#60475d",
      muted: "#8c7489",
      primary: "#b77dee",
      accent: "#82d5bb",
      warning: "#ecdf52",
      border: "#d8bfd8"
    },
    assets: {}
  },
  doraemon: {
    id: "doraemon",
    label: "蓝铃港口",
    palette: {
      background: "#edf6f3",
      surface: "#fffdf1",
      surfaceStrong: "#dcecf6",
      text: "#4f5d6f",
      muted: "#728494",
      primary: "#889df0",
      accent: "#fc736d",
      warning: "#f7cd67",
      border: "#b9cfdd"
    },
    assets: {}
  }
};

export function applyTheme(themeId: string) {
  const theme = themeRegistry[(themeId as ThemeId) in themeRegistry ? themeId as ThemeId : "default"];
  const root = document.documentElement;
  root.dataset.theme = theme.id;
  for (const [key, value] of Object.entries(theme.palette)) {
    root.style.setProperty(`--color-${key}`, value);
  }
  root.style.setProperty("--animal-primary-color", theme.palette.primary);
  root.style.setProperty("--animal-primary-color-bg", theme.palette.surfaceStrong);
  root.style.setProperty("--animal-warning-color", theme.palette.warning);
  root.style.setProperty("--animal-error-color", theme.palette.accent);
  root.style.setProperty("--animal-text-color", theme.palette.text);
  root.style.setProperty("--animal-text-color-secondary", theme.palette.muted);
  root.style.setProperty("--animal-text-color-muted", theme.palette.muted);
  root.style.setProperty("--animal-border-color", theme.palette.border);
  root.style.setProperty("--animal-bg-color", theme.palette.surface);
  root.style.setProperty("--animal-bg-color-secondary", theme.palette.surfaceStrong);
  return theme;
}
