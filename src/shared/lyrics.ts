import type { LyricsSlide, Song } from './types';

/** Maximum characters in a single slide; longer text is rejected by validation. */
export const MAX_SLIDE_CHARS = 2000;
export const MAX_SLIDES_PER_SONG = 300;

/** Thresholds used to recommend splitting a slide. */
export const SLIDE_WARN_LINES = 8;
export const SLIDE_WARN_LINE_LENGTH = 48;
export const SLIDE_WARN_CHARS = 360;

/** Normalises line endings and trims trailing whitespace on each line. */
export function normalizeSlideText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+$/u, ''))
    .join('\n')
    .replace(/^\n+|\n+$/g, '');
}

/** Splits pasted lyrics into slides at blank lines. */
export function splitLyrics(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n/)
    .map(normalizeSlideText)
    .filter((slide) => slide.length > 0);
}

export interface SlideAssessment {
  lines: number;
  longestLine: number;
  chars: number;
  tooDense: boolean;
  advice: string | null;
}

export function assessSlide(text: string): SlideAssessment {
  const lines = text.length ? text.split('\n') : [];
  const longestLine = lines.reduce((max, line) => Math.max(max, line.length), 0);
  const chars = text.length;
  let advice: string | null = null;
  if (lines.length > SLIDE_WARN_LINES) {
    advice = `${lines.length} lines — consider splitting this slide (recommended ≤ ${SLIDE_WARN_LINES}).`;
  } else if (chars > SLIDE_WARN_CHARS) {
    advice = `${chars} characters — consider splitting this slide for readability.`;
  } else if (longestLine > SLIDE_WARN_LINE_LENGTH) {
    advice = `A line has ${longestLine} characters and will be wrapped or shrunk; consider shorter lines.`;
  }
  return { lines: lines.length, longestLine, chars, tooDense: advice !== null, advice };
}

export function nextSlideIndex(count: number, index: number): number {
  if (count <= 0) return 0;
  return Math.min(count - 1, index + 1);
}

export function previousSlideIndex(count: number, index: number): number {
  if (count <= 0) return 0;
  return Math.max(0, index - 1);
}

/** Moves a slide within an array, returning a new array. Out-of-range moves return the input. */
export function moveSlide<T>(slides: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= slides.length || to >= slides.length) return [...slides];
  const copy = [...slides];
  const [moved] = copy.splice(from, 1);
  if (moved === undefined) return [...slides];
  copy.splice(to, 0, moved);
  return copy;
}

function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Case- and accent-insensitive search over song titles and slide text. Title matches rank first. */
export function searchSongs(songs: readonly Song[], query: string): Song[] {
  const q = fold(query.trim());
  const sorted = [...songs].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
  if (!q) return sorted;
  const titleHits: Song[] = [];
  const textHits: Song[] = [];
  for (const song of sorted) {
    if (fold(song.title).includes(q)) titleHits.push(song);
    else if (song.slides.some((s) => fold(s.text).includes(q))) textHits.push(song);
  }
  return [...titleHits, ...textHits];
}

/** Picks a unique "Copy" title for a duplicated song. */
export function duplicateTitle(title: string, existing: readonly string[]): string {
  const taken = new Set(existing.map((t) => t.toLowerCase()));
  const base = title.replace(/\s+\(copy(?: \d+)?\)$/i, '');
  let candidate = `${base} (copy)`;
  let n = 2;
  while (taken.has(candidate.toLowerCase())) candidate = `${base} (copy ${n++})`;
  return candidate;
}

export function slidesToText(slides: readonly LyricsSlide[]): string[] {
  return slides.map((s) => s.text);
}
