/**
 * Domain types shared by the main process, preload scripts and the UI.
 * This module must stay free of Electron and Node imports.
 */

import type { Settings } from './settings';

/** The three search tabs in panel 1. Each tab is its own browser with its own history. */
export type TabId = 'images' | 'youtube' | 'lyrics';
export const TAB_IDS: readonly TabId[] = ['images', 'youtube', 'lyrics'];

export interface TabState {
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  error: string | null;
}

/**
 * What panel 2 (player) shows; panel 3 (vMix output) always mirrors it.
 * `rev` increases with every new item so late async results can be ignored.
 */
export type ProgramState =
  | { kind: 'empty'; rev: number }
  | {
      kind: 'image';
      rev: number;
      /** Identifies the click that produced this image, for full-size upgrades. */
      pickId: string;
      title: string;
      /** Best known URL (upgraded to the full-size image when Google reveals it). */
      url: string;
      /** Smaller image used if the full-size one cannot be loaded. */
      fallbackUrl: string | null;
    }
  | {
      kind: 'video';
      rev: number;
      title: string;
      videoId: string;
      startSeconds: number;
      /** "embed" = YouTube's embedded player; "watch" = the watch page, used when embedding is refused. */
      mode: 'embed' | 'watch';
      status: 'loading' | 'ready' | 'error';
      error: string | null;
    }
  | { kind: 'lyrics'; rev: number; title: string; slides: string[]; index: number };

export interface Playback {
  playing: boolean;
  currentTime: number;
  duration: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Where panel 3 is on screen, in physical pixels, for vMix cropping. */
export interface CaptureInfo {
  displayName: string;
  /** Crop for vMix Desktop Capture of that display. */
  displayCrop: Rect;
  /** Crop for vMix capture of the application window (client area). */
  windowCrop: Rect;
}

export type AdblockLevel = 'adsAndTracking' | 'full';

export interface AdblockStatus {
  enabled: boolean;
  applyToOutput: boolean;
  level: AdblockLevel;
  engine: 'loading' | 'ready' | 'error' | 'off';
  updating: boolean;
  lastUpdated: string | null;
  blockedCount: number;
  error: string | null;
}

export interface AppSnapshot {
  activeTab: TabId;
  tabs: Record<TabId, TabState>;
  program: ProgramState;
  playback: Playback | null;
  adblock: AdblockStatus;
  settings: Settings;
  capture: CaptureInfo | null;
  version: string;
}

export type NotifyLevel = 'info' | 'success' | 'warning' | 'error';

export interface Notification {
  id: number;
  level: NotifyLevel;
  message: string;
}

/** Result envelope for every invoke-style IPC call. */
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string };
