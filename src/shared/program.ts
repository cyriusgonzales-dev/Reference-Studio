import type { ResearchSource } from './research';
import type { ProgramState } from './types';

/**
 * Pure state machine for what panels 2 and 3 show. The main process owns the
 * single ProgramState and feeds every click and every async player result
 * through `reduceProgram`; side effects (creating or destroying video views)
 * are derived from the resulting state.
 */

export type ProgramEvent =
  | { type: 'showImage'; pickId: string; title: string; url: string; fallbackUrl?: string | null }
  | { type: 'upgradeImage'; pickId: string; url: string }
  | { type: 'showVideo'; title: string; videoId: string; startSeconds?: number }
  | { type: 'videoReady'; rev: number }
  | { type: 'videoFailed'; rev: number; message: string }
  | { type: 'showLyrics'; title: string; slides: string[]; source?: ResearchSource | null }
  | { type: 'lyricsGoto'; index: number }
  | { type: 'lyricsStep'; delta: 1 | -1 }
  | { type: 'clear' };

export function initialProgram(): ProgramState {
  return { kind: 'empty', rev: 0 };
}

/** Returns the next state, or the same object when the event does not apply. */
export function reduceProgram(state: ProgramState, event: ProgramEvent): ProgramState {
  const rev = state.rev + 1;
  switch (event.type) {
    case 'showImage':
      return {
        kind: 'image',
        rev,
        pickId: event.pickId,
        title: event.title,
        url: event.url,
        fallbackUrl: event.fallbackUrl && event.fallbackUrl !== event.url ? event.fallbackUrl : null
      };

    case 'upgradeImage':
      // Only the image from the same click may be upgraded, and only to a different URL.
      if (state.kind !== 'image' || state.pickId !== event.pickId || state.url === event.url) return state;
      return { ...state, url: event.url, fallbackUrl: state.fallbackUrl ?? state.url };

    case 'showVideo':
      // Clicking the video that is already showing does not restart it.
      if (state.kind === 'video' && state.videoId === event.videoId && state.status !== 'error') return state;
      return {
        kind: 'video',
        rev,
        title: event.title,
        videoId: event.videoId,
        startSeconds: Math.max(0, Math.floor(event.startSeconds ?? 0)),
        mode: 'embed',
        status: 'loading',
        error: null
      };

    case 'videoReady':
      if (state.kind !== 'video' || state.rev !== event.rev || state.status === 'ready') return state;
      return { ...state, status: 'ready' };

    case 'videoFailed':
      if (state.kind !== 'video' || state.rev !== event.rev) return state;
      // First failure of the embedded player: retry with the watch page (new rev reloads the views).
      if (state.mode === 'embed') return { ...state, rev, mode: 'watch', status: 'loading', error: null };
      return { ...state, status: 'error', error: event.message };

    case 'showLyrics': {
      const slides = event.slides.map((s) => s.trim()).filter(Boolean);
      if (slides.length === 0) return state;
      return { kind: 'lyrics', rev, title: event.title, slides, index: 0, source: event.source ?? null };
    }

    case 'lyricsGoto': {
      if (state.kind !== 'lyrics') return state;
      const index = Math.trunc(event.index);
      if (index < 0 || index >= state.slides.length || index === state.index) return state;
      return { ...state, index };
    }

    case 'lyricsStep': {
      if (state.kind !== 'lyrics') return state;
      const index = Math.min(state.slides.length - 1, Math.max(0, state.index + event.delta));
      return index === state.index ? state : { ...state, index };
    }

    case 'clear':
      return state.kind === 'empty' ? state : { kind: 'empty', rev };
  }
}
