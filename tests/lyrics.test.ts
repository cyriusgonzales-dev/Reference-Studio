import { describe, expect, it } from 'vitest';
import {
  assessSlide,
  duplicateTitle,
  moveSlide,
  nextSlideIndex,
  normalizeSlideText,
  previousSlideIndex,
  searchSongs,
  splitLyrics
} from '../src/shared/lyrics';
import type { Song } from '../src/shared/types';

const song = (id: string, title: string, texts: string[]): Song => ({
  id,
  title,
  slides: texts.map((text, i) => ({ id: `${id}-${i}`, text })),
  createdAt: '',
  updatedAt: ''
});

describe('lyrics', () => {
  it('splits pasted lyrics at blank lines and normalises whitespace', () => {
    const text = 'Line one  \r\nLine two\r\n\r\n   \r\nVerse two\n\n\n\nChorus line\n';
    expect(splitLyrics(text)).toEqual(['Line one\nLine two', 'Verse two', 'Chorus line']);
  });

  it('returns no slides for blank input', () => {
    expect(splitLyrics('  \n\n \n')).toEqual([]);
  });

  it('normalises a single slide', () => {
    expect(normalizeSlideText('\n\nA  \r\nB\n\n')).toBe('A\nB');
  });

  it('flags dense slides', () => {
    expect(assessSlide('Short\nSlide').tooDense).toBe(false);
    expect(assessSlide(Array.from({ length: 10 }, () => 'line').join('\n')).tooDense).toBe(true);
    expect(assessSlide('x'.repeat(60)).advice).toMatch(/60 characters/);
  });

  it('navigates without leaving the slide range', () => {
    expect(nextSlideIndex(3, 2)).toBe(2);
    expect(nextSlideIndex(3, 0)).toBe(1);
    expect(previousSlideIndex(3, 0)).toBe(0);
    expect(nextSlideIndex(0, 0)).toBe(0);
  });

  it('reorders slides', () => {
    expect(moveSlide(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(moveSlide(['a', 'b'], 0, 9)).toEqual(['a', 'b']);
  });

  it('searches titles before text, ignoring case and accents', () => {
    const songs = [song('1', 'Zion', ['Glória a Deus']), song('2', 'Gloria', ['other']), song('3', 'Amazing', ['grace'])];
    expect(searchSongs(songs, 'gloria').map((s) => s.id)).toEqual(['2', '1']);
    expect(searchSongs(songs, '').map((s) => s.title)).toEqual(['Amazing', 'Gloria', 'Zion']);
  });

  it('creates unique duplicate titles', () => {
    expect(duplicateTitle('Song', ['Song'])).toBe('Song (copy)');
    expect(duplicateTitle('Song', ['Song', 'Song (copy)'])).toBe('Song (copy 2)');
    expect(duplicateTitle('Song (copy)', ['Song', 'Song (copy)'])).toBe('Song (copy 2)');
  });
});
