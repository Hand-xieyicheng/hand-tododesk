import type { ThemeId } from "@todo/shared";
import { Check } from "lucide-react";
import { applyTheme, themeRegistry } from "../lib/themes";

interface ThemeSettingsProps {
  themeId: ThemeId;
  onThemeChanged(themeId: ThemeId): void;
}

export function ThemeSettings({ themeId, onThemeChanged }: ThemeSettingsProps) {
  return (
    <section className="theme-grid">
      {Object.values(themeRegistry).map((theme) => (
        <button
          className={themeId === theme.id ? "theme-tile is-active" : "theme-tile"}
          data-theme={theme.id}
          key={theme.id}
          type="button"
          onClick={() => {
            applyTheme(theme.id);
            onThemeChanged(theme.id);
          }}
        >
          <span className="theme-swatch" style={{ background: `linear-gradient(135deg, ${theme.palette.primary}, ${theme.palette.secondary} 55%, ${theme.palette.warning})` }} />
          <strong>{theme.label}</strong>
          {themeId === theme.id ? <Check size={18} /> : null}
        </button>
      ))}
    </section>
  );
}
