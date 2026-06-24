import { useEffect, useState } from "react";
import type { MouseEvent, PointerEvent } from "react";
import { Button } from "animal-island-ui";
import { Monitor, Pin, X } from "lucide-react";
import todoDeskLogo from "../assets/tododesk-logo.png";

export function FloatingWindowHeader() {
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function syncAlwaysOnTop() {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const current = await getCurrentWindow().isAlwaysOnTop();
        if (!cancelled) {
          setIsAlwaysOnTop(current);
        }
      } catch {
        // Browser preview fallback.
      }
    }

    void syncAlwaysOnTop();

    return () => {
      cancelled = true;
    };
  }, []);

  async function dragWindow(event: PointerEvent<HTMLElement>) {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().startDragging();
    } catch {
      // Browser preview fallback.
    }
  }

  async function toggleAlwaysOnTop(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();

    const previous = isAlwaysOnTop;
    const next = !isAlwaysOnTop;
    setIsAlwaysOnTop(next);

    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const currentWindow = getCurrentWindow();
      await currentWindow.setAlwaysOnTop(next);
      setIsAlwaysOnTop(await currentWindow.isAlwaysOnTop().catch(() => next));
    } catch {
      if ("__TAURI_INTERNALS__" in window) {
        setIsAlwaysOnTop(previous);
      }
    }
  }

  async function closeWindow(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().close();
    } catch {
      window.close();
    }
  }

  async function openDesktop(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("show_main_window");
    } catch {
      window.opener?.focus?.();
    }
  }

  return (
    <header className="floating-header">
      <div className="floating-header-actions">
        <Button
          aria-label={isAlwaysOnTop ? "取消固定在最前" : "固定在最前"}
          className={isAlwaysOnTop ? "floating-pin-button is-active" : "floating-pin-button"}
          icon={<Pin size={16} />}
          size="small"
          title={isAlwaysOnTop ? "取消固定在最前" : "固定在最前"}
          type="text"
          onClick={toggleAlwaysOnTop}
        />
        <Button
          aria-label="打开桌面"
          className="floating-desktop-button"
          icon={<Monitor size={16} />}
          size="small"
          title="打开桌面"
          type="text"
          onClick={openDesktop}
        />
      </div>
      <button className="floating-drag-handle" type="button" title="拖动卡片" onPointerDown={dragWindow}>
        <img className="floating-logo" src={todoDeskLogo} alt="小柴记" />
      </button>
      <Button aria-label="关闭" icon={<X size={16} />} size="small" title="关闭" type="text" onClick={closeWindow} />
    </header>
  );
}
