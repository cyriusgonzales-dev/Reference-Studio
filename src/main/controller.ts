import path from 'node:path';
import { app, ipcMain, screen, shell, type BrowserWindow, type IpcMainEvent, type Session } from 'electron';
import type { EventPayloads } from '../shared/api';
import { isLyricsSelection, lyricsToSlides, titleFromSearchPage } from '../shared/lyrics';
import { resolveImagePick, resolveVideoLink } from '../shared/researchItems';
import { formatSourceLine, researchToSlides, resolveResearchSource, type ResearchPageInfo } from '../shared/research';
import { RESEARCH_COLLECT_CHANNEL, RESEARCH_PICK_CHANNEL, RESEARCH_ROLE_CHANNEL } from '../shared/researchChannels';
import { researchPickSchema, type ResearchPick } from '../shared/schemas';
import type { OutputPageState } from '../shared/outputPage';
import { defaultSettings, lyricsStyleFor, parseSettings, type Settings } from '../shared/settings';
import type { AppSnapshot, CaptureInfo, NotifyLevel, Rect, TabId } from '../shared/types';
import { AdblockManager } from './adblock';
import { adblockCacheDirectory, dataDirectory, isDev } from './paths';
import { NdiSender } from './ndi/ndiSender';
import { OffscreenOutput } from './output/offscreenOutput';
import { ProgramController } from './player/programController';
import { ResearchTabs } from './research/tabs';
import { JsonStore } from './store/jsonStore';

/**
 * The application's single source of truth in the main process. It owns the
 * four search tabs, the program shown in panels 2 and 3, and the settings,
 * and pushes one snapshot to the operator UI whenever anything changes.
 */
export class Controller {
  private readonly settingsStore: JsonStore<Settings>;
  private settings: Settings;
  private broadcastPending = false;
  private tabSaveTimer: NodeJS.Timeout | null = null;

  readonly tabs: ResearchTabs;
  readonly program: ProgramController;
  readonly adblock: AdblockManager;
  readonly ndi: NdiSender;
  readonly output: OffscreenOutput;
  private outputPageKey = '';

  constructor(
    private readonly window: BrowserWindow,
    sessions: { research: Session; media: Session }
  ) {
    this.settingsStore = new JsonStore<Settings>({
      file: path.join(dataDirectory(), 'settings.json'),
      label: 'Settings',
      parse: (raw) => ({ data: parseSettings(raw), warnings: [] }),
      defaults: defaultSettings
    });
    const report = this.settingsStore.load();
    for (const issue of report.issues) console.warn(`[settings] ${issue}`);
    this.settings = report.data;

    this.tabs = new ResearchTabs(window, sessions.research, this.settings.tabUrls, this.settings.activeTab, {
      onChange: () => {
        this.scheduleBroadcast();
        this.scheduleTabSave();
      },
      onKey: (input) => this.handleKey(input, 'web'),
      onVideoNavigation: (url, title) => this.showVideo(url, title.replace(/\s*-\s*YouTube\s*$/i, '')),
      showImage: (src, alt, href) => this.showImage({ pickId: newPickId(), src, alt, href }),
      playVideo: (url, title) => this.showVideo(url, title),
      showLyrics: (text, pageTitle) => this.showLyrics(text, pageTitle, true),
      showResearchSelection: () => this.collectResearchSelection(),
      openExternal: (url) => void shell.openExternal(url),
      allowInspect: isDev
    });

    // NDI output: the program is rendered offscreen at 1920×1080 and sent to vMix; panel 3 previews it.
    this.ndi = new NdiSender(() => this.scheduleBroadcast());
    this.output = new OffscreenOutput(this.ndi, (jpeg) => this.send('app:outputFrame', jpeg));

    this.program = new ProgramController(window, sessions.media, {
      onChange: () => {
        this.syncOutputPage();
        this.scheduleBroadcast();
      },
      onKey: (input) => this.handleKey(input, 'web'),
      onOutputVideo: (videoWindow) => this.output.setVideo(videoWindow)
    });

    this.adblock = new AdblockManager(
      sessions,
      adblockCacheDirectory(),
      () => ({ ...this.settings.adblock, applyToOutput: true }),
      () => this.scheduleBroadcast(),
      (date) => this.saveSettings({ ...this.settings, adblock: { ...this.settings.adblock, lastUpdated: date } })
    );

    // The research preload asks which tab it runs in, then reports clicks and selections.
    ipcMain.on(RESEARCH_ROLE_CHANNEL, (event) => {
      event.returnValue = this.trustedResearchTab(event) ?? '';
    });
    ipcMain.on(RESEARCH_PICK_CHANNEL, (event, payload: unknown) => this.onPick(event, payload));

    window.on('move', () => this.scheduleBroadcast());
    window.on('resize', () => this.scheduleBroadcast());
  }

  async start(): Promise<void> {
    this.ndi.start();
    await this.adblock.init();
  }

  /** Tells the offscreen output page what to draw (images, lyrics or black). */
  private syncOutputPage(): void {
    const p = this.program.program;
    let state: OutputPageState;
    if (p.kind === 'image') state = { kind: 'image', rev: p.rev, url: p.url, fallbackUrl: p.fallbackUrl };
    else if (p.kind === 'lyrics')
      state = {
        kind: 'lyrics',
        rev: p.rev,
        text: p.slides[p.index] ?? '',
        style: lyricsStyleFor(this.settings, p.source !== null),
        source: p.source ? formatSourceLine(p.source) : null
      };
    else state = { kind: 'black', rev: p.rev };
    const key = JSON.stringify(state);
    if (key === this.outputPageKey) return;
    this.outputPageKey = key;
    this.output.render(state);
  }

  /* ---------------------------------------------------------------- */
  /* Snapshot                                                          */
  /* ---------------------------------------------------------------- */

  snapshot(): AppSnapshot {
    return {
      activeTab: this.tabs.active,
      tabs: this.tabs.allStates(),
      program: this.program.program,
      playback: this.program.playback,
      adblock: this.adblock.status(),
      settings: this.settings,
      capture: this.captureInfo(),
      ndi: this.ndi.status,
      version: app.getVersion()
    };
  }

  scheduleBroadcast(): void {
    if (this.broadcastPending) return;
    this.broadcastPending = true;
    setImmediate(() => {
      this.broadcastPending = false;
      this.send('app:snapshot', this.snapshot());
    });
  }

  send<E extends keyof EventPayloads>(channel: E, payload: EventPayloads[E]): void {
    if (!this.window.isDestroyed()) this.window.webContents.send(channel, payload);
  }

  notify(level: NotifyLevel, message: string): void {
    this.send('app:notify', { level, message });
  }

  /** Panel 3's position in physical pixels, so it can be entered as a crop in vMix. */
  private captureInfo(): CaptureInfo | null {
    const rect = this.program.outputRect;
    if (this.window.isDestroyed() || rect.width <= 0 || rect.height <= 0) return null;
    const content = this.window.getContentBounds();
    const display = screen.getDisplayMatching(content);
    const scale = display.scaleFactor;
    const physical = (r: Rect): Rect => ({
      x: Math.round(r.x * scale),
      y: Math.round(r.y * scale),
      width: Math.round(r.width * scale),
      height: Math.round(r.height * scale)
    });
    const onDisplay = { ...rect, x: content.x - display.bounds.x + rect.x, y: content.y - display.bounds.y + rect.y };
    const index = screen
      .getAllDisplays()
      .sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y)
      .findIndex((d) => d.id === display.id);
    return {
      displayName: display.label || `Display ${index + 1}`,
      displayCrop: physical(onDisplay),
      windowCrop: physical(rect)
    };
  }

  /* ---------------------------------------------------------------- */
  /* Picks from the search tabs                                        */
  /* ---------------------------------------------------------------- */

  private trustedResearchTab(event: IpcMainEvent): TabId | null {
    if (!event.senderFrame || event.senderFrame !== event.sender.mainFrame) return null;
    return this.tabs.tabOf(event.sender);
  }

  private onPick(event: IpcMainEvent, payload: unknown): void {
    const tab = this.trustedResearchTab(event);
    if (!tab) return;
    const parsed = researchPickSchema.safeParse(payload);
    if (!parsed.success) return;
    const pick: ResearchPick = parsed.data;
    // Each tab may only produce its own kind of content.
    if ((pick.type === 'image' || pick.type === 'imageUpgrade') && tab !== 'images') return;
    if (pick.type === 'video' && tab !== 'youtube') return;
    if (pick.type === 'lyrics' && tab !== 'lyrics') return;
    if (pick.type === 'research' && tab !== 'research') return;

    switch (pick.type) {
      case 'image':
        this.showImage(pick);
        break;
      case 'imageUpgrade':
        this.program.dispatch({ type: 'upgradeImage', pickId: pick.pickId, url: pick.src });
        break;
      case 'video':
        this.showVideo(pick.href, pick.title);
        break;
      case 'lyrics':
        this.showLyrics(pick.text, pick.pageTitle, false);
        break;
      case 'research':
        this.showResearch(pick.text, pick.page, pick.explicit);
        break;
    }
  }

  showImage(pick: { pickId: string; src: string; alt: string; href: string }): void {
    this.tabs.notePick();
    const image = resolveImagePick(pick);
    this.program.dispatch({ type: 'showImage', pickId: pick.pickId, title: image.title, url: image.url, fallbackUrl: image.fallbackUrl });
  }

  showVideo(url: string, title: string): void {
    const video = resolveVideoLink(url, title);
    if (!video) return;
    this.program.dispatch({ type: 'showVideo', title: video.title, videoId: video.videoId, startSeconds: video.startSeconds });
  }

  showLyrics(text: string, pageTitle: string, explicit: boolean): void {
    if (!explicit && !isLyricsSelection(text)) return;
    const slides = lyricsToSlides(text);
    if (slides.length === 0) {
      if (explicit) this.notify('warning', 'No lyrics text found in the selection.');
      return;
    }
    this.program.dispatch({ type: 'showLyrics', title: titleFromSearchPage(pageTitle), slides });
  }

  /**
   * Shows highlighted research text with its source. Text whose source cannot be
   * named truthfully (for example Google's AI overview) is not shown at all.
   */
  showResearch(text: string, page: ResearchPageInfo, explicit: boolean): void {
    if (!text.trim()) {
      if (explicit) this.notify('warning', 'Highlight the text on the page first.');
      return;
    }
    if (!explicit && !isLyricsSelection(text)) return;
    const source = resolveResearchSource(page);
    if (!source) {
      this.notify('warning', 'The source of this text cannot be named. Open the source page (not Google’s summary) and highlight the text there.');
      return;
    }
    const slides = researchToSlides(text);
    if (slides.length === 0) return;
    this.program.dispatch({ type: 'showLyrics', title: source.title, slides, source });
    if (source.fromSearchPage) this.notify('info', 'Shown from a Google snippet. Open the page to confirm the text and add its date.');
    else if (!source.date) this.notify('info', 'This page does not state a date, so none is shown.');
  }

  /** Asks the Research tab for its highlighted text and source details (they arrive as a pick). */
  collectResearchSelection(): void {
    this.tabs.webContents('research')?.send(RESEARCH_COLLECT_CHANNEL);
  }

  async useSelection(): Promise<void> {
    if (this.tabs.active === 'research') {
      this.collectResearchSelection();
      return;
    }
    const text = await this.tabs.selectionText('lyrics');
    if (!text.trim()) throw new Error('Highlight the lyrics on the page first.');
    this.showLyrics(text, this.tabs.state('lyrics').title, true);
  }

  /* ---------------------------------------------------------------- */
  /* Settings                                                          */
  /* ---------------------------------------------------------------- */

  private saveSettings(next: Settings): void {
    this.settings = parseSettings(next);
    this.settingsStore.save(this.settings);
    this.syncOutputPage();
    this.scheduleBroadcast();
  }

  updateSettings(patch: { lyricsScale?: number; lyricsUppercase?: boolean; adblockEnabled?: boolean }): void {
    const next: Settings = {
      ...this.settings,
      ...(patch.lyricsScale !== undefined ? { lyricsScale: patch.lyricsScale } : {}),
      ...(patch.lyricsUppercase !== undefined ? { lyricsUppercase: patch.lyricsUppercase } : {}),
      adblock: { ...this.settings.adblock, ...(patch.adblockEnabled !== undefined ? { enabled: patch.adblockEnabled } : {}) }
    };
    const adblockChanged = next.adblock.enabled !== this.settings.adblock.enabled;
    this.saveSettings(next);
    if (adblockChanged) void this.adblock.refresh();
  }

  selectTab(tab: TabId): void {
    this.tabs.select(tab);
    this.saveSettings({ ...this.settings, activeTab: tab });
  }

  /** Remembers each tab's page (debounced) so the tabs reopen where they were. */
  private scheduleTabSave(): void {
    if (this.tabSaveTimer) return;
    this.tabSaveTimer = setTimeout(() => {
      this.tabSaveTimer = null;
      this.persistTabUrls();
    }, 1000);
  }

  private persistTabUrls(): void {
    const states = this.tabs.allStates();
    const tabUrls = { ...this.settings.tabUrls };
    for (const tab of Object.keys(tabUrls) as TabId[]) {
      if (/^https?:/.test(states[tab].url)) tabUrls[tab] = states[tab].url;
    }
    if (JSON.stringify(tabUrls) !== JSON.stringify(this.settings.tabUrls)) this.saveSettings({ ...this.settings, tabUrls });
  }

  /* ---------------------------------------------------------------- */
  /* Keyboard                                                          */
  /* ---------------------------------------------------------------- */

  /**
   * Shortcuts that work everywhere, including inside web pages. All use Ctrl or
   * Alt, so typing and the websites' own keys are never intercepted.
   */
  handleKey(input: Electron.Input, _source: 'web'): boolean {
    const key = input.key.toLowerCase();
    const ctrl = input.control && !input.alt && !input.meta;
    if (ctrl && input.shift && key === 'b') {
      this.program.dispatch({ type: 'clear' });
      return true;
    }
    if (ctrl && input.shift && (key === 'arrowright' || key === 'arrowleft')) {
      this.program.dispatch({ type: 'lyricsStep', delta: key === 'arrowright' ? 1 : -1 });
      return true;
    }
    if (ctrl && !input.shift && key === 'l') {
      this.window.webContents.focus();
      this.send('app:focusSearch', null);
      return true;
    }
    if (ctrl && !input.shift && ['1', '2', '3', '4'].includes(key)) {
      this.selectTab((['images', 'youtube', 'lyrics', 'research'] as const)[Number(key) - 1]!);
      return true;
    }
    if (input.alt && !input.control && !input.meta && (key === 'arrowleft' || key === 'arrowright')) {
      this.tabs.command(this.tabs.active, key === 'arrowleft' ? 'back' : 'forward');
      return true;
    }
    return false;
  }

  /* ---------------------------------------------------------------- */
  /* Shutdown                                                          */
  /* ---------------------------------------------------------------- */

  dispose(): void {
    if (this.tabSaveTimer) clearTimeout(this.tabSaveTimer);
    this.persistTabUrls();
    this.settingsStore.flush();
    this.program.destroy();
    this.output.destroy();
    this.ndi.stop();
    this.tabs.destroy();
  }
}

function newPickId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
