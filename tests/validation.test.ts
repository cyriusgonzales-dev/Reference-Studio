import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { JsonStore } from '../src/main/store/jsonStore';
import { INVOKE_CHANNELS } from '../src/shared/channels';
import { requestSchemas, researchPickSchema } from '../src/shared/schemas';
import { defaultSettings, lyricsStyleFor, parseSettings, type Settings } from '../src/shared/settings';

const ok = (channel: keyof typeof requestSchemas, payload: unknown) => requestSchemas[channel].safeParse(payload).success;

describe('operator UI requests', () => {
  it('has a schema for every channel', () => {
    expect(Object.keys(requestSchemas).sort()).toEqual([...INVOKE_CHANNELS].sort());
  });

  it('accepts valid requests and rejects malformed ones', () => {
    expect(ok('tab:navigate', { tab: 'images', input: 'lions' })).toBe(true);
    expect(ok('tab:navigate', { tab: 'files', input: 'x' })).toBe(false);
    expect(ok('app:openExternal', { url: 'file:///C:/Windows/System32/calc.exe' })).toBe(false);
    expect(ok('program:lyrics', { command: 'goto', index: 2 })).toBe(true);
    expect(ok('program:lyrics', { command: 'goto' })).toBe(false);
    expect(ok('view:setBounds', { view: 'output', x: 0, y: 0, width: Number.NaN, height: 1 })).toBe(false);
    expect(ok('settings:update', { lyricsScale: 9 })).toBe(false);
    expect(ok('settings:update', { somethingElse: true })).toBe(false);
    expect(ok('program:clear', { sneaky: 1 })).toBe(false);
  });
});

describe('messages from search pages (untrusted)', () => {
  const pick = (p: unknown) => researchPickSchema.safeParse(p).success;
  it('accepts genuine picks', () => {
    expect(pick({ type: 'image', pickId: 'k1-ab', src: 'https://example.com/a.jpg', alt: '', href: '' })).toBe(true);
    expect(pick({ type: 'image', pickId: 'k1', src: 'data:image/jpeg;base64,/9j/4AAQ', alt: '', href: '' })).toBe(true);
    expect(pick({ type: 'video', href: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'x' })).toBe(true);
    expect(pick({ type: 'lyrics', text: 'How sweet the sound', pageTitle: 'x' })).toBe(true);
  });

  it('rejects dangerous or oversized payloads', () => {
    expect(pick({ type: 'image', pickId: 'k1', src: 'file:///C:/secret.png', alt: '', href: '' })).toBe(false);
    expect(pick({ type: 'image', pickId: 'k1', src: 'javascript:alert(1)', alt: '', href: '' })).toBe(false);
    expect(pick({ type: 'image', pickId: '../x', src: 'https://e.com/a.png', alt: '', href: '' })).toBe(false);
    expect(pick({ type: 'video', href: 'javascript:alert(1)', title: '' })).toBe(false);
    expect(pick({ type: 'lyrics', text: 'x'.repeat(20_001), pageTitle: '' })).toBe(false);
    expect(pick({ type: 'run', code: 'x' })).toBe(false);
  });
});

describe('settings', () => {
  it('falls back field by field', () => {
    expect(parseSettings(null)).toEqual(defaultSettings());
    const s = parseSettings({ activeTab: 'youtube', lyricsScale: 99, tabUrls: { images: 'file:///x', youtube: 'https://www.youtube.com/results?search_query=a' } });
    expect(s.activeTab).toBe('youtube');
    expect(s.lyricsScale).toBe(1);
    expect(s.tabUrls.images).toBe('https://www.google.com/imghp');
    expect(s.tabUrls.youtube).toBe('https://www.youtube.com/results?search_query=a');
  });

  it('scales the lyrics font', () => {
    expect(lyricsStyleFor({ ...defaultSettings(), lyricsScale: 1.5 }).fontSize).toBe(114);
  });

  it('survives a corrupted settings file and keeps the damaged copy', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vrs-'));
    try {
      const file = path.join(dir, 'settings.json');
      const make = () =>
        new JsonStore<Settings>({ file, label: 'Settings', parse: (raw) => ({ data: parseSettings(raw), warnings: [] }), defaults: defaultSettings });
      make().writeNow({ ...defaultSettings(), activeTab: 'lyrics' });
      make().writeNow({ ...defaultSettings(), activeTab: 'youtube' });
      fs.writeFileSync(file, '{ broken', 'utf8');
      const report = make().load();
      expect(report.source).toBe('backup');
      expect(report.data.activeTab).toBe('lyrics');
      expect(fs.readdirSync(dir).some((f) => f.startsWith('settings.json.corrupt-'))).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
