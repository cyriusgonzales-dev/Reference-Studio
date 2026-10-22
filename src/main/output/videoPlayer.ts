import { WebContentsView, type BrowserWindow, type Session, type WebContents } from 'electron';
import type { VideoItem, VideoPlayback } from '../../shared/types';
import { isYouTubeHost, parseHttpUrl, youtubeEmbedUrl, youtubeWatchUrl } from '../../shared/urls';

/**
 * Plays one YouTube video inside the Presentation Output window.
 *
 * Each presented video gets a fresh, sandboxed WebContentsView (no preload,
 * isolated session) placed over the output page. Replacing or clearing the
 * video closes that WebContents, which guarantees no hidden player keeps
 * running in the background.
 *
 * Playback uses YouTube's official embedded player. The request carries an
 * HTTP Referer identifying this application, as YouTube requires for embeds
 * hosted outside a website. If embedding is refused, the operator can switch
 * to the regular watch page (with the page layout hidden) or open YouTube in
 * their browser.
 */

export const APP_REFERRER = 'https://vmix-reference-studio.app/';

const STATUS_POLL_MS = 500;
const LOAD_TIMEOUT_MS = 25_000;

export type VideoCommand =
  | { command: 'play' | 'pause' | 'toggle' | 'restart' | 'mute' | 'unmute' | 'stop' }
  | { command: 'seek'; value: number }
  | { command: 'seekBy'; value: number }
  | { command: 'volume'; value: number };

export interface VideoCallbacks {
  onReady(token: number): void;
  onStatus(token: number, playback: Partial<VideoPlayback>): void;
  onFailed(token: number, message: string, detail?: string): void;
  onEnded(token: number): void;
  onKey(input: Electron.Input): boolean;
}

interface ProbeResult {
  hasVideo: boolean;
  errorText: string | null;
  playing?: boolean;
  currentTime?: number;
  duration?: number;
  volume?: number;
  muted?: boolean;
  ended?: boolean;
  readyState?: number;
}

/** Runs inside the YouTube page. Reads state only; never modifies the page. */
const PROBE_SCRIPT = `(() => {
  const err = document.querySelector('.ytp-error, .ytp-error-content, yt-playability-error-supported-renderers');
  let errorText = null;
  if (err) {
    const r = err.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) errorText = (err.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 300) || 'Playback error';
  }
  const v = document.querySelector('video');
  if (!v) return { hasVideo: false, errorText };
  return {
    hasVideo: true, errorText,
    playing: !v.paused && !v.ended, currentTime: v.currentTime, duration: isFinite(v.duration) ? v.duration : 0,
    volume: v.volume, muted: v.muted, ended: v.ended, readyState: v.readyState
  };
})()`;

/**
 * CSS for the watch-page fallback: hide the surrounding page (header, comments,
 * recommendations) and let the player fill the output. The player itself,
 * including YouTube's branding and controls, is deliberately left untouched,
 * as YouTube's terms require. For the same reason no CSS is injected into the
 * embedded player; its title and controls auto-hide during playback.
 */
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

export class VideoPlayer {
  private view: WebContentsView | null = null;
  private token = -1;
  private ready = false;
  private ended = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private loadTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly host: BrowserWindow,
    private readonly session: Session,
    private readonly callbacks: VideoCallbacks
  ) {}

  get active(): boolean {
    return this.view !== null;
  }

  get webContents(): WebContents | null {
    return this.view && !this.view.webContents.isDestroyed() ? this.view.webContents : null;
  }

  load(token: number, item: VideoItem, options: { useWatchPage: boolean; showControls: boolean }): void {
    this.destroy();
    this.token = token;
    this.ready = false;
    this.ended = false;

    const view = new WebContentsView({
      webPreferences: {
        session: this.session,
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
    view.setBackgroundColor('#000000');
    this.view = view;
    this.host.contentView.addChildView(view);
    this.fit();

    const wc = view.webContents;
    wc.setAudioMuted(false);
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
      if (input.type === 'keyDown' && this.callbacks.onKey(input)) event.preventDefault();
    });
    wc.on('dom-ready', () => {
      if (options.useWatchPage) void wc.insertCSS(WATCH_PAGE_CSS).catch(() => undefined);
      if (!options.showControls) void wc.insertCSS(HIDE_CURSOR_CSS).catch(() => undefined);
    });
    wc.on('did-fail-load', (_e, code, description, _url, isMainFrame) => {
      if (isMainFrame && code !== -3) this.fail(`The video page could not be loaded (${description || code}).`);
    });
    wc.on('render-process-gone', (_e, details) => {
      if (details.reason !== 'clean-exit') this.fail(`The video player stopped unexpectedly (${details.reason}).`);
    });

    const url = options.useWatchPage
      ? youtubeWatchUrl(item.videoId, item.startSeconds)
      : youtubeEmbedUrl(item.videoId, { controls: options.showControls, ...(item.startSeconds ? { startSeconds: item.startSeconds } : {}) });
    void wc.loadURL(url, { httpReferrer: APP_REFERRER }).catch(() => undefined);

    this.pollTimer = setInterval(() => void this.poll(), STATUS_POLL_MS);
    this.loadTimer = setTimeout(() => {
      if (!this.ready) {
        this.fail(
          'The video did not start within 25 seconds.',
          'YouTube may be slow, blocked by the network, or the ad blocker may be interfering.'
        );
      }
    }, LOAD_TIMEOUT_MS);
  }

  private async poll(): Promise<void> {
    const wc = this.webContents;
    if (!wc) return;
    const token = this.token;
    let probe: ProbeResult;
    try {
      probe = (await wc.executeJavaScript(PROBE_SCRIPT, false)) as ProbeResult;
    } catch {
      return;
    }
    if (token !== this.token || !probe) return;

    if (probe.errorText) {
      this.fail(describeYouTubeError(probe.errorText), probe.errorText);
      return;
    }
    if (!probe.hasVideo) return;

    if (!this.ready && ((probe.readyState ?? 0) >= 2 || probe.playing)) {
      this.ready = true;
      if (this.loadTimer) clearTimeout(this.loadTimer);
      this.callbacks.onReady(token);
    }
    this.callbacks.onStatus(token, {
      playing: probe.playing ?? false,
      currentTime: probe.currentTime ?? 0,
      duration: probe.duration ?? 0,
      volume: probe.volume ?? 1,
      muted: probe.muted ?? false,
      ended: probe.ended ?? false
    });
    if (probe.ended && !this.ended) {
      this.ended = true;
      this.callbacks.onEnded(token);
    } else if (!probe.ended) {
      this.ended = false;
    }
  }

  private fail(message: string, detail?: string): void {
    const token = this.token;
    this.stopTimers();
    this.callbacks.onFailed(token, message, detail);
  }

  async command(cmd: VideoCommand): Promise<void> {
    const wc = this.webContents;
    if (!wc) throw new Error('No video is playing.');
    const script = commandScript(cmd);
    // userGesture=true lets play() succeed even if the page requires activation.
    await wc.executeJavaScript(script, true);
    setTimeout(() => void this.poll(), 80);
  }

  /** Keeps the video view covering the whole output window. */
  fit(): void {
    if (!this.view) return;
    const [width, height] = this.host.getContentSize();
    this.view.setBounds({ x: 0, y: 0, width: width ?? 0, height: height ?? 0 });
  }

  private stopTimers(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.loadTimer) clearTimeout(this.loadTimer);
    this.pollTimer = null;
    this.loadTimer = null;
  }

  /** Stops playback and releases the player. Safe to call repeatedly. */
  destroy(): void {
    this.stopTimers();
    const view = this.view;
    this.view = null;
    this.token = -1;
    if (!view) return;
    try {
      if (!this.host.isDestroyed()) this.host.contentView.removeChildView(view);
    } catch {
      // The host may already be closing.
    }
    if (!view.webContents.isDestroyed()) {
      view.webContents.setAudioMuted(true);
      view.webContents.close();
    }
  }
}

function commandScript(cmd: VideoCommand): string {
  const v = "const v = document.querySelector('video'); if (!v) throw new Error('No video element');";
  switch (cmd.command) {
    case 'play':
      return `(() => { ${v} return v.play().then(() => true); })()`;
    case 'pause':
      return `(() => { ${v} v.pause(); return true; })()`;
    case 'toggle':
      return `(() => { ${v} if (v.paused || v.ended) return v.play().then(() => true); v.pause(); return true; })()`;
    case 'restart':
      return `(() => { ${v} v.currentTime = 0; return v.play().then(() => true); })()`;
    case 'stop':
      return `(() => { ${v} v.pause(); v.currentTime = 0; return true; })()`;
    case 'mute':
      return `(() => { ${v} v.muted = true; return true; })()`;
    case 'unmute':
      return `(() => { ${v} v.muted = false; return true; })()`;
    case 'seek':
      return `(() => { ${v} v.currentTime = Math.min(${Number(cmd.value)}, isFinite(v.duration) ? v.duration : ${Number(cmd.value)}); return true; })()`;
    case 'seekBy':
      return `(() => { ${v} v.currentTime = Math.max(0, v.currentTime + (${Number(cmd.value)})); return true; })()`;
    case 'volume':
      return `(() => { ${v} v.volume = ${Math.min(1, Math.max(0, Number(cmd.value)))}; if (v.volume > 0) v.muted = false; return true; })()`;
  }
}

/** Maps YouTube's on-screen error text to guidance the operator can act on. */
export function describeYouTubeError(text: string): string {
  const t = text.toLowerCase();
  if (/embed|playback on other websites|owner/.test(t)) return 'The owner does not allow this video to be embedded.';
  if (/sign in|age|confirm your age/.test(t)) return 'YouTube requires sign-in or age confirmation for this video.';
  if (/not available in your country|country/.test(t)) return 'This video is not available in your region.';
  if (/private/.test(t)) return 'This video is private.';
  if (/removed|deleted|no longer available|unavailable/.test(t)) return 'This video is unavailable or has been removed.';
  if (/error 15[0-3]|configuration/.test(t)) return 'YouTube refused embedded playback for this video.';
  return 'YouTube reported a playback error.';
}
