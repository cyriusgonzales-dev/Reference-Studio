import { describe, expect, it } from 'vitest';
import { formatSongCredit, isLyricsSelection, lyricsToSlides, resolveSongCredit, titleFromSearchPage } from '../src/shared/lyrics';

describe('lyrics from a highlighted Google result', () => {
  it('makes one slide per stanza', () => {
    const text = 'Amazing grace\nHow sweet the sound\n\nI once was lost\nBut now am found\n';
    expect(lyricsToSlides(text)).toEqual(['Amazing grace\nHow sweet the sound', 'I once was lost\nBut now am found']);
  });

  it('splits long stanzas evenly into slides of at most 4 lines', () => {
    const six = ['1', '2', '3', '4', '5', '6'].map((n) => `line ${n}`).join('\n');
    expect(lyricsToSlides(six)).toEqual(['line 1\nline 2\nline 3', 'line 4\nline 5\nline 6']);
    const nine = Array.from({ length: 9 }, (_, i) => `l${i}`).join('\n');
    expect(lyricsToSlides(nine).map((s) => s.split('\n').length)).toEqual([3, 3, 3]);
  });

  it('normalises Windows line endings, non-breaking spaces and page furniture', () => {
    const text = 'Line one  \r\nLine two\r\n\r\nSource: Musixmatch\r\nSongwriters: John Newton\r\nShow more';
    expect(lyricsToSlides(text)).toEqual(['Line one\nLine two']);
  });

  it('ignores stray selections', () => {
    expect(isLyricsSelection('the')).toBe(false);
    expect(isLyricsSelection('1234567890123456')).toBe(false);
    expect(isLyricsSelection('How sweet the sound')).toBe(true);
  });

  it('derives a song title from the results page', () => {
    expect(titleFromSearchPage('amazing grace lyrics - Google Search')).toBe('amazing grace');
    expect(titleFromSearchPage('amazing grace song lyrics - Google Search')).toBe('amazing grace');
    expect(titleFromSearchPage('')).toBe('Lyrics');
  });
});

describe('song credits', () => {
  const info = (o: Partial<{ title: string; composer: string; lyricist: string; writers: string; date: string }>) => ({
    title: '',
    composer: '',
    lyricist: '',
    writers: '',
    date: '',
    ...o
  });

  it('shows the title, composer, lyricist and date the page states', () => {
    const credit = resolveSongCredit(info({ title: 'Lupang Hinirang', composer: 'Julián Felipe', lyricist: 'José Palma' }), '', 'lupang hinirang');
    expect(formatSongCredit(credit!)).toBe('Lupang Hinirang · Music: Julián Felipe · Lyrics: José Palma');
  });

  it('takes the year from "Name (1779)" and keeps dates only with a real year', () => {
    const credit = resolveSongCredit(info({ title: 'Amazing grace!', lyricist: 'John Newton (1779)' }), '', 'x');
    expect(formatSongCredit(credit!)).toBe('Amazing grace! · Lyrics: John Newton · 1779');
    expect(resolveSongCredit(info({ writers: 'A', date: 'last week' }), '', 'x')?.date).toBeNull();
    expect(resolveSongCredit(info({ writers: 'A', date: 'October 1965' }), '', 'x')?.date).toBe('October 1965');
  });

  it('uses writers, or a highlighted "Songwriters:" line, when there is no composer', () => {
    expect(formatSongCredit(resolveSongCredit(info({ title: 'Yesterday', writers: 'John Lennon, Paul McCartney' }), '', 'x')!)).toBe(
      'Yesterday · Written by John Lennon, Paul McCartney'
    );
    expect(formatSongCredit(resolveSongCredit(null, 'Line one\nSongwriters: John Newton', 'amazing grace')!)).toBe('amazing grace · Written by John Newton');
  });

  it('shows nothing when the page names nobody and gives no date', () => {
    expect(resolveSongCredit(info({ title: 'Song' }), 'Line one', 'x')).toBeNull();
    expect(resolveSongCredit(null, 'Line one', 'x')).toBeNull();
  });

  it('writes one credit for someone who wrote both words and music', () => {
    expect(formatSongCredit(resolveSongCredit(info({ title: 'S', composer: 'A B', lyricist: 'A B' }), '', 'x')!)).toBe('S · Words & music: A B');
  });
});
