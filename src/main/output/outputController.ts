import { app, BrowserWindow, ipcMain, type IpcMainEvent, type Session } from 'electron';
import type { OutputRenderState } from '../../shared/api';
import { OUTPUT_IMAGE_RESULT_CHANNEL, OUTPUT_READY_CHANNEL, OUTPUT_RENDER_CHANNEL } from '../../shared/outputChannels';
import { chooseOutputDisplay, type DisplayChoice } from '../../shared/displays';
import {
  initialOutputState,
  panView,
  reduceOutput,
  zoomView,
  type OutputEvent,
  type ReduceResult
} from '../../shared/outputMachine';
import { imageResultSchema } from '../../shared/schemas';
import type { Settings } from '../../shared/settings';
import type {
  DisplayInfo,
  ImageItem,
  LiveLyrics,
  LyricsItem,
  OutputState,
  OutputWindowState,
  PresentableItem,
  Rect,
  VideoItem
} from '../../shared/types';
import { isAppPageUrl, preloadPath, rendererPage } from '../paths';
import { lockNavigation } from '../security';
import { VideoPlayer, type VideoCommand } from './videoPlayer';

/**
 * Owns the one Presentation Output: its state machine, its window, its video
 * player and its placement on a display. Every change of live content goes
 * through `dispatch`, so the operator UI and the output window can never
 * disagree about what is live.
 */

export interface OutputHost {
  settings(): Settings;
  displays(): DisplayInfo[];
  mainDisplayId(): number | null;
  onChange(): void;
  onVideoEnded(item: VideoItem): void;
  notify(level: 'info' | 'warning' | 'error', message: string): void;
  onKey(input: Electron.Input, source: 'output'): boolean;
}

export class OutputController {
  private state: OutputState = initialOutputState();
  private win: BrowserWindow | null = null;
  private player: VideoPlayer | null = null;
  private rendererReady = false;
  private quitting = false;
  private placement: DisplayChoice | null = null;
  /**
   * Full screen chosen by the operator during this session. When null the
   * default applies: the saved preference, except that an output sharing the
   * operator's only display opens windowed so the operator UI stays reachable.
   */
  private fullscreenOverride: boolean | null = null;

  constructor(
    private readonly host: OutputHost,
    private readonly mediaSession: Session
  ) {
    app.on('before-quit', () => {
      this.quitting = true;
    });
    ipcMain.on(OUTPUT_READY_CHANNEL, (event) => {
      if (!this.isOutputSender(event)) return;
      this.rendererReady = true;
      this.pushRender();
    });
    ipcMain.on(OUTPUT_IMAGE_RESULT_CHANNEL, (event, payload: unknown) => {
      if (!this.isOutputSender(event)) return;
      const parsed = imageResultSchema.safeParse(payload);
      if (!parsed.success) return;
      const { token, ok, message } = parsed.data;
      this.dispatch(ok ? { type: 'imageLoaded', token } : { type: 'imageFailed', token, message: message ?? 'The image could not be loaded.' });
    });
  }

  /* ---------------------------------------------------------------- */
  /* State                                                             */
  /* ---------------------------------------------------------------- */

  getState(): OutputState {
    return this.state;
  }

  getWindowState(): OutputWindowState {
    const win = this.liveWindow();
    return {
      exists: !!win,
      visible: !!win && win.isVisible() && !win.isMinimized(),
      fullscreen: !!win && win.isFullScreen(),
      displayId: this.placement?.display.id ?? null,
      displayLabel: this.placement?.display.label ?? null,
      usingFallbackDisplay: this.placement?.preferredMissing ?? false,
      sharesMainDisplay: this.placement?.sharesMainDisplay ?? false
    };
  }

  private dispatch(event: OutputEvent): ReduceResult {
    const previous = this.state;
    const result = reduceOutput(previous, event);
    if (!result.accepted) return result;
    this.state = result.state;
    this.applyEffects(previous, this.state);
    this.pushRender();
    this.host.onChange();
    return result;
  }

  /** Derives side effects from a state change: start/stop video, load images (via render push). */
  private applyEffects(previous: OutputState, next: OutputState): void {
    // The player survives only while the same video stays live. Anything else (a new
    // item, clear, or an error) releases it, so no hidden video keeps playing and a
    // failed video leaves a black output rather than a YouTube error page.
    const keepPlayer = (next.status === 'LOADING_VIDEO' || next.status === 'VIDEO') && next.token === previous.token;
    if (!keepPlayer) this.player?.destroy();
    if (next.status === 'LOADING_VIDEO' && next.token !== previous.token && next.item?.kind === 'video') {
      const win = this.ensureWindow();
      this.ensurePlayer(win).load(next.token, next.item, {
        useWatchPage: next.video?.usingWatchPage ?? false,
        showControls: this.host.settings().output.showYouTubeControls
      });
    }
  }

  private renderState(): OutputRenderState {
    const s = this.state;
    const settings = this.host.settings();
    const image =
      (s.status === 'IMAGE' || s.status === 'LOADING_IMAGE') && s.imageUrl
        ? { url: s.imageUrl, view: s.imageView, background: settings.output.imageBackground }
        : null;
    const lyrics =
      s.status === 'LYRICS' && s.lyrics
        ? { text: s.lyrics.slides[s.lyrics.index] ?? '', index: s.lyrics.index, style: settings.lyrics }
        : null;
    return { status: s.status, token: s.token, transitionMs: settings.output.transitionMs, image, lyrics };
  }

  /** Sends the current render state to the output page. Also used when lyrics styling changes. */
  pushRender(): void {
    const win = this.liveWindow();
    if (!win || !this.rendererReady) return;
    win.webContents.send(OUTPUT_RENDER_CHANNEL, this.renderState());
  }

  /* ---------------------------------------------------------------- */
  /* Operator commands                                                 */
  /* ---------------------------------------------------------------- */

  presentImage(item: ImageItem, imageUrl?: string): void {
    this.ensureWindowShown();
    this.dispatch({ type: 'presentImage', item, ...(imageUrl ? { imageUrl } : {}) });
  }

  presentVideo(item: VideoItem, useWatchPage = false): void {
    this.ensureWindowShown();
    this.dispatch({ type: 'presentVideo', item, useWatchPage });
  }

  presentLyrics(item: LyricsItem, lyrics: LiveLyrics): void {
    this.ensureWindowShown();
    const result = this.dispatch({ type: 'presentLyrics', item, lyrics });
    if (!result.accepted) throw new Error('This song has no slides to present.');
  }

  present(item: PresentableItem, lyrics?: LiveLyrics): void {
    switch (item.kind) {
      case 'image':
        return this.presentImage(item);
      case 'video':
        return this.presentVideo(item);
      case 'lyrics':
        if (!lyrics) throw new Error('Lyrics content is missing.');
        return this.presentLyrics(item, lyrics);
    }
  }

  clear(): void {
    this.dispatch({ type: 'clear' });
  }

  restore(): void {
    const result = this.dispatch({ type: 'restore' });
    if (!result.accepted) throw new Error(result.reason === 'output is not empty' ? 'Clear the output first.' : 'There is nothing to restore.');
    this.ensureWindowShown();
  }

  lyricsGoto(index: number): boolean {
    return this.dispatch({ type: 'lyricsGoto', index }).accepted;
  }

  imageCommand(cmd: { command: 'in' | 'out' | 'fit' | 'actual' | 'reset' } | { command: 'pan'; dx: number; dy: number }): void {
    if (this.state.status !== 'IMAGE' && this.state.status !== 'LOADING_IMAGE') throw new Error('No image is live.');
    const view = cmd.command === 'pan' ? panView(this.state.imageView, cmd.dx, cmd.dy) : zoomView(this.state.imageView, cmd.command);
    this.dispatch({ type: 'setImageView', view });
  }

  async videoCommand(cmd: VideoCommand): Promise<void> {
    if (this.state.status !== 'VIDEO' && this.state.status !== 'LOADING_VIDEO') throw new Error('No video is live.');
    if (!this.player?.active) throw new Error('The video player is not running.');
    await this.player.command(cmd);
  }

  /** Recovery actions offered when an item fails to present. */
  fallback(action: 'thumbnail' | 'watchPage' | 'openExternal' | 'sourcePage' | 'retry'): string | null {
    const s = this.state;
    const item = s.item ?? s.restorable?.item ?? null;
    if (!item) throw new Error('There is no item to recover.');
    switch (action) {
      case 'retry':
        this.present(item, s.lyrics ?? undefined);
        return null;
      case 'thumbnail':
        if (item.kind !== 'image' || !s.error?.thumbnailUrl) throw new Error('No thumbnail is available for this image.');
        this.presentImage(item, s.error.thumbnailUrl);
        return null;
      case 'watchPage':
        if (item.kind !== 'video') throw new Error('The watch page fallback is only for videos.');
        this.presentVideo(item, true);
        return null;
      case 'openExternal':
        return s.error?.externalUrl ?? (item.kind === 'video' ? item.sourceUrl : item.kind === 'image' ? (item.sourcePageUrl ?? item.imageUrl) : null);
      case 'sourcePage':
        return item.kind === 'image' ? (item.sourcePageUrl ?? null) : item.kind === 'video' ? item.sourceUrl : null;
    }
  }

  /* ---------------------------------------------------------------- */
  /* Window management                                                 */
  /* ---------------------------------------------------------------- */

  windowCommand(command: 'open' | 'show' | 'hide' | 'toggleVisible' | 'toggleFullscreen' | 'focus' | 'reload'): void {
    switch (command) {
      case 'open':
        this.ensureWindow();
        this.place();
        this.showWindow();
        break;
      case 'show':
        this.ensureWindow();
        this.showWindow();
        break;
      case 'hide':
        // Hiding keeps the content (and any playing video) running.
        this.liveWindow()?.hide();
        break;
      case 'toggleVisible': {
        const win = this.liveWindow();
        if (win?.isVisible()) win.hide();
        else {
          this.ensureWindow();
          this.showWindow();
        }
        break;
      }
      case 'toggleFullscreen':
        this.fullscreenOverride = !this.liveWindow()?.isFullScreen();
        this.ensureWindow();
        this.place();
        this.showWindow();
        break;
      case 'focus':
        this.ensureWindow();
        this.showWindow();
        this.liveWindow()?.focus();
        break;
      case 'reload':
        this.liveWindow()?.webContents.reload();
        break;
    }
    this.host.onChange();
  }

  exitFullscreen(): void {
    const win = this.liveWindow();
    if (!win?.isFullScreen()) return;
    this.fullscreenOverride = false;
    this.place();
    this.host.onChange();
  }

  /**
   * Called when monitors change. Windows also reports trivial changes (for
   * example the taskbar auto-hiding), so the output is only repositioned when
   * its target display or that display's geometry actually changed; otherwise
   * a live show would flicker out of and back into full screen.
   */
  onDisplaysChanged(): void {
    const win = this.liveWindow();
    if (!win) return;
    const before = this.placement;
    const next = this.chooseDisplay();
    if (before && next && !displayMoved(before.display, next.display)) {
      this.placement = next;
      this.host.onChange();
      return;
    }
    this.place();
    const after = this.placement;
    if (before && after && before.display.id !== after.display.id) {
      this.host.notify(
        after.preferredMissing ? 'warning' : 'info',
        after.preferredMissing
          ? `The output display is unavailable; the Presentation Output moved to "${after.display.label}".`
          : `The Presentation Output moved to "${after.display.label}".`
      );
    }
    this.host.onChange();
  }

  /** Moves the output to the operator's chosen display (already saved in settings). */
  moveToPreferredDisplay(): void {
    this.fullscreenOverride = null;
    if (this.liveWindow()) this.place();
    this.host.onChange();
  }

  private ensureWindowShown(): void {
    const existed = !!this.liveWindow();
    this.ensureWindow();
    if (!existed) this.place();
    const win = this.liveWindow();
    if (win && !win.isVisible()) this.showWindow();
  }

  private showWindow(): void {
    const win = this.liveWindow();
    if (!win) return;
    if (win.isMinimized()) win.restore();
    // Never steal keyboard focus from the operator window.
    win.showInactive();
  }

  private liveWindow(): BrowserWindow | null {
    return this.win && !this.win.isDestroyed() ? this.win : null;
  }

  private ensurePlayer(win: BrowserWindow): VideoPlayer {
    if (!this.player) {
      this.player = new VideoPlayer(win, this.mediaSession, {
        onReady: (token) => this.dispatch({ type: 'videoReady', token }),
        onStatus: (token, playback) => {
          const result = reduceOutput(this.state, { type: 'videoStatus', token, playback });
          if (!result.accepted) return;
          const changed = JSON.stringify(result.state.video) !== JSON.stringify(this.state.video);
          this.state = result.state;
          if (changed) this.host.onChange();
        },
        onFailed: (token, message, detail) =>
          this.dispatch({ type: 'videoFailed', token, message, ...(detail ? { detail } : {}) }),
        onEnded: (token) => {
          if (token === this.state.token && this.state.item?.kind === 'video') this.host.onVideoEnded(this.state.item);
        },
        onKey: (input) => this.host.onKey(input, 'output')
      });
    }
    return this.player;
  }

  private ensureWindow(): BrowserWindow {
    const existing = this.liveWindow();
    if (existing) return existing;

    this.rendererReady = false;
    const win = new BrowserWindow({
      show: false,
      frame: false,
      title: 'VRS Presentation Output',
      backgroundColor: '#000000',
      autoHideMenuBar: true,
      fullscreenable: true,
      resizable: true,
      minWidth: 320,
      minHeight: 180,
      webPreferences: {
        preload: preloadPath('output'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        // Keep painting while covered or unfocused so vMix capture never freezes.
        backgroundThrottling: false,
        spellcheck: false,
        devTools: !app.isPackaged
      }
    });
    win.setMenu(null);
    this.win = win;
    this.player = null;

    lockNavigation(win.webContents, (url) => isAppPageUrl(url, 'output'));
    win.webContents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown' && this.host.onKey(input, 'output')) event.preventDefault();
    });

    // Closing the output (e.g. Alt+F4) hides it instead, so live content survives.
    win.on('close', (event) => {
      if (!this.quitting) {
        event.preventDefault();
        win.hide();
        this.host.onChange();
      }
    });
    win.on('closed', () => {
      this.player?.destroy();
      this.player = null;
      if (this.win === win) this.win = null;
      this.host.onChange();
    });
    for (const evt of ['show', 'hide', 'minimize', 'restore', 'enter-full-screen', 'leave-full-screen'] as const) {
      win.on(evt as 'show', () => this.host.onChange());
    }
    win.on('resize', () => this.player?.fit());
    win.webContents.on('render-process-gone', (_e, details) => {
      if (details.reason === 'clean-exit' || this.quitting) return;
      this.rendererReady = false;
      this.host.notify('warning', `The output page stopped (${details.reason}) and is being reloaded. Live content will be restored.`);
      setTimeout(() => {
        if (!win.isDestroyed()) win.webContents.reload();
      }, 300);
    });

    const page = rendererPage('output');
    if (page.kind === 'url') void win.loadURL(page.url);
    else void win.loadFile(page.file);
    return win;
  }

  private chooseDisplay(): DisplayChoice | null {
    const settings = this.host.settings().output;
    return chooseOutputDisplay(
      this.host.displays(),
      { displayId: settings.displayId, displayLabel: settings.displayLabel },
      this.host.mainDisplayId()
    );
  }

  /** Positions the window on the chosen display, full screen or windowed. */
  private place(): void {
    const win = this.liveWindow();
    if (!win) return;
    const settings = this.host.settings().output;
    const choice = this.chooseDisplay();
    if (!choice) return;
    this.placement = choice;
    const display = choice.display;
    const fullscreen = this.fullscreenOverride ?? (settings.fullscreen && !choice.sharesMainDisplay);

    if (win.isFullScreen()) win.setFullScreen(false);
    if (fullscreen) {
      win.setBounds(display.bounds);
      win.setFullScreen(true);
    } else {
      win.setBounds(windowedBounds(display.workArea));
    }
    this.player?.fit();
  }

  private isOutputSender(event: IpcMainEvent): boolean {
    const win = this.liveWindow();
    return !!win && event.sender === win.webContents && !!event.senderFrame && isAppPageUrl(event.senderFrame.url, 'output');
  }

  destroy(): void {
    this.quitting = true;
    this.player?.destroy();
    const win = this.liveWindow();
    if (win) win.destroy();
  }
}

function displayMoved(a: DisplayInfo, b: DisplayInfo): boolean {
  return (
    a.id !== b.id ||
    a.scaleFactor !== b.scaleFactor ||
    a.bounds.x !== b.bounds.x ||
    a.bounds.y !== b.bounds.y ||
    a.bounds.width !== b.bounds.width ||
    a.bounds.height !== b.bounds.height
  );
}

function windowedBounds(area: Rect): Rect {
  const width = Math.max(640, Math.round(area.width * 0.5));
  const height = Math.round((width * 9) / 16);
  return {
    x: Math.round(area.x + (area.width - width) / 2),
    y: Math.round(area.y + (area.height - height) / 2),
    width,
    height
  };
}
