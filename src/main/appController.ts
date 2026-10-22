import { randomUUID } from 'node:crypto';
import { app, dialog, shell, type BrowserWindow, type Session } from 'electron';
import type { EventPayloads } from '../shared/api';
import { duplicateTitle } from '../shared/lyrics';
import {
  addEntry,
  clearQueue,
  currentEntry,
  makeEntry,
  moveEntry,
  removeEntry,
  selectEntry,
  stepNext,
  stepPrevious,
  updateNotes
} from '../shared/queue';
import { applySettingsPatch, type Settings, type SettingsPatch } from '../shared/settings';
import { defaultShortcuts, matchesAccelerator, SHORTCUT_DEFINITIONS, type ShortcutAction } from '../shared/shortcuts';
import type {
  AppSnapshot,
  Bookmark,
  DisplayInfo,
  LiveLyrics,
  NotifyLevel,
  PresentableItem,
  QueueEntry,
  QueueState,
  Song
} from '../shared/types';
import { resolveAddressInput } from '../shared/urls';
import { AdblockManager } from './adblock';
import { displayIdForWindow, identifyDisplays, listDisplays, watchDisplays } from './displays';
import { OutputController } from './output/outputController';
import type { VideoCommand } from './output/videoPlayer';
import { adblockCacheDirectory, dataDirectory, isDev } from './paths';
import { importAsset } from './protocols';
import { ResearchView } from './research/researchView';
import { createStores, queueFileFromState, queueStateFromFile, type Stores } from './store/documents';

/**
 * The application's single source of truth in the main process. It owns all
 * persistent state and the live output, and pushes one consolidated snapshot
 * to the operator UI whenever anything changes.
 */
export class AppController {
  private readonly stores: Stores;
  private settings: Settings;
  private queue: QueueState;
  private songs: Song[];
  private bookmarks: Bookmark[];
  private selection: PresentableItem | null = null;
  private preview: PresentableItem | null = null;
  private displays: DisplayInfo[] = [];
  private readonly storageIssues: string[] = [];
  private broadcastPending = false;

  readonly research: ResearchView;
  readonly output: OutputController;
  readonly adblock: AdblockManager;

  constructor(
    private readonly mainWindow: BrowserWindow,
    sessions: { research: Session; media: Session }
  ) {
    this.stores = createStores(dataDirectory());
    const settingsReport = this.stores.settings.load();
    const queueReport = this.stores.queue.load();
    const lyricsReport = this.stores.lyrics.load();
    const bookmarksReport = this.stores.bookmarks.load();
    this.storageIssues.push(...settingsReport.issues, ...queueReport.issues, ...lyricsReport.issues, ...bookmarksReport.issues);
    this.settings = settingsReport.data;
    this.queue = queueStateFromFile(queueReport.data);
    this.songs = lyricsReport.data.songs;
    this.bookmarks = bookmarksReport.data.bookmarks;
    this.displays = listDisplays();

    this.research = new ResearchView(mainWindow, sessions.research, this.settings.research.homeUrl, {
      onChange: () => this.scheduleBroadcast(),
      onKey: (input) => this.handleWebKey(input, 'research'),
      present: (item) => this.safely(() => this.present(item)),
      preview: (item) => this.setPreview(item),
      queue: (item, position) => this.safely(() => this.addToQueue(item, position)),
      bookmark: (title, url) => this.addBookmark(title, url),
      openExternal: (url) => void this.openExternal(url),
      openHere: (url) => this.research.navigate(url),
      allowInspect: isDev
    });

    this.output = new OutputController(
      {
        settings: () => this.settings,
        displays: () => this.displays,
        mainDisplayId: () => displayIdForWindow(this.mainWindow),
        onChange: () => this.scheduleBroadcast(),
        onVideoEnded: (item) => this.onVideoEnded(item),
        notify: (level, message) => this.notify(level, message),
        onKey: (input, source) => this.handleWebKey(input, source)
      },
      sessions.media
    );

    this.adblock = new AdblockManager(
      sessions,
      adblockCacheDirectory(),
      () => this.settings.adblock,
      () => this.scheduleBroadcast(),
      (date) => this.updateSettings({ adblock: { lastUpdated: date } })
    );

    watchDisplays(() => {
      this.displays = listDisplays();
      this.output.onDisplaysChanged();
      this.scheduleBroadcast();
    });

    for (const issue of this.storageIssues) console.warn(`[storage] ${issue}`);
  }

  async start(): Promise<void> {
    if (this.settings.output.openOnLaunch) this.output.windowCommand('open');
    await this.adblock.init();
  }

  /* ---------------------------------------------------------------- */
  /* Snapshot & notifications                                          */
  /* ---------------------------------------------------------------- */

  snapshot(): AppSnapshot {
    const writeErrors = Object.values(this.stores)
      .map((s) => s.writeError)
      .filter((e): e is string => !!e);
    return {
      settings: this.settings,
      research: this.research.state,
      selection: this.selection,
      preview: this.preview,
      output: this.output.getState(),
      outputWindow: this.output.getWindowState(),
      queue: this.queue,
      displays: this.displays,
      adblock: this.adblock.status(),
      storageIssues: [...this.storageIssues, ...writeErrors],
      app: { version: app.getVersion(), isPackaged: app.isPackaged, dataPath: dataDirectory() }
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
    if (this.mainWindow.isDestroyed()) return;
    this.mainWindow.webContents.send(channel, payload);
  }

  notify(level: NotifyLevel, message: string): void {
    this.send('app:notify', { level, message });
  }

  /** Runs an operation triggered outside IPC (menus, shortcuts) and reports failures to the operator. */
  private safely(fn: () => unknown): void {
    try {
      const result = fn();
      if (result instanceof Promise) result.catch((error: Error) => this.notify('error', error.message));
    } catch (error) {
      this.notify('error', (error as Error).message);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Selection, preview & presentation                                 */
  /* ---------------------------------------------------------------- */

  setSelection(item: PresentableItem | null): void {
    this.selection = item;
    this.scheduleBroadcast();
  }

  setPreview(item: PresentableItem | null): void {
    this.preview = item;
    if (item) this.selection = item;
    this.scheduleBroadcast();
  }

  /** Builds the frozen lyrics snapshot for a queued or library lyrics item. */
  private lyricsFor(item: PresentableItem): LiveLyrics | undefined {
    if (item.kind !== 'lyrics') return undefined;
    const song = this.songs.find((s) => s.id === item.songId);
    if (!song) throw new Error(`The song "${item.title}" is no longer in the lyrics library.`);
    const slides = song.slides.map((s) => s.text);
    if (slides.length === 0) throw new Error(`"${song.title}" has no slides.`);
    return { songId: song.id, title: song.title, slides, index: Math.min(item.slideIndex, slides.length - 1) };
  }

  /** The only path that changes live content. */
  present(item: PresentableItem, lyrics?: LiveLyrics): void {
    const snapshot = item.kind === 'lyrics' ? (lyrics ?? this.lyricsFor(item)) : undefined;
    if (item.kind === 'video' && this.settings.research.pauseResearchMediaOnPresent) this.research.pauseMedia();
    this.output.present(item, snapshot);
  }

  /** Ctrl+Enter: present the preview item, else the research selection, else a video open in the research view. */
  presentCurrentSelection(): void {
    const item = this.preview ?? this.selection ?? this.research.state.detectedVideo;
    if (!item) throw new Error('Nothing is selected. Right-click an image or video, or preview a queue item first.');
    this.present(item);
  }

  lyricsCommand(cmd: { command: 'next' | 'previous' | 'first' | 'last' } | { command: 'goto'; index: number }): void {
    const live = this.output.getState().lyrics;
    if (!live || this.output.getState().status !== 'LYRICS') throw new Error('No lyrics are live.');
    const last = live.slides.length - 1;
    const index =
      cmd.command === 'goto'
        ? cmd.index
        : cmd.command === 'next'
          ? Math.min(last, live.index + 1)
          : cmd.command === 'previous'
            ? Math.max(0, live.index - 1)
            : cmd.command === 'first'
              ? 0
              : last;
    if (!this.output.lyricsGoto(index)) throw new Error('That slide does not exist.');
  }

  async videoCommand(cmd: VideoCommand): Promise<void> {
    await this.output.videoCommand(cmd);
  }

  private onVideoEnded(item: PresentableItem): void {
    if (!this.settings.queue.autoAdvanceOnVideoEnd) return;
    const current = currentEntry(this.queue);
    if (!current || current.item.id !== item.id) return;
    this.safely(() => this.stepQueue('next', true));
  }

  /* ---------------------------------------------------------------- */
  /* Queue                                                             */
  /* ---------------------------------------------------------------- */

  private setQueue(next: QueueState): void {
    this.queue = next;
    this.stores.queue.save(queueFileFromState(next));
    this.scheduleBroadcast();
  }

  addToQueue(item: PresentableItem, position: 'end' | 'next' = 'end', notes = ''): QueueEntry {
    const entry = makeEntry(item, randomUUID(), new Date(), notes);
    this.setQueue(addEntry(this.queue, entry, position));
    this.notify('success', `Added “${item.title}” to the queue.`);
    return entry;
  }

  removeFromQueue(id: string): void {
    this.setQueue(removeEntry(this.queue, id));
  }

  moveInQueue(from: number, to: number): void {
    this.setQueue(moveEntry(this.queue, from, to));
  }

  clearQueue(): void {
    this.setQueue(clearQueue());
  }

  selectQueueEntry(id: string | null): void {
    this.setQueue(selectEntry(this.queue, id));
    const entry = currentEntry(this.queue);
    if (entry) this.setPreview(entry.item);
  }

  updateQueueNotes(id: string, notes: string): void {
    this.setQueue(updateNotes(this.queue, id, notes));
  }

  /**
   * Moves the queue cursor and previews the item. The item is presented only
   * when auto-advance is enabled (or when `forcePresent` is set by video auto-advance).
   */
  stepQueue(direction: 'next' | 'previous', forcePresent = false): void {
    const result = direction === 'next' ? stepNext(this.queue) : stepPrevious(this.queue);
    if (!result.entry) {
      this.notify('info', direction === 'next' ? 'End of the queue.' : 'Start of the queue.');
      return;
    }
    this.setQueue(result.state);
    this.setPreview(result.entry.item);
    if (forcePresent || this.settings.queue.presentOnNavigate) this.present(result.entry.item);
  }

  presentQueueEntry(id: string): void {
    const entry = this.queue.entries.find((e) => e.id === id);
    if (!entry) throw new Error('That queue item no longer exists.');
    this.setQueue(selectEntry(this.queue, id));
    this.present(entry.item);
  }

  /* ---------------------------------------------------------------- */
  /* Lyrics library                                                    */
  /* ---------------------------------------------------------------- */

  listSongs(): Song[] {
    return this.songs;
  }

  private setSongs(songs: Song[]): void {
    this.songs = songs;
    this.stores.lyrics.save({ version: 1, songs });
    this.send('lyrics:changed', songs);
  }

  saveSong(song: Song): Song {
    const now = new Date().toISOString();
    const existing = this.songs.find((s) => s.id === song.id);
    const saved: Song = { ...song, title: song.title.trim(), createdAt: existing?.createdAt ?? now, updatedAt: now };
    this.setSongs(existing ? this.songs.map((s) => (s.id === song.id ? saved : s)) : [...this.songs, saved]);
    return saved;
  }

  deleteSong(id: string): void {
    const song = this.songs.find((s) => s.id === id);
    if (!song) return;
    this.setSongs(this.songs.filter((s) => s.id !== id));
    const orphaned = this.queue.entries.filter((e) => e.item.kind === 'lyrics' && e.item.songId === id);
    if (orphaned.length > 0) {
      this.setQueue(orphaned.reduce((q, e) => removeEntry(q, e.id), this.queue));
      this.notify('info', `Removed ${orphaned.length} queue item(s) for “${song.title}”.`);
    }
  }

  duplicateSong(id: string): Song {
    const song = this.songs.find((s) => s.id === id);
    if (!song) throw new Error('Song not found.');
    const now = new Date().toISOString();
    const copy: Song = {
      id: randomUUID(),
      title: duplicateTitle(song.title, this.songs.map((s) => s.title)),
      slides: song.slides.map((s) => ({ id: randomUUID(), text: s.text })),
      createdAt: now,
      updatedAt: now
    };
    this.setSongs([...this.songs, copy]);
    return copy;
  }

  async chooseLyricsBackground(): Promise<string | null> {
    const result = await dialog.showOpenDialog(this.mainWindow, {
      title: 'Choose a lyrics background image',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif'] }]
    });
    const file = result.filePaths[0];
    if (result.canceled || !file) return null;
    const url = importAsset(file, randomUUID());
    this.updateSettings({ lyrics: { backgroundImage: url } });
    return url;
  }

  /* ---------------------------------------------------------------- */
  /* Bookmarks                                                         */
  /* ---------------------------------------------------------------- */

  listBookmarks(): Bookmark[] {
    return this.bookmarks;
  }

  private setBookmarks(bookmarks: Bookmark[]): void {
    this.bookmarks = bookmarks;
    this.stores.bookmarks.save({ version: 1, bookmarks });
    this.send('bookmarks:changed', bookmarks);
  }

  addBookmark(title: string, url: string): Bookmark {
    const existing = this.bookmarks.find((b) => b.url === url);
    if (existing) {
      this.notify('info', 'This page is already bookmarked.');
      return existing;
    }
    const bookmark: Bookmark = { id: randomUUID(), title: title.trim().slice(0, 300) || url, url, createdAt: new Date().toISOString() };
    this.setBookmarks([bookmark, ...this.bookmarks]);
    this.notify('success', 'Bookmark added.');
    return bookmark;
  }

  removeBookmark(id: string): void {
    this.setBookmarks(this.bookmarks.filter((b) => b.id !== id));
  }

  /* ---------------------------------------------------------------- */
  /* Settings, displays, ad blocking                                   */
  /* ---------------------------------------------------------------- */

  getSettings(): Settings {
    return this.settings;
  }

  updateSettings(patch: SettingsPatch): Settings {
    const before = this.settings;
    this.settings = applySettingsPatch(before, patch);
    this.stores.settings.save(this.settings);
    if (patch.adblock && (before.adblock.enabled !== this.settings.adblock.enabled || before.adblock.applyToOutput !== this.settings.adblock.applyToOutput || before.adblock.level !== this.settings.adblock.level)) {
      void this.adblock.refresh();
    }
    if (patch.lyrics || patch.output) this.output.pushRender();
    if (patch.output && (before.output.displayId !== this.settings.output.displayId || before.output.fullscreen !== this.settings.output.fullscreen)) {
      this.output.moveToPreferredDisplay();
    }
    this.scheduleBroadcast();
    return this.settings;
  }

  resetShortcuts(action?: ShortcutAction): Settings {
    const defaults = defaultShortcuts();
    const patch = action ? { [action]: defaults[action] } : defaults;
    return this.updateSettings({ shortcuts: patch });
  }

  selectDisplay(displayId: number): void {
    const display = this.displays.find((d) => d.id === displayId);
    if (!display) throw new Error('That display is no longer connected.');
    // Only real Windows names are saved; they let the choice survive Windows renumbering display ids.
    this.updateSettings({ output: { displayId: display.id, displayLabel: display.nameKnown ? display.label : null } });
    this.output.moveToPreferredDisplay();
  }

  identifyDisplays(): void {
    identifyDisplays(this.displays);
  }

  async updateFilterLists(): Promise<void> {
    await this.adblock.update();
    const status = this.adblock.status();
    if (status.error) throw new Error(status.error);
    this.notify('success', 'Filter lists updated.');
  }

  /* ---------------------------------------------------------------- */
  /* Misc                                                              */
  /* ---------------------------------------------------------------- */

  navigate(input: string, mode: 'images' | 'youtube' | 'web'): void {
    const url = resolveAddressInput(input, mode, this.settings.research.searchEngine);
    if (!url) throw new Error('That address cannot be opened. Only web (http/https) addresses are allowed.');
    this.research.navigate(url);
  }

  async openExternal(url: string): Promise<void> {
    await shell.openExternal(url);
  }

  async openDataFolder(): Promise<void> {
    const error = await shell.openPath(dataDirectory());
    if (error) throw new Error(error);
  }

  async clearBrowsingData(): Promise<void> {
    await this.research.clearBrowsingData();
    this.notify('success', 'Research browsing data (cookies, cache, site storage) cleared.');
  }

  /* ---------------------------------------------------------------- */
  /* Keyboard shortcuts                                                */
  /* ---------------------------------------------------------------- */

  /** Runs an app-level shortcut action. UI-only actions (focusing the address bar) are forwarded to the UI. */
  runShortcut(action: ShortcutAction): void {
    switch (action) {
      case 'focusAddress':
        this.mainWindow.webContents.focus();
        this.send('app:shortcut', { action });
        break;
      case 'back':
      case 'forward':
      case 'reload':
        this.research.command(action, this.settings.research.homeUrl);
        break;
      case 'toggleOutput':
        this.output.windowCommand('toggleVisible');
        break;
      case 'presentSelection':
        this.presentCurrentSelection();
        break;
      case 'queueNext':
        this.stepQueue('next');
        break;
      case 'queuePrevious':
        this.stepQueue('previous');
        break;
      case 'clearOutput':
        this.output.clear();
        break;
      case 'exitFullscreen':
        this.output.exitFullscreen();
        break;
      case 'playPause':
        if (this.output.getState().status === 'VIDEO') void this.videoCommand({ command: 'toggle' }).catch(() => undefined);
        break;
      case 'lyricsNext':
        this.lyricsCommand({ command: 'next' });
        break;
      case 'lyricsPrevious':
        this.lyricsCommand({ command: 'previous' });
        break;
    }
  }

  /**
   * Key presses inside remote web content (research page, output video) or the
   * output window. Only Ctrl/Alt "anywhere" shortcuts are taken from web pages;
   * the output window additionally handles its own scope (Escape, Space).
   */
  private handleWebKey(input: Electron.Input, source: 'research' | 'output'): boolean {
    if (input.isAutoRepeat && source === 'research') return false;
    const key = { key: input.key, ctrl: input.control, shift: input.shift, alt: input.alt, meta: input.meta };
    for (const def of SHORTCUT_DEFINITIONS) {
      const inScope = def.scope === 'anywhere' || (source === 'output' && (def.scope === 'output' || def.action === 'playPause'));
      if (!inScope) continue;
      if (!matchesAccelerator(this.settings.shortcuts[def.action], key)) continue;
      this.safely(() => this.runShortcut(def.action));
      return true;
    }
    return false;
  }

  /* ---------------------------------------------------------------- */
  /* Shutdown                                                          */
  /* ---------------------------------------------------------------- */

  flush(): void {
    for (const store of Object.values(this.stores)) store.flush();
  }

  dispose(): void {
    this.flush();
    this.output.destroy();
    this.research.destroy();
  }
}
