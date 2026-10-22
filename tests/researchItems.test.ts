import { describe, expect, it } from 'vitest';
import { resolveImagePick, resolveVideoLink } from '../src/shared/researchItems';

describe('clicked image', () => {
  it('uses the clicked image as is', () => {
    expect(resolveImagePick({ src: 'https://example.com/lion.jpg', alt: 'A lion', href: '' })).toEqual({
      title: 'A lion',
      url: 'https://example.com/lion.jpg',
      fallbackUrl: null
    });
  });

  it('prefers the original named by a Google imgres link, keeping the thumbnail as fallback', () => {
    const r = resolveImagePick({
      src: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:abc',
      alt: '',
      href: 'https://www.google.com/imgres?imgurl=https%3A%2F%2Fexample.com%2Fbig-cat.jpg&imgrefurl=https%3A%2F%2Fexample.com%2F'
    });
    expect(r).toEqual({ title: 'big cat', url: 'https://example.com/big-cat.jpg', fallbackUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:abc' });
  });
});

describe('clicked video', () => {
  it('resolves YouTube links with start time and title', () => {
    expect(resolveVideoLink('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s', '  Hymn ')).toEqual({
      videoId: 'dQw4w9WgXcQ',
      startSeconds: 42,
      title: 'Hymn'
    });
    expect(resolveVideoLink('https://www.youtube.com/shorts/dQw4w9WgXcQ', '')?.title).toBe('YouTube video');
  });

  it('drops the spoken duration YouTube adds to link text', () => {
    expect(resolveVideoLink('https://youtu.be/dQw4w9WgXcQ', '"Daanan" - Jolianne | Wish 107.5 Bus 3 minutes, 49 seconds')?.title).toBe(
      '"Daanan" - Jolianne | Wish 107.5 Bus'
    );
    expect(resolveVideoLink('https://youtu.be/dQw4w9WgXcQ', 'Live 1 hour, 2 minutes, 3 seconds')?.title).toBe('Live');
    expect(resolveVideoLink('https://youtu.be/dQw4w9WgXcQ', 'Top 10 minutes of fame')?.title).toBe('Top 10 minutes of fame');
  });

  it('rejects channel pages and look-alike hosts', () => {
    expect(resolveVideoLink('https://www.youtube.com/@channel', 'x')).toBeNull();
    expect(resolveVideoLink('https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ', 'x')).toBeNull();
  });
});
