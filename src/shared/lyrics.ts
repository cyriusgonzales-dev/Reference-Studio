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

/** Derives a song title from a Google results page title such as "amazing grace song lyrics - Google Search". */
export function titleFromSearchPage(pageTitle: string): string {
  const cleaned = pageTitle
    .replace(/\s*-\s*Google( Search)?\s*$/i, '')
    .replace(/\s+(song\s+)?lyrics\s*$/i, '')
    .trim();
  return cleaned || 'Lyrics';
}

/* ------------------------------------------------------------------ */
/* Song credits                                                        */
/* ------------------------------------------------------------------ */

/** Credits as the page states them (Google's lyrics box, a lyrics site's labels or structured data). */
export interface SongCreditInfo {
  title: string;
  composer: string;
  lyricist: string;
  writers: string;
  date: string;
}

/** Credits shown under lyrics slides. Every field comes from the page; null when it does not say. */
export interface SongCredit {
  title: string;
  composer: string | null;
  lyricist: string | null;
  writers: string | null;
  /** A year or date as the page wrote it ("1779", "October 1965"). */
  date: string | null;
}

const cleanCredit = (text: string, max = 160) => text.replace(/\s+/g, ' ').trim().slice(0, max);

/** Keeps a date only if it contains a plausible year, exactly as the page wrote it. */
function creditDate(text: string, now: Date): string | null {
  const cleaned = cleanCredit(text, 40);
  const year = /\b(1[5-9]\d\d|20\d\d)\b/.exec(cleaned);
  return year && Number(year[1]) <= now.getFullYear() + 1 ? cleaned : null;
}

/** "John Newton (1779)" → name "John Newton" and year "1779". */
function splitYear(name: string): { name: string; year: string } {
  const match = /^(.*?)\s*\((1[5-9]\d\d|20\d\d)\)\s*$/.exec(name);
  return match ? { name: match[1]!.trim(), year: match[2]! } : { name, year: '' };
}

/**
 * Builds the credits for highlighted lyrics from what the page states, plus a
 * "Songwriters: …" line if one was highlighted. Returns null when the page
 * names nobody and gives no date, so a bare title is never shown as a credit.
 */
export function resolveSongCredit(info: SongCreditInfo | null, selectedText: string, fallbackTitle: string, now = new Date()): SongCredit | null {
  const highlighted = /^\s*songwriters?\s*:\s*(.+)$/im.exec(selectedText)?.[1] ?? '';
  const lyricist = splitYear(cleanCredit(info?.lyricist ?? ''));
  const composer = splitYear(cleanCredit(info?.composer ?? ''));
  const credit: SongCredit = {
    title: cleanCredit(info?.title ?? '', 120) || fallbackTitle,
    composer: composer.name || null,
    lyricist: lyricist.name || null,
    writers: cleanCredit(info?.writers || highlighted) || null,
    date: creditDate(info?.date ?? '', now) ?? creditDate(composer.year || lyricist.year, now)
  };
  return credit.composer || credit.lyricist || credit.writers || credit.date ? credit : null;
}

/** "Lupang Hinirang · Music: Julián Felipe · Lyrics: José Palma · 1899". */
export function formatSongCredit(credit: SongCredit): string {
  const parts = [credit.title];
  if (credit.composer && credit.lyricist && credit.composer === credit.lyricist) parts.push(`Words & music: ${credit.composer}`);
  else {
    if (credit.composer) parts.push(`Music: ${credit.composer}`);
    if (credit.lyricist) parts.push(`Lyrics: ${credit.lyricist}`);
  }
  if (credit.writers && !credit.composer && !credit.lyricist) parts.push(`Written by ${credit.writers}`);
  if (credit.date) parts.push(credit.date);
  return parts.filter(Boolean).join(' · ');
}
