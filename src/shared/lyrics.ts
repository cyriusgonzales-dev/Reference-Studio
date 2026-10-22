/** Lyrics text handling: turning text highlighted on a web page into slides. */

export interface LyricsStyle {
  fontFamily: string;
  /** Font size in pixels on a 1080-pixel-tall output; scaled to the real size. */
  fontSize: number;
  fontWeight: number;
  textColor: string;
  backgroundColor: string;
  hAlign: 'left' | 'center' | 'right';
  vAlign: 'top' | 'middle' | 'bottom';
  lineHeight: number;
  /** Safe margin as a percentage of the output width. */
  marginPercent: number;
  textShadow: boolean;
  uppercase: boolean;
}

/** Longest selection accepted, in characters. */
export const MAX_LYRICS_TEXT = 20_000;
/** A stanza longer than this is split so slides stay readable. */
export const MAX_LINES_PER_SLIDE = 4;

/** Lines that are page furniture rather than lyrics (Google's lyrics box credits and similar). */
const NOISE_LINE = /^(source:|songwriters?:|lyrics (licensed|provided|powered) by|lyrics ©|report a problem|show more|show less|more$)/i;

function normalize(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\p{Zs}/gu, ' ')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line) => !NOISE_LINE.test(line))
    .join('\n');
}

/**
 * Splits lyrics into slides: one slide per stanza (blank-line separated),
 * with long stanzas broken into groups of at most MAX_LINES_PER_SLIDE lines.
 */
export function lyricsToSlides(text: string, maxLines = MAX_LINES_PER_SLIDE): string[] {
  const slides: string[] = [];
  for (const stanza of normalize(text.slice(0, MAX_LYRICS_TEXT)).split(/\n\s*\n/)) {
    const lines = stanza.split('\n').filter((l) => l.length > 0);
    if (lines.length === 0) continue;
    // Split evenly: 6 lines become 3+3 rather than 4+2.
    const groups = Math.ceil(lines.length / maxLines);
    const size = Math.ceil(lines.length / groups);
    for (let i = 0; i < lines.length; i += size) slides.push(lines.slice(i, i + size).join('\n'));
  }
  return slides;
}

/** A selection is treated as lyrics only if it is more than a stray word or two. */
export function isLyricsSelection(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length >= 15 && /\p{L}/u.test(trimmed);
}

/** Derives a song title from a Google results page title such as "amazing grace lyrics - Google Search". */
export function titleFromSearchPage(pageTitle: string): string {
  const cleaned = pageTitle
    .replace(/\s*-\s*Google( Search)?\s*$/i, '')
    .replace(/\s+lyrics\s*$/i, '')
    .trim();
  return cleaned || 'Lyrics';
}
