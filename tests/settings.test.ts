import { describe, expect, it } from 'vitest';
import { applySettingsPatch, defaultSettings, parseSettings, validateSettingsPatch } from '../src/shared/settings';

describe('settings', () => {
  it('fills defaults for missing or garbage input', () => {
    expect(parseSettings(undefined)).toEqual(defaultSettings());
    expect(parseSettings('nonsense')).toEqual(defaultSettings());
    expect(parseSettings({})).toEqual(defaultSettings());
  });

  it('keeps valid fields and replaces only invalid ones', () => {
    const s = parseSettings({
      output: { transitionMs: 0, imageBackground: 'red', displayId: 5 },
      lyrics: { fontSize: 9000, textColor: '#ff0000', fontFamily: 'Arial' }
    });
    expect(s.output.transitionMs).toBe(0);
    expect(s.output.displayId).toBe(5);
    expect(s.output.imageBackground).toBe('#000000');
    expect(s.lyrics.fontSize).toBe(72);
    expect(s.lyrics.textColor).toBe('#ff0000');
    expect(s.lyrics.fontFamily).toBe('Arial');
  });

  it('drops invalid shortcuts but keeps explicit disables', () => {
    const s = parseSettings({ shortcuts: { toggleOutput: 'P', reload: null, back: 'Alt+Left' } });
    expect(s.shortcuts.toggleOutput).toBe('Ctrl+Shift+P');
    expect(s.shortcuts.reload).toBeNull();
    expect(s.shortcuts.back).toBe('Alt+Left');
  });

  it('rejects unsafe home pages and background images', () => {
    const s = parseSettings({
      research: { homeUrl: 'file:///C:/x.html' },
      lyrics: { backgroundImage: 'javascript:alert(1)' }
    });
    expect(s.research.homeUrl).toBe(defaultSettings().research.homeUrl);
    expect(s.lyrics.backgroundImage).toBeNull();
  });

  it('applies valid patches', () => {
    const next = applySettingsPatch(defaultSettings(), { queue: { autoAdvanceOnVideoEnd: true }, shortcuts: { reload: null } });
    expect(next.queue.autoAdvanceOnVideoEnd).toBe(true);
    expect(next.queue.presentOnNavigate).toBe(false);
    expect(next.shortcuts.reload).toBeNull();
  });

  it('rejects invalid patches with a message', () => {
    expect(validateSettingsPatch({ output: { transitionMs: -5 } })).toMatch(/output.transitionMs/);
    expect(validateSettingsPatch({ output: { bogus: 1 } })).toMatch(/Unknown setting/);
    expect(validateSettingsPatch({ nope: {} })).toMatch(/Unknown settings section/);
    expect(validateSettingsPatch({ shortcuts: { toggleOutput: 'P' } })).toMatch(/Ctrl or Alt/);
    expect(validateSettingsPatch({ version: 2 })).toMatch(/version/);
    expect(() => applySettingsPatch(defaultSettings(), { lyrics: { textColor: 'blue' } })).toThrow(/textColor/);
  });
});
