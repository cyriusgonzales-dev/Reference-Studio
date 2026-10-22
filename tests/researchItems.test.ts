import { describe, expect, it } from 'vitest';
import { imageItemFromContext, videoItemFromUrl } from '../src/shared/researchItems';

const ctx = (overrides: Partial<Parameters<typeof imageItemFromContext>[0]>) => ({
  srcURL: '',
  linkURL: '',
  altText: '',
  titleText: '',
  pageURL: 'https://www.google.com/search?tbm=isch&q=lion',
  ...overrides
});

describe('image selection from the research browser', () => {
  it('uses the right-clicked image and ignores Google result pages as the source', () => {
    const item = imageItemFromContext(ctx({ srcURL: 'https://example.com/full.jpg', altText: 'A lion' }), 'id1');
    expect(item).toEqual({ kind: 'image', id: 'id1', title: 'A lion', imageUrl: 'https://example.com/full.jpg' });
  });

  it('prefers the original image named by a Google imgres link and keeps the thumbnail as fallback', () => {
    const item = imageItemFromContext(
      ctx({
        srcURL: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:abc',
        linkURL:
          'https://www.google.com/imgres?imgurl=https%3A%2F%2Fexample.com%2Fbig.jpg&imgrefurl=https%3A%2F%2Fexample.com%2Farticle'
      }),
      'id2'
    );
    expect(item?.imageUrl).toBe('https://example.com/big.jpg');
    expect(item?.thumbnailUrl).toBe('https://encrypted-tbn0.gstatic.com/images?q=tbn:abc');
    expect(item?.sourcePageUrl).toBe('https://example.com/article');
  });

  it('uses a non-Google surrounding link as the source page', () => {
    const item = imageItemFromContext(ctx({ srcURL: 'https://cdn.example.com/a.png', linkURL: 'https://example.com/story' }));
    expect(item?.sourcePageUrl).toBe('https://example.com/story');
  });

  it('accepts base64 data thumbnails but rejects other schemes', () => {
    expect(imageItemFromContext(ctx({ srcURL: 'data:image/jpeg;base64,/9j/4AAQ' }))?.title).toBe('Embedded image');
    expect(imageItemFromContext(ctx({ srcURL: 'blob:https://www.google.com/123' }))).toBeNull();
    expect(imageItemFromContext(ctx({ srcURL: 'file:///C:/x.png' }))).toBeNull();
  });

  it('derives a title from the URL when alt text is missing', () => {
    expect(imageItemFromContext(ctx({ srcURL: 'https://example.com/red-sea.jpg' }))?.title).toBe('red sea');
  });
});

describe('video selection from the research browser', () => {
  it('builds a video item from a YouTube link with start time', () => {
    const item = videoItemFromUrl('https://youtu.be/dQw4w9WgXcQ?t=42', '  Hymn  ', 'v1');
    expect(item).toEqual({
      kind: 'video',
      id: 'v1',
      title: 'Hymn',
      videoId: 'dQw4w9WgXcQ',
      sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
      startSeconds: 42
    });
  });

  it('ignores non-video links and generates ids', () => {
    expect(videoItemFromUrl('https://www.youtube.com/@channel', 'x')).toBeNull();
    const a = videoItemFromUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ', '');
    expect(a?.title).toBe('YouTube video');
    expect(a?.id).toMatch(/^[0-9a-f-]{36}$/);
  });
});
