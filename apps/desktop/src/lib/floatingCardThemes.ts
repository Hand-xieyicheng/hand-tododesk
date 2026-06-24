import { defaultThemeId, floatingCardThemeIdValues, type FloatingCardThemeId } from "@todo/shared";
import { sharedThemePaletteRegistry } from "./themePalettes";

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
  controlColorScheme: "light" | "dark";
}

export const defaultFloatingCardThemeId = defaultThemeId satisfies FloatingCardThemeId;

export const floatingCardThemeRegistry: Record<FloatingCardThemeId, FloatingCardThemeDefinition> = Object.fromEntries(
  floatingCardThemeIdValues.map((id) => {
    const palette = sharedThemePaletteRegistry[id];
    return [
      id,
      {
        id,
        label: palette.label,
        background: palette.background,
        surface: palette.surface,
        surfaceStrong: palette.surfaceStrong,
        text: palette.text,
        muted: palette.muted,
        border: palette.border,
        accent: palette.accent,
        check: palette.onPrimary,
        shadow: palette.shadow,
        dots: palette.dots,
        controlColorScheme: palette.controlColorScheme
      }
    ];
  })
) as Record<FloatingCardThemeId, FloatingCardThemeDefinition>;

export const floatingCardThemeOptions = floatingCardThemeIdValues.map((id) => floatingCardThemeRegistry[id]);

export function normalizeFloatingCardThemeId(value: string | null | undefined): FloatingCardThemeId {
  return floatingCardThemeIdValues.includes(value as FloatingCardThemeId) ? value as FloatingCardThemeId : defaultFloatingCardThemeId;
}

export function getFloatingCardTheme(themeId: string | null | undefined) {
  return floatingCardThemeRegistry[normalizeFloatingCardThemeId(themeId)];
}

export function getFloatingCardThemeStyle(themeId: string | null | undefined) {
  const theme = getFloatingCardTheme(themeId);
  const useLightControlIcons = theme.controlColorScheme === "dark";
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
