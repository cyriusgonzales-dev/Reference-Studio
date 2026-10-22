import path from 'node:path';
import { app, ipcMain, screen, shell, type BrowserWindow, type IpcMainEvent, type Session } from 'electron';
import type { EventPayloads } from '../shared/api';
import { isLyricsSelection, lyricsToSlides, titleFromSearchPage } from '../shared/lyrics';
import { resolveImagePick, resolveVideoLink } from '../shared/researchItems';
import { RESEARCH_PICK_CHANNEL, RESEARCH_ROLE_CHANNEL } from '../shared/researchChannels';
import { researchPickSchema, type ResearchPick } from '../shared/schemas';
import { parseSettings, type Settings, defaultSettings } from '../shared/settings';
import type { AppSnapshot, CaptureInfo, NotifyLevel, Rect, TabId } from '../shared/types';
import { AdblockManager } from './adblock';
import { adblockCacheDirectory, dataDirectory, isDev } from './paths';
import { ProgramController } from './player/programController';
import { ResearchTabs } from './research/tabs';
import { JsonStore } from './store/jsonStore';

/**
 * The application's single source of truth in the main process. It owns the
 * three search tabs, the program shown in panels 2 and 3, and the settings,
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
      openExternal: (url) => void shell.openExternal(url),
      allowInspect: isDev
    });

    this.program = new ProgramController(window, sessions.media, {
      onChange: () => this.scheduleBroadcast(),
      onKey: (input) => this.handleKey(input, 'web')
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
    await this.adblock.init();
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

  async useSelection(): Promise<void> {
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
    if (ctrl && !input.shift && ['1', '2', '3'].includes(key)) {
      this.selectTab((['images', 'youtube', 'lyrics'] as const)[Number(key) - 1]!);
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
    this.tabs.destroy();
  }
}

function newPickId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
