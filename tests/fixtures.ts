import type { ImageItem, LiveLyrics, LyricsItem, VideoItem } from '../src/shared/types';

export const image = (id = 'img1', overrides: Partial<ImageItem> = {}): ImageItem => ({
  kind: 'image',
  id,
  title: `Image ${id}`,
  imageUrl: `https://example.com/${id}.jpg`,
  ...overrides
});

export const video = (id = 'vid1', overrides: Partial<VideoItem> = {}): VideoItem => ({
  kind: 'video',
  id,
  title: `Video ${id}`,
  videoId: 'dQw4w9WgXcQ',
  sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  ...overrides
});

export const lyricsItem = (id = 'lyr1', overrides: Partial<LyricsItem> = {}): LyricsItem => ({
  kind: 'lyrics',
  id,
  title: 'Song',
  songId: 'song1',
  slideIndex: 0,
  ...overrides
});

export const liveLyrics = (overrides: Partial<LiveLyrics> = {}): LiveLyrics => ({
  songId: 'song1',
  title: 'Song',
  slides: ['First slide', 'Second slide', 'Third slide'],
  index: 0,
  ...overrides
});
