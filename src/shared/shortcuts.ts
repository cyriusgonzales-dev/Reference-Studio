/**
 * Keyboard shortcut definitions and matching.
 *
 * Accelerators use the form "Ctrl+Shift+P", "Alt+ArrowLeft", "Space".
 * Each action has a scope describing where it may fire:
 *  - "anywhere": also fires while a research web page has focus. These must use
 *    Ctrl or Alt so ordinary typing and website shortcuts are not intercepted.
 *  - "app": fires only while the operator UI has focus and no text field is being edited.
 *  - "lyrics": fires only while the lyrics live controller has focus.
 *  - "output": fires while the Presentation Output window has focus.
 */

export type ShortcutAction =
  | 'focusAddress'
  | 'back'
  | 'forward'
  | 'reload'
  | 'toggleOutput'
  | 'presentSelection'
  | 'queueNext'
  | 'queuePrevious'
  | 'clearOutput'
  | 'exitFullscreen'
  | 'playPause'
  | 'lyricsNext'
  | 'lyricsPrevious';

export type ShortcutScope = 'anywhere' | 'app' | 'lyrics' | 'output';

export interface ShortcutDefinition {
  action: ShortcutAction;
  label: string;
  scope: ShortcutScope;
  defaultKeys: string;
}

export const SHORTCUT_DEFINITIONS: readonly ShortcutDefinition[] = [
  { action: 'focusAddress', label: 'Focus the address/search bar', scope: 'anywhere', defaultKeys: 'Ctrl+L' },
  { action: 'back', label: 'Research: navigate back', scope: 'anywhere', defaultKeys: 'Alt+ArrowLeft' },
  { action: 'forward', label: 'Research: navigate forward', scope: 'anywhere', defaultKeys: 'Alt+ArrowRight' },
  { action: 'reload', label: 'Research: reload page', scope: 'anywhere', defaultKeys: 'Ctrl+R' },
  { action: 'toggleOutput', label: 'Show or hide the Presentation Output', scope: 'anywhere', defaultKeys: 'Ctrl+Shift+P' },
  { action: 'presentSelection', label: 'Present the current selection', scope: 'anywhere', defaultKeys: 'Ctrl+Enter' },
  { action: 'queueNext', label: 'Queue: next item', scope: 'anywhere', defaultKeys: 'Ctrl+Shift+ArrowRight' },
  { action: 'queuePrevious', label: 'Queue: previous item', scope: 'anywhere', defaultKeys: 'Ctrl+Shift+ArrowLeft' },
  { action: 'clearOutput', label: 'Clear the output to black', scope: 'anywhere', defaultKeys: 'Ctrl+Shift+B' },
  { action: 'exitFullscreen', label: 'Exit output full screen (output window focused)', scope: 'output', defaultKeys: 'Escape' },
  { action: 'playPause', label: 'Play/pause the live video', scope: 'app', defaultKeys: 'Space' },
  { action: 'lyricsNext', label: 'Lyrics: next slide (live controller focused)', scope: 'lyrics', defaultKeys: 'ArrowRight' },
  { action: 'lyricsPrevious', label: 'Lyrics: previous slide (live controller focused)', scope: 'lyrics', defaultKeys: 'ArrowLeft' }
];

export type ShortcutMap = Record<ShortcutAction, string | null>;

export function defaultShortcuts(): ShortcutMap {
  const map = {} as ShortcutMap;
  for (const def of SHORTCUT_DEFINITIONS) map[def.action] = def.defaultKeys;
  return map;
}

export function shortcutDefinition(action: ShortcutAction): ShortcutDefinition {
  const def = SHORTCUT_DEFINITIONS.find((d) => d.action === action);
  if (!def) throw new Error(`Unknown shortcut action ${action}`);
  return def;
}

export interface Accelerator {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
  key: string;
}

/** Minimal key description shared by DOM KeyboardEvent and Electron's before-input-event Input. */
export interface KeyLike {
  key: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
}

const KEY_ALIASES: Record<string, string> = {
  ' ': 'Space',
  spacebar: 'Space',
  space: 'Space',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  up: 'ArrowUp',
  down: 'ArrowDown',
  arrowleft: 'ArrowLeft',
  arrowright: 'ArrowRight',
  arrowup: 'ArrowUp',
  arrowdown: 'ArrowDown',
  esc: 'Escape',
  escape: 'Escape',
  return: 'Enter',
  enter: 'Enter',
  del: 'Delete',
  delete: 'Delete',
  backspace: 'Backspace',
  tab: 'Tab',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown'
};

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'OS']);

/** Keys that may be bound without Ctrl/Alt (only in non-"anywhere" scopes). */
const BARE_KEYS = new Set([
  'Space',
  'Escape',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'PageUp',
  'PageDown',
  'Home',
  'End',
  ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`)
]);

export function normalizeKey(key: string): string {
  if (!key) return '';
  const alias = KEY_ALIASES[key.toLowerCase()] ?? KEY_ALIASES[key];
  if (alias) return alias;
  if (key.length === 1) return key.toUpperCase();
  if (/^f([1-9]|1[0-2])$/i.test(key)) return key.toUpperCase();
  return key;
}

export function parseAccelerator(text: string): Accelerator | null {
  if (typeof text !== 'string' || !text.trim()) return null;
  const parts = text.split('+').map((p) => p.trim());
  // "Ctrl++" style accelerators are not supported; a trailing empty part means "+".
  if (parts.some((p) => p === '')) return null;
  const acc: Accelerator = { ctrl: false, shift: false, alt: false, meta: false, key: '' };
  for (const [i, raw] of parts.entries()) {
    const part = raw.toLowerCase();
    const isLast = i === parts.length - 1;
    if (!isLast) {
      if (part === 'ctrl' || part === 'control' || part === 'cmdorctrl') acc.ctrl = true;
      else if (part === 'shift') acc.shift = true;
      else if (part === 'alt' || part === 'option') acc.alt = true;
      else if (part === 'meta' || part === 'win' || part === 'super' || part === 'cmd') acc.meta = true;
      else return null;
    } else {
      const key = normalizeKey(raw);
      if (!key || MODIFIER_KEYS.has(key)) return null;
      acc.key = key;
    }
  }
  return acc;
}

export function formatAccelerator(acc: Accelerator): string {
  return [acc.ctrl && 'Ctrl', acc.alt && 'Alt', acc.shift && 'Shift', acc.meta && 'Meta', acc.key]
    .filter(Boolean)
    .join('+');
}

/** Builds an accelerator string from a key press, or null if only modifiers are held. */
export function acceleratorFromKey(e: KeyLike): string | null {
  const key = normalizeKey(e.key);
  if (!key || MODIFIER_KEYS.has(key)) return null;
  return formatAccelerator({ ctrl: e.ctrl, shift: e.shift, alt: e.alt, meta: e.meta, key });
}

export function matchesAccelerator(accelerator: string | null | undefined, e: KeyLike): boolean {
  if (!accelerator) return false;
  const acc = parseAccelerator(accelerator);
  if (!acc) return false;
  return (
    acc.ctrl === e.ctrl &&
    acc.shift === e.shift &&
    acc.alt === e.alt &&
    acc.meta === e.meta &&
    acc.key === normalizeKey(e.key)
  );
}

/** Returns a reason the accelerator is unsuitable for the action, or null when acceptable. */
export function validateShortcut(action: ShortcutAction, accelerator: string): string | null {
  const acc = parseAccelerator(accelerator);
  if (!acc) return 'Not a valid key combination.';
  const def = shortcutDefinition(action);
  const hasCommandModifier = acc.ctrl || acc.alt || acc.meta;
  if (def.scope === 'anywhere' && !hasCommandModifier) {
    return 'This shortcut also works while a web page has focus, so it must include Ctrl or Alt.';
  }
  if (!hasCommandModifier && !acc.shift && !BARE_KEYS.has(acc.key)) {
    return 'Single-key shortcuts are limited to Space, Escape, arrows, paging keys and F1–F12.';
  }
  return null;
}

/** Finds actions sharing the same keys within overlapping scopes. */
export function findConflicts(map: ShortcutMap): Array<[ShortcutAction, ShortcutAction]> {
  const conflicts: Array<[ShortcutAction, ShortcutAction]> = [];
  const defs = SHORTCUT_DEFINITIONS;
  for (let i = 0; i < defs.length; i++) {
    for (let j = i + 1; j < defs.length; j++) {
      const a = defs[i];
      const b = defs[j];
      if (!a || !b) continue;
      const ka = map[a.action];
      const kb = map[b.action];
      if (!ka || !kb) continue;
      const pa = parseAccelerator(ka);
      const pb = parseAccelerator(kb);
      if (!pa || !pb || formatAccelerator(pa) !== formatAccelerator(pb)) continue;
      const overlapping = a.scope === b.scope || a.scope === 'anywhere' || b.scope === 'anywhere';
      if (overlapping) conflicts.push([a.action, b.action]);
    }
  }
  return conflicts;
}

/** Describes the accelerator for display, e.g. "Ctrl + Shift + →". */
export function prettyAccelerator(accelerator: string | null): string {
  if (!accelerator) return 'Disabled';
  const acc = parseAccelerator(accelerator);
  if (!acc) return accelerator;
  const symbols: Record<string, string> = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓' };
  return formatAccelerator({ ...acc, key: symbols[acc.key] ?? acc.key }).split('+').join(' + ');
}
