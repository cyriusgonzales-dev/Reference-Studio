import { BrowserWindow, screen, type Display } from 'electron';
import { isLikelyVirtualDisplay } from '../shared/displays';
import type { DisplayInfo } from '../shared/types';

/** Converts Electron's Display into the serialisable DisplayInfo used across the app. */
export function toDisplayInfo(display: Display, primaryId: number, position: number): DisplayInfo {
  const nameKnown = display.label.trim().length > 0;
  const label = nameKnown ? display.label.trim() : `Display ${position + 1}`;
  return {
    id: display.id,
    label,
    nameKnown,
    bounds: { ...display.bounds },
    workArea: { ...display.workArea },
    scaleFactor: display.scaleFactor,
    rotation: display.rotation,
    isPrimary: display.id === primaryId,
    internal: display.internal,
    likelyVirtual: isLikelyVirtualDisplay(label),
    pixelWidth: Math.round(display.size.width * display.scaleFactor),
    pixelHeight: Math.round(display.size.height * display.scaleFactor)
  };
}

export function listDisplays(): DisplayInfo[] {
  const primaryId = screen.getPrimaryDisplay().id;
  return screen
    .getAllDisplays()
    .sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y)
    .map((d, position) => toDisplayInfo(d, primaryId, position));
}

export function displayIdForWindow(win: BrowserWindow | null): number | null {
  if (!win || win.isDestroyed()) return null;
  return screen.getDisplayMatching(win.getBounds()).id;
}

/** Calls `onChange` (debounced) whenever displays are added, removed or reconfigured. */
export function watchDisplays(onChange: () => void): () => void {
  let timer: NodeJS.Timeout | null = null;
  const schedule = () => {
    if (timer) clearTimeout(timer);
    // Windows emits bursts of events while a monitor (re)connects; wait for them to settle.
    timer = setTimeout(() => {
      timer = null;
      onChange();
    }, 400);
  };
  screen.on('display-added', schedule);
  screen.on('display-removed', schedule);
  screen.on('display-metrics-changed', schedule);
  return () => {
    if (timer) clearTimeout(timer);
    screen.off('display-added', schedule);
    screen.off('display-removed', schedule);
    screen.off('display-metrics-changed', schedule);
  };
}

/** Briefly shows a large number on every display so the operator can tell them apart. */
export function identifyDisplays(displays: DisplayInfo[]): void {
  displays.forEach((display, index) => {
    const width = 360;
    const height = 220;
    const win = new BrowserWindow({
      x: Math.round(display.bounds.x + (display.bounds.width - width) / 2),
      y: Math.round(display.bounds.y + (display.bounds.height - height) / 2),
      width,
      height,
      frame: false,
      transparent: false,
      backgroundColor: '#1d4ed8',
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: false,
      resizable: false,
      show: false,
      webPreferences: { sandbox: true, contextIsolation: true, javascript: false }
    });
    const label = escapeHtml(display.label);
    const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:Segoe UI,sans-serif;color:#fff;background:#1d4ed8"><div style="font-size:120px;font-weight:700;line-height:1">${index + 1}</div><div style="font-size:16px;opacity:.9;max-width:320px;text-align:center">${label}${display.likelyVirtual ? ' (virtual?)' : ''}</div></body>`;
    void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    win.once('ready-to-show', () => win.showInactive());
    setTimeout(() => {
      if (!win.isDestroyed()) win.destroy();
    }, 2500);
  });
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
