import { WebContentsView, type BrowserWindow, type Session, type WebContents } from 'electron';
import type { ResearchState, VideoItem } from '../../shared/types';
import { videoItemFromUrl } from '../../shared/researchItems';
import { cleanYouTubeTitle, isHttpUrl, parseYouTubeVideo } from '../../shared/urls';
import { buildResearchContextMenu, type ResearchMenuActions } from './contextMenu';

/**
 * The research browser: a sandboxed WebContentsView without a preload script,
 * placed over the research area of the operator window. Remote pages have no
 * access to any application API.
 */

export interface ResearchCallbacks extends ResearchMenuActions {
  onChange(): void;
  /** A keyboard event the app may want to handle; return true to swallow it. */
  onKey(input: Electron.Input): boolean;
}

export class ResearchView {
  private view: WebContentsView | null = null;
  private visible = false;
  private bounds = { x: 0, y: 0, width: 0, height: 0 };
  private lastUrl: string;
  private stateValue: ResearchState;

  constructor(
    private readonly host: BrowserWindow,
    private readonly session: Session,
    homeUrl: string,
    private readonly callbacks: ResearchCallbacks
  ) {
    this.lastUrl = homeUrl;
    this.stateValue = {
      url: homeUrl,
      title: '',
      loading: false,
      canGoBack: false,
      canGoForward: false,
      error: null,
      unresponsive: false,
      detectedVideo: null,
      muted: false
    };
    this.create();
  }

  get state(): ResearchState {
    return this.stateValue;
  }

  get webContents(): WebContents | null {
    return this.view && !this.view.webContents.isDestroyed() ? this.view.webContents : null;
  }

  private create(): void {
    const view = new WebContentsView({
      webPreferences: {
        session: this.session,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
        spellcheck: true,
        safeDialogs: true,
        navigateOnDragDrop: false,
        autoplayPolicy: 'document-user-activation-required'
      }
    });
    view.setBackgroundColor('#0f1115');
    this.view = view;
    this.host.contentView.addChildView(view);
    view.setVisible(this.visible);
    view.setBounds(this.bounds);
    this.wire(view.webContents);
    void view.webContents.loadURL(this.lastUrl).catch(() => undefined);
  }

  private wire(wc: WebContents): void {
    const update = () => this.syncFromWebContents();

    wc.on('did-start-loading', () => {
      this.patch({ loading: true, error: null, unresponsive: false });
    });
    wc.on('did-stop-loading', () => {
      this.patch({ loading: false });
      update();
    });
    wc.on('did-navigate', update);
    wc.on('did-navigate-in-page', (_e, _url, isMainFrame) => {
      if (isMainFrame) update();
    });
    wc.on('page-title-updated', update);
    wc.on('did-fail-load', (_e, code, description, url, isMainFrame) => {
      // -3 is ERR_ABORTED (user navigated away or a download was cancelled).
      if (!isMainFrame || code === -3) return;
      this.patch({ loading: false, error: { code, description: friendlyError(code, description), url } });
    });
    wc.on('unresponsive', () => this.patch({ unresponsive: true }));
    wc.on('responsive', () => this.patch({ unresponsive: false }));
    wc.on('render-process-gone', (_e, details) => {
      if (details.reason === 'clean-exit') return;
      this.patch({ error: { code: 0, description: `The page crashed (${details.reason}). It has been reloaded.`, url: this.lastUrl } });
      this.recreate();
    });

    // Only web pages may be opened in the research view.
    wc.on('will-navigate', (event, url) => {
      if (!isHttpUrl(url)) event.preventDefault();
    });
    wc.on('will-redirect', (event, url) => {
      if (!isHttpUrl(url)) event.preventDefault();
    });

    // Links that would open a new tab open in this view instead; scripted pop-ups are denied.
    wc.setWindowOpenHandler((details) => {
      const userInitiatedTab = details.disposition === 'foreground-tab' || details.disposition === 'background-tab';
      if (userInitiatedTab && isHttpUrl(details.url)) {
        setImmediate(() => this.navigate(details.url));
      }
      return { action: 'deny' };
    });

    wc.on('context-menu', (_e, params) => {
      const menu = buildResearchContextMenu(params, wc, this.callbacks, this.stateValue);
      menu.popup({ window: this.host });
    });

    wc.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return;
      if (this.callbacks.onKey(input)) event.preventDefault();
    });

    // Never let a remote page take the operator window full screen.
    wc.on('enter-html-full-screen', () => {
      if (this.host.isFullScreen()) this.host.setFullScreen(false);
    });
  }

  private recreate(): void {
    const old = this.view;
    this.view = null;
    if (old) {
      this.host.contentView.removeChildView(old);
      if (!old.webContents.isDestroyed()) old.webContents.close();
    }
    this.create();
  }

  private syncFromWebContents(): void {
    const wc = this.webContents;
    if (!wc) return;
    const url = wc.getURL();
    if (url) this.lastUrl = url;
    const title = wc.getTitle();
    const parsed = parseYouTubeVideo(url);
    let detectedVideo: VideoItem | null = null;
    if (parsed) {
      // Keep the id stable while the same video stays open so the UI does not churn.
      const current = this.stateValue.detectedVideo;
      const id = current && current.videoId === parsed.videoId ? current.id : undefined;
      detectedVideo = videoItemFromUrl(url, cleanYouTubeTitle(title), id);
    }
    this.patch({
      url,
      title,
      canGoBack: wc.navigationHistory.canGoBack(),
      canGoForward: wc.navigationHistory.canGoForward(),
      detectedVideo,
      muted: wc.isAudioMuted()
    });
  }

  private patch(partial: Partial<ResearchState>): void {
    this.stateValue = { ...this.stateValue, ...partial };
    this.callbacks.onChange();
  }

  navigate(url: string): void {
    if (!isHttpUrl(url)) return;
    const wc = this.webContents;
    if (!wc) return;
    this.lastUrl = url;
    this.patch({ url, error: null });
    wc.loadURL(url).catch((error: Error & { code?: string }) => {
      // Aborted loads (a newer navigation started) are expected and not shown.
      if (!/ERR_ABORTED/.test(error.message)) {
        this.patch({ loading: false, error: { code: -1, description: friendlyError(-1, error.message), url } });
      }
    });
  }

  command(command: 'back' | 'forward' | 'reload' | 'stop' | 'home', homeUrl: string): void {
    const wc = this.webContents;
    if (!wc) return;
    switch (command) {
      case 'back':
        if (wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
        break;
      case 'forward':
        if (wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
        break;
      case 'reload':
        if (this.stateValue.error) this.navigate(this.stateValue.error.url || this.lastUrl);
        else wc.reload();
        break;
      case 'stop':
        wc.stop();
        break;
      case 'home':
        this.navigate(homeUrl);
        break;
    }
  }

  setBounds(bounds: { x: number; y: number; width: number; height: number }, visible: boolean): void {
    this.bounds = {
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.max(0, Math.round(bounds.width)),
      height: Math.max(0, Math.round(bounds.height))
    };
    this.visible = visible && this.bounds.width > 0 && this.bounds.height > 0;
    if (this.view) {
      this.view.setBounds(this.bounds);
      this.view.setVisible(this.visible);
    }
  }

  focus(): void {
    this.webContents?.focus();
  }

  setMuted(muted: boolean): void {
    const wc = this.webContents;
    if (!wc) return;
    wc.setAudioMuted(muted);
    this.patch({ muted });
  }

  /** Pauses any media playing in the research page (used when a video goes live). */
  pauseMedia(): void {
    const wc = this.webContents;
    if (!wc) return;
    void wc
      .executeJavaScript("document.querySelectorAll('video,audio').forEach(function(m){try{m.pause()}catch(e){}});", false)
      .catch(() => undefined);
  }

  async clearBrowsingData(): Promise<void> {
    await this.session.clearStorageData();
    await this.session.clearCache();
    this.webContents?.reload();
  }

  destroy(): void {
    const view = this.view;
    this.view = null;
    if (!view) return;
    if (!this.host.isDestroyed()) this.host.contentView.removeChildView(view);
    if (!view.webContents.isDestroyed()) view.webContents.close();
  }
}

function friendlyError(code: number, description: string): string {
  const map: Record<number, string> = {
    [-105]: 'The site could not be found. Check the address or your connection.',
    [-106]: 'You appear to be offline.',
    [-102]: 'The connection was refused.',
    [-118]: 'The connection timed out.',
    [-7]: 'The request timed out.',
    [-20]: 'The page was blocked (possibly by the ad blocker). Try disabling blocking temporarily.',
    [-21]: 'The network changed while loading. Try again.',
    [-200]: 'The site’s security certificate is not valid.',
    [-201]: 'The site’s security certificate is not valid.',
    [-202]: 'The site’s security certificate is not trusted.'
  };
  return map[code] ?? `The page could not be loaded (${description || `error ${code}`}).`;
}
