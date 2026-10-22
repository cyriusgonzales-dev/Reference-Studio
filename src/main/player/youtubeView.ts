import { BrowserWindow, WebContentsView, type Session, type WebContents } from 'electron';
import type { SlaveCommand } from '../../shared/sync';
import type { Rect } from '../../shared/types';
import { isYouTubeHost, parseHttpUrl, youtubeEmbedUrl, youtubeWatchUrl } from '../../shared/urls';

/**
 * YouTube players. Panel 2 is a sandboxed WebContentsView over the panel in
 * the main window; the output player is an offscreen window whose frames go
 * to NDI and to the panel 3 preview. Neither has access to any app API.
 *
 * Playback uses YouTube's official embedded player. The request carries an
 * HTTP Referer identifying this application, as YouTube requires for embeds
 * outside a website. The operator player (panel 2) is never altered; in the
 * watch-page fallback only the surrounding page is hidden. The output copy is
 * reduced to the video picture; see VIDEO_ONLY_CSS.
 */

export const APP_REFERRER = 'https://vmix-reference-studio.app/';

export interface PlayerProbe {
  hasVideo: boolean;
  errorText: string | null;
  paused: boolean;
  ended: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  playbackRate: number;
  readyState: number;
}

/** Runs inside the YouTube page. Reads state only. */
const PROBE_SCRIPT = `(() => {
  const err = document.querySelector('.ytp-error, .ytp-error-content, yt-playability-error-supported-renderers');
  let errorText = null;
  if (err) {
    const r = err.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) errorText = (err.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 300) || 'Playback error';
  }
  const v = document.querySelector('video.html5-main-video') || document.querySelector('video');
  if (!v) return { hasVideo: false, errorText, paused: true, ended: false, currentTime: 0, duration: 0, volume: 1, muted: false, playbackRate: 1, readyState: 0 };
  return {
    hasVideo: true, errorText, paused: v.paused, ended: v.ended, currentTime: v.currentTime,
    duration: isFinite(v.duration) ? v.duration : 0, volume: v.volume, muted: v.muted,
    playbackRate: v.playbackRate, readyState: v.readyState
  };
})()`;

/** Watch-page fallback: hide the surrounding page and let the player fill the panel. */
const WATCH_PAGE_CSS = `
html, body, ytd-app { background: #000 !important; overflow: hidden !important; }
#masthead-container, #secondary, #below, #comments, #related, ytd-watch-metadata, tp-yt-app-drawer,
ytd-mini-guide-renderer, #guide, ytd-popup-container, #chat, ytd-merch-shelf-renderer { display: none !important; }
#movie_player, .html5-video-player {
  position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100vh !important;
  z-index: 2147483646 !important; background: #000 !important;
}
#movie_player video.html5-main-video { width: 100vw !important; height: 100vh !important; left: 0 !important; top: 0 !important; object-fit: contain !important; }
`;

const HIDE_CURSOR_CSS = `*, *::before, *::after { cursor: none !important; }`;

/**
 * The output player shows only the video picture. Everything on the page is
 * made invisible and only <video> is made visible again (visibility can be
 * re-enabled on a child of a hidden element), so the title bar, controls,
 * play/pause indicator, "More videos", captions, end screen, spinner and
 * branding never appear, whatever layout or class names YouTube uses. Layout
 * is unaffected, so the video keeps its size and position.
 *
 * Note: YouTube's embed terms ask that player controls and branding stay
 * visible; this is applied at the operator's request and only to the output
 * copy. Panel 2 keeps the full player.
 */
const VIDEO_ONLY_CSS = `
html, body { background: #000 !important; }
body * { visibility: hidden !important; }
video { visibility: visible !important; }
`;

export interface YouTubePlayerOptions {
  /** Operator player (panel 2): YouTube controls shown. Output player: video picture only. */
  role: 'player' | 'output';
  /** Whether this player is heard. Only one of the two players plays sound. */
  audible: boolean;
  onKey(input: Electron.Input): boolean;
  onLoadFailed(message: string): void;
}

/** Common interface of the on-screen and offscreen players. */
export interface YouTubePlayer {
  readonly webContents: WebContents | null;
  probe(): Promise<PlayerProbe | null>;
  run(cmd: SlaveCommand): Promise<void>;
  destroy(): void;
}

/** Attaches navigation limits, styling and error handling, then loads the video. */
function prepare(wc: WebContents, options: YouTubePlayerOptions, videoId: string, startSeconds: number, mode: 'embed' | 'watch'): void {
  wc.setAudioMuted(!options.audible);
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  const allowed = (url: string) => {
    const parsed = parseHttpUrl(url);
    return !!parsed && (isYouTubeHost(parsed.hostname) || /(^|\.)google\.com$/i.test(parsed.hostname));
  };
  wc.on('will-navigate', (event, url) => {
    if (!allowed(url)) event.preventDefault();
  });
  wc.on('will-redirect', (event, url) => {
    if (!allowed(url)) event.preventDefault();
  });
  wc.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && options.onKey(input)) event.preventDefault();
  });
  wc.on('dom-ready', () => {
    if (mode === 'watch') void wc.insertCSS(WATCH_PAGE_CSS).catch(() => undefined);
    if (options.role === 'output') {
      void wc.insertCSS(HIDE_CURSOR_CSS).catch(() => undefined);
      void wc.insertCSS(VIDEO_ONLY_CSS).catch(() => undefined);
    }
  });
  // Keep video inside its panel: a full-screen request would take over the whole window.
  wc.on('enter-html-full-screen', () => {
    void wc.executeJavaScript('document.exitFullscreen && document.exitFullscreen()', true).catch(() => undefined);
  });
  wc.on('did-fail-load', (_e, code, description, _url, isMainFrame) => {
    if (isMainFrame && code !== -3) options.onLoadFailed(`The video page could not be loaded (${description || code}).`);
  });
  wc.on('render-process-gone', (_e, details) => {
    if (details.reason !== 'clean-exit') options.onLoadFailed(`The video player stopped unexpectedly (${details.reason}).`);
  });

  const controls = options.role === 'player';
  const url =
    mode === 'watch'
      ? youtubeWatchUrl(videoId, startSeconds)
      : youtubeEmbedUrl(videoId, { controls, ...(startSeconds > 0 ? { startSeconds } : {}) });
  void wc.loadURL(url, { httpReferrer: APP_REFERRER }).catch(() => undefined);
}

async function probe(wc: WebContents | null): Promise<PlayerProbe | null> {
  if (!wc) return null;
  try {
    return (await wc.executeJavaScript(PROBE_SCRIPT, false)) as PlayerProbe;
  } catch {
    return null;
  }
}

/** Applies a playback command. userGesture=true lets play() start even without page activation. */
async function run(wc: WebContents | null, cmd: SlaveCommand): Promise<void> {
  if (!wc) return;
  const v = "const v = document.querySelector('video.html5-main-video') || document.querySelector('video'); if (!v) return false;";
  let body: string;
  switch (cmd.command) {
    case 'play':
      body = 'v.play().catch(() => {});';
      break;
    case 'pause':
      body = 'v.pause();';
      break;
    case 'seek':
      body = `v.currentTime = ${Math.max(0, Number(cmd.value))};`;
      break;
    case 'volume':
      body = `v.volume = ${Math.min(1, Math.max(0, Number(cmd.value)))}; v.muted = ${cmd.muted ? 'true' : 'false'};`;
      break;
    case 'rate':
      body = `v.playbackRate = ${Math.min(4, Math.max(0.25, Number(cmd.value)))};`;
      break;
  }
  try {
    await wc.executeJavaScript(`(() => { ${v} ${body} return true; })()`, true);
  } catch {
    // The page may be navigating; the next sync tick retries.
  }
}

/** Panel 2: the operator's player, a view placed over the panel in the main window. */
export class YouTubeView implements YouTubePlayer {
  private readonly view: WebContentsView;

  constructor(
    private readonly host: BrowserWindow,
    session: Session,
    options: YouTubePlayerOptions,
    videoId: string,
    startSeconds: number,
    mode: 'embed' | 'watch',
    bounds: Rect
  ) {
    this.view = new WebContentsView({
      webPreferences: {
        session,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        backgroundThrottling: false,
        autoplayPolicy: 'no-user-gesture-required',
        spellcheck: false,
        navigateOnDragDrop: false
      }
    });
    this.view.setBackgroundColor('#000000');
    host.contentView.addChildView(this.view);
    this.setBounds(bounds);
    prepare(this.view.webContents, options, videoId, startSeconds, mode);
  }

  get webContents(): WebContents | null {
    return this.view.webContents.isDestroyed() ? null : this.view.webContents;
  }

  setBounds(rect: Rect): void {
    const r = {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.max(0, Math.round(rect.width)),
      height: Math.max(0, Math.round(rect.height))
    };
    this.view.setBounds(r);
    this.view.setVisible(r.width > 0 && r.height > 0);
  }

  probe(): Promise<PlayerProbe | null> {
    return probe(this.webContents);
  }

  run(cmd: SlaveCommand): Promise<void> {
    return run(this.webContents, cmd);
  }

  destroy(): void {
    try {
      if (!this.host.isDestroyed()) this.host.contentView.removeChildView(this.view);
    } catch {
      // The window may already be closing.
    }
    if (!this.view.webContents.isDestroyed()) {
      this.view.webContents.setAudioMuted(true);
      this.view.webContents.close();
    }
  }
}

/**
 * The output player, rendered offscreen at the NDI frame size. Its frames go
 * to NDI and to the panel 3 preview; its audio is captured by the audio
 * preload and sent over NDI too.
 */
export class OffscreenYouTube implements YouTubePlayer {
  readonly window: BrowserWindow;

  constructor(
    session: Session,
    options: YouTubePlayerOptions,
    videoId: string,
    startSeconds: number,
    mode: 'embed' | 'watch',
    layout: { width: number; height: number; scale: number },
    audioPreload: string
  ) {
    this.window = new BrowserWindow({
      show: false,
      frame: false,
      width: layout.width,
      height: layout.height,
      useContentSize: true,
      backgroundColor: '#000000',
      webPreferences: {
        offscreen: { deviceScaleFactor: layout.scale },
        session,
        preload: audioPreload,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        backgroundThrottling: false,
        autoplayPolicy: 'no-user-gesture-required',
        spellcheck: false
      }
    });
    this.window.webContents.setFrameRate(30);
    prepare(this.window.webContents, options, videoId, startSeconds, mode);
  }

  get webContents(): WebContents | null {
    return this.window.isDestroyed() || this.window.webContents.isDestroyed() ? null : this.window.webContents;
  }

  probe(): Promise<PlayerProbe | null> {
    return probe(this.webContents);
  }

  run(cmd: SlaveCommand): Promise<void> {
    return run(this.webContents, cmd);
  }

  destroy(): void {
    if (this.window.isDestroyed()) return;
    this.window.webContents.setAudioMuted(true);
    this.window.destroy();
  }
}

/** Maps YouTube's on-screen error text to guidance the operator can act on. */
export function describeYouTubeError(text: string): string {
  const t = text.toLowerCase();
  if (/embed|playback on other websites|owner/.test(t)) return 'The owner does not allow this video to be played outside YouTube.';
  if (/sign in|age|confirm your age|bot/.test(t)) return 'YouTube requires sign-in or age confirmation for this video.';
  if (/country/.test(t)) return 'This video is not available in your region.';
  if (/private/.test(t)) return 'This video is private.';
  if (/removed|deleted|no longer available|unavailable/.test(t)) return 'This video is unavailable or has been removed.';
  return 'YouTube reported a playback error.';
}
