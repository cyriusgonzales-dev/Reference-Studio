import { WebContentsView, type BrowserWindow, type Session, type WebContents } from 'electron';
import type { SlaveCommand } from '../../shared/sync';
import type { Rect } from '../../shared/types';
import { isYouTubeHost, parseHttpUrl, youtubeEmbedUrl, youtubeWatchUrl } from '../../shared/urls';

/**
 * One YouTube player inside the main window: a sandboxed WebContentsView (no
 * preload, isolated session) placed over panel 2 or panel 3.
 *
 * Playback uses YouTube's official embedded player. The request carries an
 * HTTP Referer identifying this application, as YouTube requires for embeds
 * outside a website. The player itself (branding, controls) is never altered;
 * in the watch-page fallback only the surrounding page is hidden.
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

/** Watch-page fallback: hide the surrounding page and let the (untouched) player fill the panel. */
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

export interface YouTubeViewOptions {
  /** Operator player: YouTube controls shown. Output player: no controls, no cursor. */
  role: 'player' | 'output';
  /** Whether this player is heard. Only one of the two players plays sound. */
  audible: boolean;
  onKey(input: Electron.Input): boolean;
  onLoadFailed(message: string): void;
}

export class YouTubeView {
  private readonly view: WebContentsView;

  constructor(
    private readonly host: BrowserWindow,
    session: Session,
    private readonly options: YouTubeViewOptions,
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

    const wc = this.view.webContents;
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
      if (options.role === 'output') void wc.insertCSS(HIDE_CURSOR_CSS).catch(() => undefined);
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

  async probe(): Promise<PlayerProbe | null> {
    const wc = this.webContents;
    if (!wc) return null;
    try {
      return (await wc.executeJavaScript(PROBE_SCRIPT, false)) as PlayerProbe;
    } catch {
      return null;
    }
  }

  /** Applies a playback command. userGesture=true lets play() start even without page activation. */
  async run(cmd: SlaveCommand): Promise<void> {
    const wc = this.webContents;
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
