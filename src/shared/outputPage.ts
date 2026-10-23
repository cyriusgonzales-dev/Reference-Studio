import type { LyricsStyle } from './lyrics';

/**
 * Contract between the main process and the offscreen output page (images,
 * lyrics, black). Only the output-page preload and the main process import
 * this module (see channels.ts on why preloads must not share modules).
 */

export const OUTPUT_RENDER_CHANNEL = 'outputpage:render';
export const OUTPUT_READY_CHANNEL = 'outputpage:ready';

export type OutputPageState =
  | { kind: 'black'; rev: number }
  | { kind: 'image'; rev: number; url: string; fallbackUrl: string | null }
  | { kind: 'lyrics'; rev: number; text: string; style: LyricsStyle; source: string | null };

export interface OutputPageApi {
  onRender(listener: (state: OutputPageState) => void): void;
  ready(): void;
}
