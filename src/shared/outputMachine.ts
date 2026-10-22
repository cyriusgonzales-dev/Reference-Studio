import type {
  ImageItem,
  ImageView,
  LiveLyrics,
  LyricsItem,
  OutputError,
  OutputState,
  OutputStatus,
  VideoItem,
  VideoPlayback
} from './types';

/**
 * Pure state machine for the single Presentation Output.
 *
 * The main process owns one OutputState and feeds every operator command and
 * every asynchronous media result through `reduceOutput`. Side effects (loading
 * the image, creating or destroying the video view) are derived by the caller
 * from the resulting state, never performed here.
 */

export type OutputEvent =
  | { type: 'presentImage'; item: ImageItem; imageUrl?: string }
  | { type: 'imageLoaded'; token: number }
  | { type: 'imageFailed'; token: number; message: string }
  | { type: 'presentVideo'; item: VideoItem; useWatchPage?: boolean }
  | { type: 'videoReady'; token: number }
  | { type: 'videoStatus'; token: number; playback: Partial<Omit<VideoPlayback, 'usingWatchPage'>> }
  | { type: 'videoFailed'; token: number; message: string; detail?: string }
  | { type: 'presentLyrics'; item: LyricsItem; lyrics: LiveLyrics }
  | { type: 'lyricsGoto'; index: number }
  | { type: 'setImageView'; view: ImageView }
  | { type: 'clear' }
  | { type: 'restore' };

export interface ReduceResult {
  state: OutputState;
  accepted: boolean;
  /** Why an event was rejected. Useful for operator feedback and tests. */
  reason?: string;
}

export const FIT_VIEW: ImageView = { mode: 'fit', scale: 1, panX: 0, panY: 0 };
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;

export function initialOutputState(): OutputState {
  return {
    status: 'EMPTY',
    token: 0,
    item: null,
    imageUrl: null,
    imageView: FIT_VIEW,
    video: null,
    lyrics: null,
    error: null,
    restorable: null
  };
}

function initialPlayback(useWatchPage: boolean): VideoPlayback {
  return {
    playing: false,
    currentTime: 0,
    duration: 0,
    volume: 1,
    muted: false,
    ended: false,
    usingWatchPage: useWatchPage
  };
}

/** Statuses an operator would consider "something is on screen or about to be". */
export function isLiveContent(status: OutputStatus): boolean {
  return status !== 'EMPTY' && status !== 'ERROR';
}

function reject(state: OutputState, reason: string): ReduceResult {
  return { state, accepted: false, reason };
}

function accept(state: OutputState): ReduceResult {
  return { state, accepted: true };
}

/** Fresh state for a newly presented item: everything from the previous item is dropped. */
function presenting(state: OutputState, status: OutputStatus): OutputState {
  return {
    ...state,
    status,
    token: state.token + 1,
    imageUrl: null,
    imageView: FIT_VIEW,
    video: null,
    lyrics: null,
    error: null
  };
}

export function clampLyricsIndex(lyrics: LiveLyrics, index: number): number {
  if (lyrics.slides.length === 0) return 0;
  return Math.min(Math.max(0, Math.trunc(index)), lyrics.slides.length - 1);
}

function clampView(view: ImageView): ImageView {
  const clamp = (v: number, min: number, max: number) => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : 0);
  return {
    mode: view.mode,
    scale: view.mode === 'fit' ? 1 : clamp(view.scale, MIN_ZOOM, MAX_ZOOM) || 1,
    panX: view.mode === 'fit' ? 0 : clamp(view.panX, -1, 1),
    panY: view.mode === 'fit' ? 0 : clamp(view.panY, -1, 1)
  };
}

export function reduceOutput(state: OutputState, event: OutputEvent): ReduceResult {
  switch (event.type) {
    case 'presentImage': {
      const next = presenting(state, 'LOADING_IMAGE');
      return accept({ ...next, item: event.item, imageUrl: event.imageUrl ?? event.item.imageUrl });
    }

    case 'imageLoaded': {
      if (state.status !== 'LOADING_IMAGE') return reject(state, `imageLoaded ignored in ${state.status}`);
      if (event.token !== state.token) return reject(state, 'stale image result');
      return accept({ ...state, status: 'IMAGE' });
    }

    case 'imageFailed': {
      if (state.status !== 'LOADING_IMAGE') return reject(state, `imageFailed ignored in ${state.status}`);
      if (event.token !== state.token) return reject(state, 'stale image result');
      const item = state.item?.kind === 'image' ? state.item : null;
      const error: OutputError = { message: event.message };
      if (item?.thumbnailUrl && item.thumbnailUrl !== state.imageUrl) error.thumbnailUrl = item.thumbnailUrl;
      if (item?.sourcePageUrl) {
        error.sourcePageUrl = item.sourcePageUrl;
        error.externalUrl = item.sourcePageUrl;
      }
      return accept({ ...state, status: 'ERROR', error });
    }

    case 'presentVideo': {
      const next = presenting(state, 'LOADING_VIDEO');
      return accept({ ...next, item: event.item, video: initialPlayback(event.useWatchPage === true) });
    }

    case 'videoReady': {
      if (state.status !== 'LOADING_VIDEO') return reject(state, `videoReady ignored in ${state.status}`);
      if (event.token !== state.token) return reject(state, 'stale video result');
      return accept({ ...state, status: 'VIDEO' });
    }

    case 'videoStatus': {
      if (state.status !== 'VIDEO' && state.status !== 'LOADING_VIDEO') {
        return reject(state, `videoStatus ignored in ${state.status}`);
      }
      if (event.token !== state.token || !state.video) return reject(state, 'stale video status');
      return accept({ ...state, video: { ...state.video, ...sanitizePlayback(event.playback) } });
    }

    case 'videoFailed': {
      if (state.status !== 'VIDEO' && state.status !== 'LOADING_VIDEO') {
        return reject(state, `videoFailed ignored in ${state.status}`);
      }
      if (event.token !== state.token) return reject(state, 'stale video result');
      const item = state.item?.kind === 'video' ? state.item : null;
      const error: OutputError = { message: event.message };
      if (event.detail) error.detail = event.detail;
      if (item) {
        error.externalUrl = item.sourceUrl;
        error.canTryWatchPage = !state.video?.usingWatchPage;
      }
      return accept({ ...state, status: 'ERROR', error });
    }

    case 'presentLyrics': {
      if (event.lyrics.slides.length === 0) return reject(state, 'song has no slides');
      const next = presenting(state, 'LYRICS');
      const lyrics = { ...event.lyrics, slides: [...event.lyrics.slides] };
      lyrics.index = clampLyricsIndex(lyrics, lyrics.index);
      return accept({ ...next, item: event.item, lyrics });
    }

    case 'lyricsGoto': {
      if (state.status !== 'LYRICS' || !state.lyrics) return reject(state, 'lyrics are not live');
      const index = Math.trunc(event.index);
      if (index < 0 || index >= state.lyrics.slides.length) return reject(state, 'slide index out of range');
      if (index === state.lyrics.index) return accept(state);
      const lyrics = { ...state.lyrics, index };
      const item = state.item?.kind === 'lyrics' ? { ...state.item, slideIndex: index } : state.item;
      return accept({ ...state, lyrics, item });
    }

    case 'setImageView': {
      if (state.status !== 'IMAGE' && state.status !== 'LOADING_IMAGE') return reject(state, 'no image is live');
      return accept({ ...state, imageView: clampView(event.view) });
    }

    case 'clear': {
      const restorable = state.item && state.status !== 'ERROR' ? { item: state.item, lyrics: state.lyrics } : state.restorable;
      return accept({ ...initialOutputState(), token: state.token + 1, restorable });
    }

    case 'restore': {
      if (state.status !== 'EMPTY') return reject(state, 'output is not empty');
      const saved = state.restorable;
      if (!saved) return reject(state, 'nothing to restore');
      switch (saved.item.kind) {
        case 'image':
          return reduceOutput(state, { type: 'presentImage', item: saved.item });
        case 'video':
          return reduceOutput(state, { type: 'presentVideo', item: saved.item });
        case 'lyrics':
          if (!saved.lyrics) return reject(state, 'lyrics snapshot missing');
          return reduceOutput(state, { type: 'presentLyrics', item: saved.item, lyrics: saved.lyrics });
      }
    }
  }
}

function sanitizePlayback(p: Partial<Omit<VideoPlayback, 'usingWatchPage'>>): Partial<VideoPlayback> {
  const out: Partial<VideoPlayback> = {};
  if (typeof p.playing === 'boolean') out.playing = p.playing;
  if (typeof p.ended === 'boolean') out.ended = p.ended;
  if (typeof p.muted === 'boolean') out.muted = p.muted;
  if (typeof p.currentTime === 'number' && Number.isFinite(p.currentTime)) out.currentTime = Math.max(0, p.currentTime);
  if (typeof p.duration === 'number' && Number.isFinite(p.duration)) out.duration = Math.max(0, p.duration);
  if (typeof p.volume === 'number' && Number.isFinite(p.volume)) out.volume = Math.min(1, Math.max(0, p.volume));
  return out;
}

/** Computes a zoomed image view; used by both the controller and tests. */
export function zoomView(view: ImageView, command: 'in' | 'out' | 'fit' | 'actual' | 'reset'): ImageView {
  switch (command) {
    case 'fit':
    case 'reset':
      return FIT_VIEW;
    case 'actual':
      return { mode: 'actual', scale: 1, panX: 0, panY: 0 };
    case 'in':
    case 'out': {
      const base = view.mode === 'custom' ? view.scale : 1;
      const factor = command === 'in' ? 1.25 : 0.8;
      const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, base * factor));
      return clampView({ mode: 'custom', scale, panX: view.panX, panY: view.panY });
    }
  }
}

export function panView(view: ImageView, dx: number, dy: number): ImageView {
  if (view.mode === 'fit') return view;
  return clampView({ ...view, panX: view.panX + dx, panY: view.panY + dy });
}
