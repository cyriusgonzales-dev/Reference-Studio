import { describe, expect, it } from 'vitest';
import {
  acceleratorFromKey,
  defaultShortcuts,
  findConflicts,
  matchesAccelerator,
  parseAccelerator,
  prettyAccelerator,
  validateShortcut
} from '../src/shared/shortcuts';

const key = (k: string, mods: Partial<{ ctrl: boolean; shift: boolean; alt: boolean; meta: boolean }> = {}) => ({
  key: k,
  ctrl: false,
  shift: false,
  alt: false,
  meta: false,
  ...mods
});

describe('shortcuts', () => {
  it('parses accelerators and aliases', () => {
    expect(parseAccelerator('Ctrl+Shift+P')).toEqual({ ctrl: true, shift: true, alt: false, meta: false, key: 'P' });
    expect(parseAccelerator('Alt+Left')?.key).toBe('ArrowLeft');
    expect(parseAccelerator('Ctrl+')).toBeNull();
    expect(parseAccelerator('Hyper+X')).toBeNull();
    expect(parseAccelerator('Ctrl+Shift')).toBeNull();
  });

  it('matches DOM-style key events exactly', () => {
    expect(matchesAccelerator('Ctrl+Shift+P', key('P', { ctrl: true, shift: true }))).toBe(true);
    expect(matchesAccelerator('Ctrl+Shift+P', key('p', { ctrl: true, shift: true }))).toBe(true);
    expect(matchesAccelerator('Ctrl+Shift+P', key('P', { ctrl: true }))).toBe(false);
    expect(matchesAccelerator('Space', key(' '))).toBe(true);
    expect(matchesAccelerator('Space', key(' ', { shift: true }))).toBe(false);
    expect(matchesAccelerator(null, key('a'))).toBe(false);
  });

  it('formats key presses', () => {
    expect(acceleratorFromKey(key('ArrowRight', { ctrl: true, shift: true }))).toBe('Ctrl+Shift+ArrowRight');
    expect(acceleratorFromKey(key('Control', { ctrl: true }))).toBeNull();
  });

  it('requires a command modifier for shortcuts that work inside web pages', () => {
    expect(validateShortcut('toggleOutput', 'P')).toMatch(/Ctrl or Alt/);
    expect(validateShortcut('toggleOutput', 'Shift+P')).toMatch(/Ctrl or Alt/);
    expect(validateShortcut('toggleOutput', 'Ctrl+Alt+O')).toBeNull();
  });

  it('limits bare single-key shortcuts', () => {
    expect(validateShortcut('playPause', 'K')).toMatch(/Single-key/);
    expect(validateShortcut('playPause', 'F8')).toBeNull();
    expect(validateShortcut('lyricsNext', 'PageDown')).toBeNull();
  });

  it('has valid, conflict-free defaults', () => {
    const map = defaultShortcuts();
    for (const [action, keys] of Object.entries(map)) {
      expect(validateShortcut(action as keyof typeof map, keys as string)).toBeNull();
    }
    expect(findConflicts(map)).toEqual([]);
  });

  it('detects conflicts across overlapping scopes', () => {
    const map = { ...defaultShortcuts(), clearOutput: 'Ctrl+L' };
    expect(findConflicts(map)).toContainEqual(['focusAddress', 'clearOutput']);
  });

  it('allows the same bare key in separate scopes', () => {
    const map = { ...defaultShortcuts(), playPause: 'ArrowRight' };
    expect(findConflicts(map)).toEqual([]);
  });

  it('pretty-prints', () => {
    expect(prettyAccelerator('Ctrl+Shift+ArrowRight')).toBe('Ctrl + Shift + →');
    expect(prettyAccelerator(null)).toBe('Disabled');
  });
});
