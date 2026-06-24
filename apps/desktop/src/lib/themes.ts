import { normalizeThemeId, themeIdValues, type ThemeId } from "@todo/shared";
import { sharedThemePaletteRegistry, type SharedThemePalette } from "./themePalettes";

export interface ThemeDefinition {
  id: ThemeId;
  label: string;
  palette: SharedThemePalette;
  assets: {
    hero?: string;
    sticker?: string;
  };
}

export const themeRegistry: Record<ThemeId, ThemeDefinition> = Object.fromEntries(
  themeIdValues.map((id) => [
    id,
    {
      id,
      label: sharedThemePaletteRegistry[id].label,
      palette: sharedThemePaletteRegistry[id],
      assets: {}
    }
  ])
) as Record<ThemeId, ThemeDefinition>;

export function applyTheme(themeId: string | null | undefined) {
  const theme = themeRegistry[normalizeThemeId(themeId)];
  const palette = theme.palette;
  const root = document.documentElement;
  root.dataset.theme = theme.id;
  root.style.colorScheme = palette.controlColorScheme;
  const colorVariables = {
    background: palette.background,
    surface: palette.surface,
    "surface-strong": palette.surfaceStrong,
    text: palette.text,
    muted: palette.muted,
    border: palette.border,
    primary: palette.primary,
    secondary: palette.secondary,
    accent: palette.accent,
    warning: palette.warning,
    "on-primary": palette.onPrimary,
    shadow: palette.shadow,
    "soft-shadow": palette.softShadow,
    dots: palette.dots,
    "control-color-scheme": palette.controlColorScheme
  };
  for (const [key, value] of Object.entries(colorVariables)) {
    root.style.setProperty(`--color-${key}`, value);
  }
  root.style.setProperty("--island-ink", palette.text);
  root.style.setProperty("--island-shadow", palette.shadow);
  root.style.setProperty("--island-soft-shadow", palette.softShadow);
  root.style.setProperty("--island-paper-dots", `radial-gradient(circle, ${palette.dots} 1px, transparent 1.6px)`);
  root.style.setProperty("--animal-primary-color", palette.primary);
  root.style.setProperty("--animal-primary-color-bg", palette.surfaceStrong);
  root.style.setProperty("--animal-warning-color", palette.warning);
  root.style.setProperty("--animal-error-color", palette.accent);
  root.style.setProperty("--animal-text-color", palette.text);
  root.style.setProperty("--animal-text-color-secondary", palette.muted);
  root.style.setProperty("--animal-text-color-muted", palette.muted);
  root.style.setProperty("--animal-border-color", palette.border);
  root.style.setProperty("--animal-bg-color", palette.surface);
  root.style.setProperty("--animal-bg-color-secondary", palette.surfaceStrong);
  return theme;
}
