import { describe, expect, it } from 'vitest';
import {
  buildSearchUrl,
  cleanYouTubeTitle,
  inferSearchMode,
  isAllowedImageUrl,
  isGoogleThumbnailUrl,
  isHttpUrl,
  looksLikeUrl,
  parseGoogleImgresLink,
  parseYouTubeTime,
  parseYouTubeVideo,
  resolveAddressInput,
  titleFromImageUrl,
  youtubeEmbedUrl
} from '../src/shared/urls';

describe('URL validation', () => {
  it('accepts only http(s) URLs without credentials', () => {
    expect(isHttpUrl('https://example.com/a')).toBe(true);
    expect(isHttpUrl('http://example.com')).toBe(true);
    expect(isHttpUrl('file:///C:/Windows/win.ini')).toBe(false);
    expect(isHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpUrl('https://user:pass@example.com')).toBe(false);
    expect(isHttpUrl('not a url')).toBe(false);
    expect(isHttpUrl('https://' + 'a'.repeat(9000) + '.com')).toBe(false);
  });

  it('accepts http(s) and base64 data images only', () => {
    expect(isAllowedImageUrl('https://example.com/a.png')).toBe(true);
    expect(isAllowedImageUrl('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
    expect(isAllowedImageUrl('data:image/png;base64,')).toBe(false);
    expect(isAllowedImageUrl('data:text/html;base64,PHNjcmlwdD4=')).toBe(false);
    expect(isAllowedImageUrl('data:image/png;base64,<script>')).toBe(false);
    expect(isAllowedImageUrl('file:///C:/a.png')).toBe(false);
    expect(isAllowedImageUrl('vrs-asset://local/abc-123.png')).toBe(true);
    expect(isAllowedImageUrl('vrs-asset://local/../secret.png')).toBe(false);
  });
});

describe('address bar', () => {
  it('detects URLs versus search terms', () => {
    expect(looksLikeUrl('example.com')).toBe(true);
    expect(looksLikeUrl('https://x.org/path?q=1')).toBe(true);
    expect(looksLikeUrl('localhost:3000')).toBe(true);
    expect(looksLikeUrl('mount sinai')).toBe(false);
    expect(looksLikeUrl('john3.16')).toBe(false);
  });

  it('builds searches per mode', () => {
    expect(buildSearchUrl('red sea', 'images', 'google')).toBe('https://www.google.com/search?tbm=isch&q=red%20sea');
    expect(buildSearchUrl('hymn', 'youtube', 'google')).toBe('https://www.youtube.com/results?search_query=hymn');
    expect(buildSearchUrl('a&b', 'web', 'duckduckgo')).toBe('https://duckduckgo.com/?q=a%26b');
    expect(buildSearchUrl('x', 'web', 'bing')).toBe('https://www.bing.com/search?q=x');
  });

  it('navigates URLs directly and blocks local schemes', () => {
    expect(resolveAddressInput('example.com/a', 'images', 'google')).toBe('https://example.com/a');
    expect(resolveAddressInput('lions', 'images', 'google')).toContain('tbm=isch');
    expect(resolveAddressInput('javascript:alert(1)', 'web', 'google')).toBeNull();
    expect(resolveAddressInput('file:///C:/x', 'web', 'google')).toBeNull();
    expect(resolveAddressInput('   ', 'web', 'google')).toBeNull();
  });

  it('infers the search mode from a page URL', () => {
    expect(inferSearchMode('https://www.google.com/search?tbm=isch&q=x')).toBe('images');
    expect(inferSearchMode('https://www.google.com/search?udm=2&q=x')).toBe('images');
    expect(inferSearchMode('https://www.youtube.com/results?search_query=x')).toBe('youtube');
    expect(inferSearchMode('https://example.com')).toBeNull();
  });
});

describe('YouTube parsing', () => {
  it('recognises the common link shapes', () => {
    expect(parseYouTubeVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({ videoId: 'dQw4w9WgXcQ' });
    expect(parseYouTubeVideo('https://youtu.be/dQw4w9WgXcQ?t=1m30s')).toEqual({ videoId: 'dQw4w9WgXcQ', startSeconds: 90 });
    expect(parseYouTubeVideo('https://m.youtube.com/shorts/dQw4w9WgXcQ')?.videoId).toBe('dQw4w9WgXcQ');
    expect(parseYouTubeVideo('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')?.videoId).toBe('dQw4w9WgXcQ');
    expect(parseYouTubeVideo('https://www.youtube.com/live/dQw4w9WgXcQ')?.videoId).toBe('dQw4w9WgXcQ');
  });

  it('rejects non-video and look-alike URLs', () => {
    expect(parseYouTubeVideo('https://www.youtube.com/results?search_query=x')).toBeNull();
    expect(parseYouTubeVideo('https://www.youtube.com/watch?v=short')).toBeNull();
    expect(parseYouTubeVideo('https://evil-youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(parseYouTubeVideo('https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ')).toBeNull();
  });

  it('parses time parameters', () => {
    expect(parseYouTubeTime('90')).toBe(90);
    expect(parseYouTubeTime('1h2m3s')).toBe(3723);
    expect(parseYouTubeTime('abc')).toBeUndefined();
    expect(parseYouTubeTime(null)).toBeUndefined();
  });

  it('builds embed URLs with autoplay and optional controls', () => {
    const url = new URL(youtubeEmbedUrl('dQw4w9WgXcQ', { controls: false, startSeconds: 30.7 }));
    expect(url.hostname).toBe('www.youtube-nocookie.com');
    expect(url.searchParams.get('autoplay')).toBe('1');
    expect(url.searchParams.get('controls')).toBe('0');
    expect(url.searchParams.get('start')).toBe('30');
  });

  it('cleans page titles', () => {
    expect(cleanYouTubeTitle('(3) Great Hymn - YouTube')).toBe('Great Hymn');
  });
});

describe('Google Images helpers', () => {
  it('recognises thumbnails and imgres links', () => {
    expect(isGoogleThumbnailUrl('https://encrypted-tbn0.gstatic.com/images?q=tbn:abc')).toBe(true);
    expect(isGoogleThumbnailUrl('https://example.com/a.jpg')).toBe(false);
    const link =
      'https://www.google.com/imgres?imgurl=https%3A%2F%2Fexample.com%2Fbig.jpg&imgrefurl=https%3A%2F%2Fexample.com%2Fpage';
    expect(parseGoogleImgresLink(link)).toEqual({ imageUrl: 'https://example.com/big.jpg', sourcePageUrl: 'https://example.com/page' });
    expect(parseGoogleImgresLink('https://www.google.com/imgres?imgurl=javascript:alert(1)')).toBeNull();
  });

  it('derives readable titles', () => {
    expect(titleFromImageUrl('https://example.com/images/red-sea_crossing.jpg')).toBe('red sea crossing');
    expect(titleFromImageUrl('data:image/png;base64,AAAA')).toBe('Embedded image');
  });
});
