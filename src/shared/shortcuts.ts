/**
 * Keyboard shortcuts, per platform. macOS uses ⌘ where Windows uses Ctrl, and
 * ⌘[ / ⌘] for back and forward (Option+arrows moves by word in text fields).
 * Pure, so the main process (handling) and the UI (labels) agree.
 */

export type AppPlatform = 'win32' | 'darwin' | 'linux';

export type ShortcutAction =
  | { type: 'clear' }
  | { type: 'lyricsStep'; delta: 1 | -1 }
  | { type: 'focusSearch' }
  | { type: 'selectTab'; index: 0 | 1 | 2 | 3 }
  | { type: 'history'; direction: 'back' | 'forward' }
  | { type: 'openSettings' };

export interface KeyInput {
  key: string;
  control: boolean;
  alt: boolean;
  meta: boolean;
  shift: boolean;
}

/** Maps a key press to an app shortcut, or null when the key belongs to the page. */
export function shortcutFor(input: KeyInput, platform: AppPlatform): ShortcutAction | null {
  const key = input.key.toLowerCase();
  const mac = platform === 'darwin';
  // The primary modifier alone (no Alt, and no Ctrl/⌘ of the other kind).
  const mod = mac ? input.meta && !input.control && !input.alt : input.control && !input.meta && !input.alt;

  if (mod && input.shift && key === 'b') return { type: 'clear' };
  if (mod && input.shift && (key === 'arrowright' || key === 'arrowleft')) return { type: 'lyricsStep', delta: key === 'arrowright' ? 1 : -1 };
  if (mod && !input.shift && key === 'l') return { type: 'focusSearch' };
  if (mod && !input.shift && key === ',') return { type: 'openSettings' };
  if (mod && !input.shift && ['1', '2', '3', '4'].includes(key)) return { type: 'selectTab', index: (Number(key) - 1) as 0 | 1 | 2 | 3 };
  if (mac) {
    if (mod && !input.shift && (key === '[' || key === ']')) return { type: 'history', direction: key === '[' ? 'back' : 'forward' };
  } else if (input.alt && !input.control && !input.meta && (key === 'arrowleft' || key === 'arrowright')) {
    return { type: 'history', direction: key === 'arrowleft' ? 'back' : 'forward' };
  }
  return null;
}

/** Human-readable labels for tooltips and help text. */
export function shortcutLabels(platform: AppPlatform) {
  const mac = platform === 'darwin';
  const mod = mac ? '⌘' : 'Ctrl+';
  const shiftMod = mac ? '⇧⌘' : 'Ctrl+Shift+';
  return {
    tab: (n: number) => `${mod}${n}`,
    focusSearch: `${mod}L`,
    back: mac ? '⌘[' : 'Alt+←',
    forward: mac ? '⌘]' : 'Alt+→',
    clear: `${shiftMod}B`,
    settings: `${mod},`
  };
}
