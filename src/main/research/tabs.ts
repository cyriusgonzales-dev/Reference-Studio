import { WebContentsView, type BrowserWindow, type Session, type WebContents } from 'electron';
import { HOME_URLS } from '../../shared/settings';
import { TAB_IDS, type Rect, type TabId, type TabState } from '../../shared/types';
import { hostnameOf, isHttpUrl, looksLikeUrl, parseYouTubeVideo, resolveAddressInput } from '../../shared/urls';
import { researchQuery } from '../../shared/research';
import { buildResearchContextMenu, type ResearchMenuActions } from './contextMenu';

/**
 * Panel 1: four independent browser tabs (Images, YouTube, Lyrics, Research). Each is a
 * sandboxed WebContentsView with its own navigation history; switching tabs
 * only changes which one is visible, so every tab keeps its page and history.
 * Remote pages get no application API; the research preload only reports
 * genuine clicks and text selections.
 */

export interface TabCallbacks extends ResearchMenuActions {
  onChange(): void;
  /** Keyboard input inside a tab; return true to swallow it. */
  onKey(input: Electron.Input): boolean;
  /** The YouTube tab navigated to a video page anyway (typed URL, keyboard, etc.). */
  onVideoNavigation(url: string, title: string): void;
}

/** After a pick in the Images tab, navigations to other sites are blocked for this long (ms). */
const PICK_NAVIGATION_GUARD_MS = 1500;

const isGoogleUrl = (url: string) => /(^|\.)google\.[a-z.]+$/i.test(hostnameOf(url));

export class ResearchTabs {
  private readonly views = new Map<TabId, WebContentsView>();
  private readonly states = new Map<TabId, TabState>();
  private activeTab: TabId;
  private bounds: Rect = { x: 0, y: 0, width: 0, height: 0 };
  private lastPickAt = 0;
  /** Searches waiting for a Google tab to be opened (see searchAll). */
  private readonly pendingSearch = new Map<TabId, string>();

  constructor(
    private readonly host: BrowserWindow,
    private readonly session: Session,
    initialUrls: Record<TabId, string>,
    active: TabId,
    private readonly callbacks: TabCallbacks
  ) {
    this.activeTab = active;
    for (const tab of TAB_IDS) this.create(tab, initialUrls[tab]);
    this.layout();
  }

  get active(): TabId {
    return this.activeTab;
  }

  allStates(): Record<TabId, TabState> {
    return Object.fromEntries(TAB_IDS.map((t) => [t, this.state(t)])) as Record<TabId, TabState>;
  }

  state(tab: TabId): TabState {
    return this.states.get(tab) ?? { url: '', title: '', loading: false, canGoBack: false, canGoForward: false, error: null };
  }

  /** Which tab a WebContents belongs to, or null if it is not a research tab. */
  tabOf(contents: WebContents): TabId | null {
    for (const [tab, view] of this.views) if (view.webContents === contents) return tab;
    return null;
  }

  webContents(tab: TabId): WebContents | null {
    const view = this.views.get(tab);
    return view && !view.webContents.isDestroyed() ? view.webContents : null;
  }

  /** Records that the operator just picked something, to keep the Images results page in place. */
  notePick(): void {
    this.lastPickAt = Date.now();
  }

  private create(tab: TabId, url: string): void {
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
    this.views.set(tab, view);
    this.states.set(tab, { url, title: '', loading: true, canGoBack: false, canGoForward: false, error: null });
    this.host.contentView.addChildView(view);
    this.wire(tab, view.webContents);
    void view.webContents.loadURL(isHttpUrl(url) ? url : HOME_URLS[tab]).catch(() => undefined);
  }

  private patch(tab: TabId, partial: Partial<TabState>): void {
    this.states.set(tab, { ...this.state(tab), ...partial });
    this.callbacks.onChange();
  }

  /** Refreshes a tab's state; `navigated` is true only for real navigations (not title or load events). */
  private sync(tab: TabId, navigated = false): void {
    const wc = this.webContents(tab);
    if (!wc) return;
    const url = wc.getURL();
    this.patch(tab, {
      url,
      title: wc.getTitle(),
      canGoBack: wc.navigationHistory.canGoBack(),
      canGoForward: wc.navigationHistory.canGoForward()
    });
    // The YouTube tab stays on search results: a video page that opens anyway is sent to panel 2 and the tab steps back.
    if (navigated && tab === 'youtube' && parseYouTubeVideo(url)) {
      this.callbacks.onVideoNavigation(url, wc.getTitle());
      if (wc.navigationHistory.canGoBack()) setTimeout(() => wc.navigationHistory.goBack(), 50);
    }
  }

  private wire(tab: TabId, wc: WebContents): void {
    // Ad-block page scripts wait for loading to finish; busy pages queue many such waits.
    wc.setMaxListeners(50);
    wc.on('did-start-loading', () => this.patch(tab, { loading: true, error: null }));
    wc.on('did-stop-loading', () => {
      this.patch(tab, { loading: false });
      this.sync(tab);
    });
    wc.on('did-navigate', () => this.sync(tab, true));
    wc.on('did-navigate-in-page', (_e, _url, isMainFrame) => {
      if (isMainFrame) this.sync(tab, true);
    });
    wc.on('page-title-updated', () => this.sync(tab));
    wc.on('did-fail-load', (_e, code, description, _url, isMainFrame) => {
      // -3 (ERR_ABORTED) is a navigation that was replaced or cancelled on purpose.
      if (isMainFrame && code !== -3) this.patch(tab, { loading: false, error: friendlyError(code, description) });
    });
    wc.on('render-process-gone', (_e, details) => {
      if (details.reason === 'clean-exit') return;
      this.patch(tab, { error: `The page crashed (${details.reason}). Reloading…` });
      setTimeout(() => {
        if (!wc.isDestroyed()) wc.reload();
      }, 300);
    });

    const guard = (event: Electron.Event, url: string) => {
      if (!isHttpUrl(url)) {
        event.preventDefault();
        return;
      }
      // Clicking an image must not take the Images tab away from its results.
      if (tab === 'images' && Date.now() - this.lastPickAt < PICK_NAVIGATION_GUARD_MS && !isGoogleUrl(url)) event.preventDefault();
    };
    wc.on('will-navigate', guard);
    wc.on('will-redirect', (event, url) => {
      if (!isHttpUrl(url)) event.preventDefault();
    });

    // Links that would open a new tab open in this tab instead; scripted pop-ups are denied.
    wc.setWindowOpenHandler((details) => {
      const userTab = details.disposition === 'foreground-tab' || details.disposition === 'background-tab';
      const justPicked = tab === 'images' && Date.now() - this.lastPickAt < PICK_NAVIGATION_GUARD_MS;
      if (userTab && isHttpUrl(details.url) && !justPicked) setImmediate(() => this.navigate(tab, details.url));
      return { action: 'deny' };
    });

    wc.on('context-menu', (_e, params) => {
      buildResearchContextMenu(params, wc, this.callbacks, tab === 'research').popup({ window: this.host });
    });
    wc.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown' && this.callbacks.onKey(input)) event.preventDefault();
    });
    // A page must never take the whole window full screen.
    wc.on('enter-html-full-screen', () => {
      void wc.executeJavaScript('document.exitFullscreen && document.exitFullscreen()', true).catch(() => undefined);
    });
  }

  select(tab: TabId): void {
    this.activeTab = tab;
    this.layout();
    this.callbacks.onChange();
    const pending = this.pendingSearch.get(tab);
    if (pending !== undefined) this.navigateInput(tab, pending);
  }

  setBounds(rect: Rect): void {
    this.bounds = {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.max(0, Math.round(rect.width)),
      height: Math.max(0, Math.round(rect.height))
    };
    this.layout();
  }

  private layout(): void {
    for (const [tab, view] of this.views) {
      const visible = tab === this.activeTab && this.bounds.width > 0 && this.bounds.height > 0;
      view.setBounds(this.bounds);
      view.setVisible(visible);
    }
  }

  /**
   * Runs typed search terms in every tab at once (Google Images, YouTube, Google lyrics, Google).
   * A typed web address opens only in the tab it was typed in.
   */
  searchAll(tab: TabId, input: string): void {
    if (looksLikeUrl(input.trim())) {
      this.navigateInput(tab, input);
      return;
    }
    // The tab the operator typed in goes first so its errors are the ones reported.
    this.navigateInput(tab, input);
    for (const other of TAB_IDS) {
      if (other === tab) continue;
      // Several Google searches at the same moment trigger Google's "unusual traffic" check,
      // so the other Google tabs run the search when the operator opens them.
      if (other === 'youtube') this.navigateInput(other, input);
      else this.pendingSearch.set(other, input);
    }
  }

  /** Turns typed text into a URL for the tab: a search on Google Images, YouTube or Google (lyrics and research). */
  navigateInput(tab: TabId, input: string): void {
    let text = input.trim();
    // "song lyrics" makes Google put the lyrics box first instead of videos or news.
    if (tab === 'lyrics' && text && !/lyrics/i.test(text) && !looksLikeUrl(text)) {
      text = `${text} song lyrics`;
    }
    if (tab === 'research') text = researchQuery(text);
    // Research uses Google's "Web" filter so the results are only web pages to read and highlight.
    const mode = tab === 'images' ? 'images' : tab === 'youtube' ? 'youtube' : tab === 'research' ? 'pages' : 'web';
    const url = resolveAddressInput(text, mode, 'google');
    if (!url) throw new Error('That address cannot be opened. Only web (http/https) addresses are allowed.');
    this.navigate(tab, url);
  }

  navigate(tab: TabId, url: string): void {
    const wc = this.webContents(tab);
    if (!wc || !isHttpUrl(url)) return;
    // Any navigation of the tab replaces a search waiting for it.
    this.pendingSearch.delete(tab);
    this.patch(tab, { url, error: null });
    wc.loadURL(url).catch((error: Error) => {
      if (!/ERR_ABORTED/.test(error.message)) this.patch(tab, { loading: false, error: friendlyError(-1, error.message) });
    });
  }

  command(tab: TabId, command: 'back' | 'forward' | 'reload' | 'stop' | 'home'): void {
    const wc = this.webContents(tab);
    if (!wc) return;
    switch (command) {
      case 'back':
        if (wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
        break;
      case 'forward':
        if (wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
        break;
      case 'reload':
        if (this.state(tab).error) this.navigate(tab, this.state(tab).url || HOME_URLS[tab]);
        else wc.reload();
        break;
      case 'stop':
        wc.stop();
        break;
      case 'home':
        this.navigate(tab, HOME_URLS[tab]);
        break;
    }
  }

  destroy(): void {
    for (const view of this.views.values()) {
      if (!this.host.isDestroyed()) this.host.contentView.removeChildView(view);
      if (!view.webContents.isDestroyed()) view.webContents.close();
    }
    this.views.clear();
  }
}

function friendlyError(code: number, description: string): string {
  const map: Record<number, string> = {
    [-105]: 'The site could not be found. Check the address or your connection.',
    [-106]: 'You appear to be offline.',
    [-102]: 'The connection was refused.',
    [-118]: 'The connection timed out.',
    [-20]: 'The page was blocked (possibly by the ad blocker). Try turning ad blocking off.',
    [-21]: 'The network changed while loading. Try again.',
    [-200]: 'The site’s security certificate is not valid.',
    [-202]: 'The site’s security certificate is not trusted.'
  };
  return map[code] ?? `The page could not be loaded (${description || `error ${code}`}).`;
}
