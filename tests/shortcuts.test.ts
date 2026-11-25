import { describe, expect, it } from 'vitest';
import { parseSettings } from '../src/shared/settings';
import { shortcutFor, shortcutLabels, type KeyInput } from '../src/shared/shortcuts';

const key = (k: string, mods: Partial<Omit<KeyInput, 'key'>> = {}): KeyInput => ({ key: k, control: false, alt: false, meta: false, shift: false, ...mods });

describe('keyboard shortcuts', () => {
  it('uses Ctrl on Windows and ⌘ on macOS', () => {
    expect(shortcutFor(key('2', { control: true }), 'win32')).toEqual({ type: 'selectTab', index: 1 });
    expect(shortcutFor(key('2', { meta: true }), 'darwin')).toEqual({ type: 'selectTab', index: 1 });
    // The other platform's modifier is left to the page.
    expect(shortcutFor(key('2', { meta: true }), 'win32')).toBeNull();
    expect(shortcutFor(key('2', { control: true }), 'darwin')).toBeNull();
  });

  it('clears to black and steps slides with the shifted modifier', () => {
    expect(shortcutFor(key('B', { control: true, shift: true }), 'win32')).toEqual({ type: 'clear' });
    expect(shortcutFor(key('b', { meta: true, shift: true }), 'darwin')).toEqual({ type: 'clear' });
    expect(shortcutFor(key('ArrowRight', { meta: true, shift: true }), 'darwin')).toEqual({ type: 'lyricsStep', delta: 1 });
  });

  it('goes back and forward with Alt+arrows on Windows and ⌘[ ⌘] on macOS', () => {
    expect(shortcutFor(key('ArrowLeft', { alt: true }), 'win32')).toEqual({ type: 'history', direction: 'back' });
    expect(shortcutFor(key(']', { meta: true }), 'darwin')).toEqual({ type: 'history', direction: 'forward' });
    // Option+arrow moves by word in macOS text fields, so it is not taken.
    expect(shortcutFor(key('ArrowLeft', { alt: true }), 'darwin')).toBeNull();
  });

  it('opens Settings with the modifier and comma', () => {
    expect(shortcutFor(key(',', { control: true }), 'win32')).toEqual({ type: 'openSettings' });
    expect(shortcutFor(key(',', { meta: true }), 'darwin')).toEqual({ type: 'openSettings' });
  });

  it('never takes plain typing', () => {
    for (const k of ['a', 'l', '1', 'ArrowLeft', ',']) {
      expect(shortcutFor(key(k), 'win32')).toBeNull();
      expect(shortcutFor(key(k), 'darwin')).toBeNull();
    }
  });

  it('labels shortcuts for each platform', () => {
    expect(shortcutLabels('win32').clear).toBe('Ctrl+Shift+B');
    expect(shortcutLabels('darwin').clear).toBe('⇧⌘B');
    expect(shortcutLabels('darwin').tab(3)).toBe('⌘3');
  });
});

describe('update settings', () => {
  it('default to checking and downloading automatically', () => {
    expect(parseSettings({}).updates).toEqual({ autoCheck: true, autoDownload: true });
  });

  it('keep valid choices and repair damaged ones', () => {
    expect(parseSettings({ updates: { autoCheck: false, autoDownload: false } }).updates).toEqual({ autoCheck: false, autoDownload: false });
    expect(parseSettings({ updates: { autoCheck: 'yes' } }).updates).toEqual({ autoCheck: true, autoDownload: true });
  });

  it('upgrade a settings file written before updates existed', () => {
    const old = { version: 2, activeTab: 'lyrics', lyricsScale: 1.5 };
    const parsed = parseSettings(old);
    expect(parsed.activeTab).toBe('lyrics');
    expect(parsed.lyricsScale).toBe(1.5);
    expect(parsed.updates.autoCheck).toBe(true);
  });
});
