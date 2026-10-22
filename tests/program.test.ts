import { describe, expect, it } from 'vitest';
import { initialProgram, reduceProgram, type ProgramEvent } from '../src/shared/program';
import type { ProgramState } from '../src/shared/types';

const run = (state: ProgramState, ...events: ProgramEvent[]) => events.reduce(reduceProgram, state);
const image = (pickId: string, url = `https://example.com/${pickId}.jpg`): ProgramEvent => ({
  type: 'showImage',
  pickId,
  title: pickId,
  url
});
const video = (videoId = 'dQw4w9WgXcQ'): ProgramEvent => ({ type: 'showVideo', title: 'Video', videoId });

describe('program (panels 2 and 3)', () => {
  it('starts empty and shows the latest clicked image', () => {
    let s = initialProgram();
    expect(s.kind).toBe('empty');
    s = run(s, image('a'), image('b'));
    expect(s.kind === 'image' && s.url).toBe('https://example.com/b.jpg');
  });

  it('upgrades a thumbnail to the full-size image only for the same click', () => {
    let s = run(initialProgram(), image('a', 'https://encrypted-tbn0.gstatic.com/x'));
    const rev = s.rev;
    s = run(s, { type: 'upgradeImage', pickId: 'other', url: 'https://example.com/wrong.jpg' });
    expect(s.kind === 'image' && s.url).toBe('https://encrypted-tbn0.gstatic.com/x');
    s = run(s, { type: 'upgradeImage', pickId: 'a', url: 'https://example.com/full.jpg' });
    expect(s).toMatchObject({ kind: 'image', url: 'https://example.com/full.jpg', fallbackUrl: 'https://encrypted-tbn0.gstatic.com/x', rev });
  });

  it('ignores an upgrade after another item was shown', () => {
    const s = run(initialProgram(), image('a'), video(), { type: 'upgradeImage', pickId: 'a', url: 'https://example.com/full.jpg' });
    expect(s.kind).toBe('video');
  });

  it('loads a video, becomes ready, and ignores stale results', () => {
    let s = run(initialProgram(), video());
    expect(s).toMatchObject({ kind: 'video', status: 'loading', mode: 'embed' });
    const stale = s.rev - 1;
    expect(run(s, { type: 'videoReady', rev: stale })).toBe(s);
    s = run(s, { type: 'videoReady', rev: s.rev });
    expect(s.kind === 'video' && s.status).toBe('ready');
  });

  it('does not restart when the same video is clicked again', () => {
    const s = run(initialProgram(), video(), { type: 'videoReady', rev: 1 });
    expect(run(s, video())).toBe(s);
  });

  it('falls back to the watch page once, then reports the error', () => {
    let s = run(initialProgram(), video());
    s = run(s, { type: 'videoFailed', rev: s.rev, message: 'Embedding disabled' });
    expect(s).toMatchObject({ kind: 'video', mode: 'watch', status: 'loading' });
    s = run(s, { type: 'videoFailed', rev: s.rev, message: 'Still failing' });
    expect(s).toMatchObject({ kind: 'video', status: 'error', error: 'Still failing' });
  });

  it('shows lyrics and steps through slides within range', () => {
    let s = run(initialProgram(), { type: 'showLyrics', title: 'Song', slides: ['one', ' ', 'two', 'three'] });
    expect(s.kind === 'lyrics' && s.slides).toEqual(['one', 'two', 'three']);
    s = run(s, { type: 'lyricsStep', delta: -1 });
    expect(s.kind === 'lyrics' && s.index).toBe(0);
    s = run(s, { type: 'lyricsStep', delta: 1 }, { type: 'lyricsStep', delta: 1 }, { type: 'lyricsStep', delta: 1 });
    expect(s.kind === 'lyrics' && s.index).toBe(2);
    s = run(s, { type: 'lyricsGoto', index: 0 });
    expect(s.kind === 'lyrics' && s.index).toBe(0);
    expect(run(s, { type: 'lyricsGoto', index: 9 })).toBe(s);
  });

  it('ignores empty lyrics and clears to black', () => {
    const s = run(initialProgram(), image('a'));
    expect(run(s, { type: 'showLyrics', title: 'x', slides: [' '] })).toBe(s);
    expect(run(s, { type: 'clear' }).kind).toBe('empty');
  });
});
