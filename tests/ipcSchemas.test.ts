import { describe, expect, it } from 'vitest';
import { INVOKE_CHANNELS } from '../src/shared/channels';
import { requestSchemas } from '../src/shared/schemas';
import { image, video } from './fixtures';

const parse = <C extends keyof typeof requestSchemas>(channel: C, payload: unknown) =>
  requestSchemas[channel].safeParse(payload).success;

describe('IPC request validation', () => {
  it('has a schema for every channel', () => {
    for (const channel of INVOKE_CHANNELS) expect(requestSchemas[channel]).toBeDefined();
    expect(Object.keys(requestSchemas).sort()).toEqual([...INVOKE_CHANNELS].sort());
  });

  it('accepts well-formed items', () => {
    expect(parse('output:present', { item: image() })).toBe(true);
    expect(parse('output:present', { item: video() })).toBe(true);
    expect(parse('queue:add', { item: video(), position: 'next' })).toBe(true);
  });

  it('rejects dangerous or malformed item URLs', () => {
    expect(parse('output:present', { item: image('a', { imageUrl: 'file:///C:/Windows/a.png' }) })).toBe(false);
    expect(parse('output:present', { item: image('a', { imageUrl: 'javascript:alert(1)' }) })).toBe(false);
    expect(parse('output:present', { item: image('a', { sourcePageUrl: 'chrome://settings' }) })).toBe(false);
    expect(parse('output:present', { item: video('a', { videoId: '../../etc' }) })).toBe(false);
    expect(parse('app:openExternal', { url: 'file:///C:/Windows/System32/calc.exe' })).toBe(false);
    expect(parse('app:openExternal', { url: 'ms-settings:' })).toBe(false);
  });

  it('rejects unknown kinds, bad ids and extra types', () => {
    expect(parse('output:present', { item: { ...image(), kind: 'html' } })).toBe(false);
    expect(parse('output:present', { item: image('../x') })).toBe(false);
    expect(parse('queue:remove', { id: 42 })).toBe(false);
    expect(parse('queue:move', { from: -1, to: 2 })).toBe(false);
    expect(parse('output:present', null)).toBe(false);
  });

  it('validates command enums and numeric ranges', () => {
    expect(parse('output:video', { command: 'seek', value: 30 })).toBe(true);
    expect(parse('output:video', { command: 'seek' })).toBe(false);
    expect(parse('output:video', { command: 'volume', value: 2 })).toBe(false);
    expect(parse('output:video', { command: 'eval' })).toBe(false);
    expect(parse('research:command', { command: 'back' })).toBe(true);
    expect(parse('research:command', { command: 'devtools' })).toBe(false);
    expect(parse('research:setBounds', { x: 0, y: 0, width: Number.NaN, height: 10, visible: true })).toBe(false);
  });

  it('requires channels without payloads to receive none', () => {
    expect(parse('output:clear', undefined)).toBe(true);
    expect(parse('output:clear', { sneaky: true })).toBe(false);
  });

  it('bounds lyrics snapshots', () => {
    const lyrics = { songId: 's1', title: 'T', slides: ['a'], index: 0 };
    expect(parse('output:present', { item: { kind: 'lyrics', id: 'l1', title: 'T', songId: 's1', slideIndex: 0 }, lyrics })).toBe(true);
    expect(parse('output:present', { item: { kind: 'lyrics', id: 'l1', title: 'T', songId: 's1', slideIndex: 0 }, lyrics: { ...lyrics, slides: [] } })).toBe(false);
  });
});
