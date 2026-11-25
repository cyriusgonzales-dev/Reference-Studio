import { describe, expect, it } from 'vitest';
import { lyricsToSlides } from '../src/shared/lyrics';
import { requestSchemas } from '../src/shared/schemas';
import { DEFAULT_NDI_NAME, defaultSettings, lyricsStyleFor, NDI_NAME_PATTERN, parseSettings, SLIDE_PRESETS } from '../src/shared/settings';

describe('slide appearance settings', () => {
  it('default to white text centred on black', () => {
    const style = lyricsStyleFor(defaultSettings());
    expect(style).toMatchObject({ textColor: '#ffffff', backgroundColor: '#000000', vAlign: 'middle', hAlign: 'center', textShadow: true });
  });

  it('flow into the rendered style, with size and uppercase', () => {
    const settings = parseSettings({ lyricsScale: 1.5, lyricsUppercase: true, slides: { fontFamily: 'Georgia', backgroundColor: '#00b140', vAlign: 'bottom', textShadow: false } });
    const style = lyricsStyleFor(settings);
    expect(style).toMatchObject({ fontFamily: 'Georgia', backgroundColor: '#00b140', vAlign: 'bottom', textShadow: false, uppercase: true });
    expect(style.fontSize).toBe(Math.round(76 * 1.5));
    // Research text is smaller but follows the same look.
    expect(lyricsStyleFor(settings, true)).toMatchObject({ fontFamily: 'Georgia', backgroundColor: '#00b140' });
  });

  it('repair a damaged field without losing the others', () => {
    const settings = parseSettings({ slides: { fontFamily: 'Comic Sans', textColor: 'red', backgroundColor: '#123456', linesPerSlide: 99 } });
    expect(settings.slides.fontFamily).toBe('Segoe UI');
    expect(settings.slides.textColor).toBe('#ffffff');
    expect(settings.slides.backgroundColor).toBe('#123456');
    expect(settings.slides.linesPerSlide).toBe(4);
  });

  it('presets only use valid values', () => {
    for (const preset of SLIDE_PRESETS) {
      const parsed = parseSettings({ slides: { ...defaultSettings().slides, ...preset.appearance } });
      expect(parsed.slides).toMatchObject(preset.appearance);
    }
  });

  it('lines per slide controls how verses are split', () => {
    const verse = 'one line\ntwo line\nthree line\nfour line';
    expect(lyricsToSlides(verse, 4)).toHaveLength(1);
    expect(lyricsToSlides(verse, 2)).toEqual(['one line\ntwo line', 'three line\nfour line']);
  });
});

describe('NDI source name', () => {
  it('accepts ordinary names and rejects risky ones', () => {
    for (const ok of ['Vmix Reference Studio', 'Church PC 2', 'Lyrics - Main', 'Café Studio']) expect(NDI_NAME_PATTERN.test(ok)).toBe(true);
    for (const bad of ['', 'a'.repeat(49), 'name (with) brackets', 'semi;colon', 'new\nline']) expect(NDI_NAME_PATTERN.test(bad)).toBe(false);
  });

  it('falls back to the default when the saved name is invalid', () => {
    expect(parseSettings({ ndiName: 'bad(name)' }).ndiName).toBe(DEFAULT_NDI_NAME);
    expect(parseSettings({ ndiName: '  Studio B  ' }).ndiName).toBe('Studio B');
  });
});

describe('settings requests', () => {
  const schema = requestSchemas['settings:update'];

  it('accept a partial slide update', () => {
    expect(schema.safeParse({ slides: { vAlign: 'bottom' } }).success).toBe(true);
  });

  it('reject invalid values instead of guessing', () => {
    expect(schema.safeParse({ slides: { textColor: 'javascript:alert(1)' } }).success).toBe(false);
    expect(schema.safeParse({ slides: { fontFamily: 'Not A Font' } }).success).toBe(false);
    expect(schema.safeParse({ slides: { unknown: true } }).success).toBe(false);
    expect(schema.safeParse({ ndiName: 'x'.repeat(60) }).success).toBe(false);
    expect(schema.safeParse({ openAtLogin: 'yes' }).success).toBe(false);
  });
});
