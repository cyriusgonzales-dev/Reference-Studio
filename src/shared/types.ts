/**
 * Domain types shared by the main process, preload scripts and renderers.
 * This module must stay free of Electron and Node imports.
 */

import type { Settings } from './settings';

export type SearchMode = 'images' | 'youtube' | 'web';
export type SearchEngine = 'google' | 'duckduckgo' | 'bing';

export interface ImageItem {
  kind: 'image';
  id: string;
  title: string;
  /** The URL that will be loaded by the Presentation Output. */
  imageUrl: string;
  /** Page the image was found on, used for the "open source page" fallback. */
  sourcePageUrl?: string;
  /** A smaller, more accessible variant (for example a Google thumbnail). */
  thumbnailUrl?: string;
}

export interface VideoItem {
  kind: 'video';
  id: string;
  title: string;
  videoId: string;
  sourceUrl: string;
  thumbnailUrl?: string;
  startSeconds?: number;
}

export interface LyricsItem {
  kind: 'lyrics';
  id: string;
  title: string;
  songId: string;
  slideIndex: number;
}

export type PresentableItem = ImageItem | VideoItem | LyricsItem;
export type ItemKind = PresentableItem['kind'];

/* ------------------------------------------------------------------ */
/* Queue                                                               */
/* ------------------------------------------------------------------ */

export interface QueueEntry {
  id: string;
  addedAt: string;
  notes: string;
  item: PresentableItem;
}

export interface QueueState {
  entries: QueueEntry[];
  /** The queue cursor. Moving the cursor never presents by itself. */
  currentId: string | null;
}

/* ------------------------------------------------------------------ */
/* Lyrics                                                              */
/* ------------------------------------------------------------------ */

export interface LyricsSlide {
  id: string;
  text: string;
}

export interface Song {
  id: string;
  title: string;
  slides: LyricsSlide[];
  createdAt: string;
  updatedAt: string;
}

export type HorizontalAlign = 'left' | 'center' | 'right';
export type VerticalAlign = 'top' | 'middle' | 'bottom';

export interface LyricsStyle {
  fontFamily: string;
  /** Font size in pixels on a 1080-pixel-tall output; scaled to the real output height. */
  fontSize: number;
  fontWeight: number;
  textColor: string;
  backgroundColor: string;
  hAlign: HorizontalAlign;
  vAlign: VerticalAlign;
  lineHeight: number;
  /** Safe margin as a percentage of the output width/height. */
  marginPercent: number;
  backgroundImage: string | null;
  /** Darkening applied over the background image, 0..0.9. */
  backgroundDim: number;
  textShadow: boolean;
  uppercase: boolean;
}

/** A frozen copy of a song's slides taken when lyrics are presented. */
export interface LiveLyrics {
  songId: string;
  title: string;
  slides: string[];
  index: number;
}

/* ------------------------------------------------------------------ */
/* Presentation Output                                                 */
/* ------------------------------------------------------------------ */

export type OutputStatus =
  | 'EMPTY'
  | 'LOADING_IMAGE'
  | 'IMAGE'
  | 'LOADING_VIDEO'
  | 'VIDEO'
  | 'LYRICS'
  | 'ERROR';

export type ImageZoomMode = 'fit' | 'actual' | 'custom';

export interface ImageView {
  mode: ImageZoomMode;
  /** Multiplier relative to the fitted size (mode "custom") */
  scale: number;
  /** Pan offset as a fraction of the viewport, -1..1. */
  panX: number;
  panY: number;
}

export interface VideoPlayback {
  playing: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  ended: boolean;
  /** True when the watch-page fallback is used instead of the embedded player. */
  usingWatchPage: boolean;
}

export interface OutputError {
  message: string;
  detail?: string;
  /** URL that can be opened in the user's normal browser. */
  externalUrl?: string;
  /** For images: a smaller variant that may load where the original failed. */
  thumbnailUrl?: string;
  /** For images: the page the image came from. */
  sourcePageUrl?: string;
  /** For videos: the watch-page fallback has not been tried yet. */
  canTryWatchPage?: boolean;
}

export interface OutputState {
  status: OutputStatus;
  /** Incremented on every present/clear; async results carrying an older token are ignored. */
  token: number;
  item: PresentableItem | null;
  /** The URL actually loaded for an image (may be a thumbnail fallback). */
  imageUrl: string | null;
  imageView: ImageView;
  video: VideoPlayback | null;
  lyrics: LiveLyrics | null;
  error: OutputError | null;
  /** What was live before the last Clear, so the operator can restore it. */
  restorable: { item: PresentableItem; lyrics: LiveLyrics | null } | null;
}

export interface OutputWindowState {
  exists: boolean;
  visible: boolean;
  fullscreen: boolean;
  displayId: number | null;
  displayLabel: string | null;
  /** The preferred display is unavailable and a fallback display is in use. */
  usingFallbackDisplay: boolean;
  /** The output shares the display that hosts the operator window. */
  sharesMainDisplay: boolean;
}

/* ------------------------------------------------------------------ */
/* Displays                                                            */
/* ------------------------------------------------------------------ */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DisplayInfo {
  id: number;
  /** Windows display name, or "Display N" when Windows does not report one (see nameKnown). */
  label: string;
  nameKnown: boolean;
  bounds: Rect;
  workArea: Rect;
  scaleFactor: number;
  rotation: number;
  isPrimary: boolean;
  internal: boolean;
  /** Heuristic: the display name matches a known virtual display driver. */
  likelyVirtual: boolean;
  /** Approximate physical resolution (bounds × scale factor). */
  pixelWidth: number;
  pixelHeight: number;
}

/* ------------------------------------------------------------------ */
/* Research                                                            */
/* ------------------------------------------------------------------ */

export interface ResearchState {
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  error: { code: number; description: string; url: string } | null;
  unresponsive: boolean;
  /** A YouTube video recognised from the current research page. Never presented automatically. */
  detectedVideo: VideoItem | null;
  muted: boolean;
}

/* ------------------------------------------------------------------ */
/* Ad blocking                                                         */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* Bookmarks                                                           */
/* ------------------------------------------------------------------ */

export interface Bookmark {
  id: string;
  title: string;
  url: string;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Snapshot pushed to the operator UI                                  */
/* ------------------------------------------------------------------ */

export interface AppSnapshot {
  settings: Settings;
  research: ResearchState;
  selection: PresentableItem | null;
  preview: PresentableItem | null;
  output: OutputState;
  outputWindow: OutputWindowState;
  queue: QueueState;
  displays: DisplayInfo[];
  adblock: AdblockStatus;
  storageIssues: string[];
  app: { version: string; isPackaged: boolean; dataPath: string };
}

export type NotifyLevel = 'info' | 'success' | 'warning' | 'error';

export interface Notification {
  id: number;
  level: NotifyLevel;
  message: string;
}

/** Result envelope for every invoke-style IPC call. */
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string };
