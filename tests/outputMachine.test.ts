import { describe, expect, it } from 'vitest';
import { FIT_VIEW, initialOutputState, panView, reduceOutput, zoomView, type OutputEvent } from '../src/shared/outputMachine';
import type { OutputState } from '../src/shared/types';
import { image, liveLyrics, lyricsItem, video } from './fixtures';

function run(state: OutputState, ...events: OutputEvent[]): OutputState {
  return events.reduce((s, e) => reduceOutput(s, e).state, state);
}

describe('output state machine', () => {
  it('starts empty', () => {
    const s = initialOutputState();
    expect(s.status).toBe('EMPTY');
    expect(s.item).toBeNull();
  });

  describe('images', () => {
    it('goes LOADING_IMAGE → IMAGE when the matching token loads', () => {
      const loading = run(initialOutputState(), { type: 'presentImage', item: image() });
      expect(loading.status).toBe('LOADING_IMAGE');
      expect(loading.imageUrl).toBe('https://example.com/img1.jpg');
      const shown = reduceOutput(loading, { type: 'imageLoaded', token: loading.token });
      expect(shown.accepted).toBe(true);
      expect(shown.state.status).toBe('IMAGE');
    });

    it('ignores a stale image result after a newer present', () => {
      const first = run(initialOutputState(), { type: 'presentImage', item: image('a') });
      const second = run(first, { type: 'presentImage', item: image('b') });
      const result = reduceOutput(second, { type: 'imageLoaded', token: first.token });
      expect(result.accepted).toBe(false);
      expect(result.state.status).toBe('LOADING_IMAGE');
      expect(result.state.item?.id).toBe('b');
    });

    it('moves to ERROR with fallbacks when an image fails', () => {
      const item = image('a', { thumbnailUrl: 'https://encrypted-tbn0.gstatic.com/images?q=x', sourcePageUrl: 'https://example.com/page' });
      const loading = run(initialOutputState(), { type: 'presentImage', item });
      const failed = run(loading, { type: 'imageFailed', token: loading.token, message: 'HTTP 403' });
      expect(failed.status).toBe('ERROR');
      expect(failed.error?.thumbnailUrl).toBe(item.thumbnailUrl);
      expect(failed.error?.sourcePageUrl).toBe(item.sourcePageUrl);
    });

    it('can present a thumbnail URL instead of the original', () => {
      const s = run(initialOutputState(), { type: 'presentImage', item: image(), imageUrl: 'https://example.com/thumb.jpg' });
      expect(s.imageUrl).toBe('https://example.com/thumb.jpg');
    });

    it('resets zoom on each new image and clamps zoom', () => {
      let s = run(initialOutputState(), { type: 'presentImage', item: image() });
      s = run(s, { type: 'imageLoaded', token: s.token }, { type: 'setImageView', view: { mode: 'custom', scale: 50, panX: 9, panY: -9 } });
      expect(s.imageView.scale).toBe(8);
      expect(s.imageView.panX).toBe(1);
      expect(s.imageView.panY).toBe(-1);
      s = run(s, { type: 'presentImage', item: image('b') });
      expect(s.imageView).toEqual(FIT_VIEW);
    });

    it('rejects zoom when no image is live', () => {
      const r = reduceOutput(initialOutputState(), { type: 'setImageView', view: FIT_VIEW });
      expect(r.accepted).toBe(false);
    });
  });

  describe('videos', () => {
    it('goes LOADING_VIDEO → VIDEO and tracks playback', () => {
      let s = run(initialOutputState(), { type: 'presentVideo', item: video() });
      expect(s.status).toBe('LOADING_VIDEO');
      expect(s.video?.usingWatchPage).toBe(false);
      s = run(s, { type: 'videoReady', token: s.token });
      expect(s.status).toBe('VIDEO');
      s = run(s, { type: 'videoStatus', token: s.token, playback: { playing: true, currentTime: 12.5, duration: 200, volume: 3 } });
      expect(s.video).toMatchObject({ playing: true, currentTime: 12.5, duration: 200, volume: 1 });
    });

    it('drops NaN and negative playback values', () => {
      let s = run(initialOutputState(), { type: 'presentVideo', item: video() });
      s = run(s, { type: 'videoStatus', token: s.token, playback: { currentTime: Number.NaN, duration: -5 } });
      expect(s.video?.currentTime).toBe(0);
      expect(s.video?.duration).toBe(0);
    });

    it('offers the watch page and external link when the embed fails', () => {
      let s = run(initialOutputState(), { type: 'presentVideo', item: video() });
      s = run(s, { type: 'videoFailed', token: s.token, message: 'Embedding disabled' });
      expect(s.status).toBe('ERROR');
      expect(s.error?.canTryWatchPage).toBe(true);
      expect(s.error?.externalUrl).toContain('youtube.com/watch');
    });

    it('does not offer the watch page again when it already failed', () => {
      let s = run(initialOutputState(), { type: 'presentVideo', item: video(), useWatchPage: true });
      s = run(s, { type: 'videoFailed', token: s.token, message: 'Unavailable' });
      expect(s.error?.canTryWatchPage).toBe(false);
    });

    it('ignores video status from a replaced video', () => {
      const first = run(initialOutputState(), { type: 'presentVideo', item: video('a') });
      const second = run(first, { type: 'presentImage', item: image() });
      const r = reduceOutput(second, { type: 'videoStatus', token: first.token, playback: { playing: true } });
      expect(r.accepted).toBe(false);
      expect(r.state.video).toBeNull();
    });

    it('releases video state when switching to an image or lyrics', () => {
      let s = run(initialOutputState(), { type: 'presentVideo', item: video() });
      s = run(s, { type: 'videoReady', token: s.token });
      const toImage = run(s, { type: 'presentImage', item: image() });
      expect(toImage.video).toBeNull();
      const toLyrics = run(s, { type: 'presentLyrics', item: lyricsItem(), lyrics: liveLyrics() });
      expect(toLyrics.video).toBeNull();
      expect(toLyrics.status).toBe('LYRICS');
    });
  });

  describe('lyrics', () => {
    it('presents a frozen copy of the slides', () => {
      const lyrics = liveLyrics();
      const s = run(initialOutputState(), { type: 'presentLyrics', item: lyricsItem(), lyrics });
      lyrics.slides[0] = 'edited after presenting';
      expect(s.lyrics?.slides[0]).toBe('First slide');
    });

    it('clamps the starting slide and navigates within range', () => {
      let s = run(initialOutputState(), { type: 'presentLyrics', item: lyricsItem(), lyrics: liveLyrics({ index: 99 }) });
      expect(s.lyrics?.index).toBe(2);
      s = run(s, { type: 'lyricsGoto', index: 1 });
      expect(s.lyrics?.index).toBe(1);
      expect(s.item?.kind === 'lyrics' && s.item.slideIndex).toBe(1);
      const out = reduceOutput(s, { type: 'lyricsGoto', index: 3 });
      expect(out.accepted).toBe(false);
    });

    it('rejects a song without slides', () => {
      const r = reduceOutput(initialOutputState(), { type: 'presentLyrics', item: lyricsItem(), lyrics: liveLyrics({ slides: [] }) });
      expect(r.accepted).toBe(false);
      expect(r.state.status).toBe('EMPTY');
    });

    it('rejects slide navigation when lyrics are not live', () => {
      expect(reduceOutput(initialOutputState(), { type: 'lyricsGoto', index: 0 }).accepted).toBe(false);
    });
  });

  describe('clear and restore', () => {
    it('clears to EMPTY but remembers what was live', () => {
      let s = run(initialOutputState(), { type: 'presentLyrics', item: lyricsItem(), lyrics: liveLyrics({ index: 1 }) });
      const before = s.token;
      s = run(s, { type: 'clear' });
      expect(s.status).toBe('EMPTY');
      expect(s.token).toBeGreaterThan(before);
      expect(s.restorable?.lyrics?.index).toBe(1);
      s = run(s, { type: 'restore' });
      expect(s.status).toBe('LYRICS');
      expect(s.lyrics?.index).toBe(1);
    });

    it('restores an image into the loading state', () => {
      let s = run(initialOutputState(), { type: 'presentImage', item: image() });
      s = run(s, { type: 'imageLoaded', token: s.token }, { type: 'clear' }, { type: 'restore' });
      expect(s.status).toBe('LOADING_IMAGE');
    });

    it('refuses to restore over live content or with nothing saved', () => {
      expect(reduceOutput(initialOutputState(), { type: 'restore' }).accepted).toBe(false);
      const live = run(initialOutputState(), { type: 'presentImage', item: image() });
      expect(reduceOutput(live, { type: 'restore' }).accepted).toBe(false);
    });

    it('does not make an errored item restorable', () => {
      let s = run(initialOutputState(), { type: 'presentImage', item: image() });
      s = run(s, { type: 'imageFailed', token: s.token, message: 'x' }, { type: 'clear' });
      expect(s.restorable).toBeNull();
    });

    it('invalidates pending async results', () => {
      let s = run(initialOutputState(), { type: 'presentImage', item: image() });
      const token = s.token;
      s = run(s, { type: 'clear' });
      expect(reduceOutput(s, { type: 'imageLoaded', token }).accepted).toBe(false);
    });
  });

  describe('zoom helpers', () => {
    it('zooms relative to fit and resets', () => {
      const z = zoomView(FIT_VIEW, 'in');
      expect(z.mode).toBe('custom');
      expect(z.scale).toBeCloseTo(1.25);
      expect(zoomView(z, 'fit')).toEqual(FIT_VIEW);
      expect(zoomView(z, 'actual').mode).toBe('actual');
    });

    it('does not pan in fit mode and clamps pan', () => {
      expect(panView(FIT_VIEW, 0.5, 0.5)).toEqual(FIT_VIEW);
      const p = panView({ mode: 'custom', scale: 2, panX: 0.9, panY: 0 }, 0.5, -0.2);
      expect(p.panX).toBe(1);
      expect(p.panY).toBeCloseTo(-0.2);
    });
  });
});
