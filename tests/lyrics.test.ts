import { describe, expect, it } from 'vitest';
import { isLyricsSelection, lyricsToSlides, titleFromSearchPage } from '../src/shared/lyrics';

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
    expect(titleFromSearchPage('')).toBe('Lyrics');
  });
});
