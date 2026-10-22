import fs from 'node:fs/promises';
import path from 'node:path';
import { ipcMain, net, type Session } from 'electron';
import { ElectronBlocker } from '@ghostery/adblocker-electron';
import type { AdblockLevel, AdblockStatus } from '../shared/types';
import { isGooglePage } from '../shared/urls';

/**
 * Request filtering for the remote browsing sessions using Ghostery's
 * maintained engine and its prebuilt lists (EasyList, EasyPrivacy, uBlock
 * Origin filters, plus annoyance lists for the "full" level).
 *
 * The compiled engine is cached on disk so the app starts filtering without a
 * network round-trip; "Update filter lists" fetches fresh lists and only
 * replaces the cache once the new engine has loaded successfully.
 *
 * Sessions are wired here rather than with `enableBlockingInSession`, because
 * that helper registers process-wide IPC handlers per session and fails for a
 * second session. Network hooks and the cosmetic-filter preload are installed
 * per session; the cosmetic IPC handlers are registered once and always use
 * the current engine, so swapping engines needs no re-wiring.
 *
 * The application's own UI session is never filtered.
 */

export interface AdblockSettings {
  enabled: boolean;
  applyToOutput: boolean;
  level: AdblockLevel;
  lastUpdated: string | null;
}

type FetchLike = Parameters<typeof ElectronBlocker.fromPrebuiltAdsAndTracking>[0];

const fetchViaNet: FetchLike = (url: string) => net.fetch(url) as unknown as ReturnType<NonNullable<FetchLike>>;

const COSMETIC_CHANNEL = '@ghostery/adblocker/inject-cosmetic-filters';
const MUTATION_CHANNEL = '@ghostery/adblocker/is-mutation-observer-enabled';

/**
 * The library runs its page scripts with `executeJavaScript` without handling
 * failures, which floods the log with unhandled rejections on busy pages. This
 * gives it a sender whose script failures are ignored instead.
 */
function withQuietScripts(event: Electron.IpcMainInvokeEvent): Electron.IpcMainInvokeEvent {
  const sender = event.sender;
  const quietSender = new Proxy(sender, {
    get(target, prop) {
      if (prop === 'executeJavaScript') {
        return (code: string, userGesture?: boolean) => target.executeJavaScript(code, userGesture).catch(() => undefined);
      }
      const value: unknown = Reflect.get(target, prop);
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    }
  });
  return Object.create(event, { sender: { value: quietSender } }) as Electron.IpcMainInvokeEvent;
}

/**
 * Google Search and Google Images are not filtered. The filter lists block
 * Google's own interaction beacons (gen_204, client_204, /log); without them
 * Google can mistake a real operator for a bot and show its "confirm you're
 * human" check. Google's result pages carry few ads, so little is lost.
 * YouTube and every other site remain filtered.
 */
function isFromGooglePage(details: { webContents?: Electron.WebContents }): boolean {
  const wc = details.webContents;
  if (!wc || wc.isDestroyed()) return false;
  // The page the operator is on decides, not the host of each individual request.
  return isGooglePage(wc.getURL());
}

function cosmeticPreloadPath(): string {
  return path.resolve(require.resolve('@ghostery/adblocker-electron-preload'));
}

export class AdblockManager {
  private blocker: ElectronBlocker | null = null;
  private loadedLevel: AdblockLevel | null = null;
  private blockedCount = 0;
  private engineState: AdblockStatus['engine'] = 'off';
  private updating = false;
  private error: string | null = null;
  private changeTimer: NodeJS.Timeout | null = null;
  /** Sessions currently filtered, with their registered cosmetic preload id. */
  private readonly active = new Map<Session, string>();

  constructor(
    private readonly sessions: { research: Session; media: Session },
    private readonly cacheDir: string,
    private readonly getSettings: () => AdblockSettings,
    private readonly onChange: () => void,
    private readonly onUpdated: (isoDate: string) => void
  ) {
    // Messages come from Ghostery's preload running in filtered remote pages; they
    // only ask for CSS to be injected into the requesting frame.
    ipcMain.handle(COSMETIC_CHANNEL, (event, url: unknown, msg: unknown) => {
      if (!this.blocker || !this.isFilteredSender(event.sender.session) || typeof url !== 'string') return;
      if (isGooglePage(event.sender.getURL())) return;
      return this.blocker.onInjectCosmeticFilters(withQuietScripts(event), url, msg as Parameters<ElectronBlocker['onInjectCosmeticFilters']>[2]);
    });
    ipcMain.handle(MUTATION_CHANNEL, (event) => {
      if (!this.blocker || !this.isFilteredSender(event.sender.session)) return false;
      return this.blocker.onIsMutationObserverEnabled(event);
    });
  }

  status(): AdblockStatus {
    const s = this.getSettings();
    return {
      enabled: s.enabled,
      applyToOutput: s.applyToOutput,
      level: s.level,
      engine: this.engineState,
      updating: this.updating,
      lastUpdated: s.lastUpdated,
      blockedCount: this.blockedCount,
      error: this.error
    };
  }

  /** Loads the engine (from cache when possible) and applies the current settings. */
  async init(): Promise<void> {
    await this.ensureEngine(false);
    this.apply();
  }

  /** Re-applies enable/disable per session and loads another list level if it changed. */
  async refresh(): Promise<void> {
    const s = this.getSettings();
    if (s.enabled && this.loadedLevel !== s.level) await this.ensureEngine(false);
    this.apply();
  }

  /** Fetches fresh filter lists. On failure the previous engine stays active. */
  async update(): Promise<void> {
    if (this.updating) return;
    this.updating = true;
    this.error = null;
    this.emitChange();
    try {
      await this.ensureEngine(true);
      this.apply();
    } finally {
      this.updating = false;
      this.emitChange();
    }
  }

  private isFilteredSender(ses: Session): boolean {
    return this.active.has(ses);
  }

  private cacheFile(level: AdblockLevel): string {
    return path.join(this.cacheDir, `engine-${level}.bin`);
  }

  private async ensureEngine(forceNetwork: boolean): Promise<void> {
    const { level, enabled } = this.getSettings();
    if (!enabled && !forceNetwork && this.blocker === null) {
      // Nothing is downloaded while blocking is switched off.
      this.engineState = 'off';
      return;
    }
    if (!this.blocker) this.engineState = 'loading';
    this.emitChange();

    let engine: ElectronBlocker | null = forceNetwork ? null : await this.loadCached(level);
    if (!engine) {
      try {
        engine =
          level === 'full'
            ? await ElectronBlocker.fromPrebuiltFull(fetchViaNet)
            : await ElectronBlocker.fromPrebuiltAdsAndTracking(fetchViaNet);
        await fs.mkdir(this.cacheDir, { recursive: true });
        await fs.writeFile(this.cacheFile(level), engine.serialize());
        this.onUpdated(new Date().toISOString());
      } catch (error) {
        this.error = `Filter lists could not be downloaded (${(error as Error).message}). ${
          this.blocker ? 'The previously loaded lists remain active.' : 'Blocking is unavailable until the lists can be downloaded.'
        }`;
        this.engineState = this.blocker ? 'ready' : 'error';
        this.emitChange();
        return;
      }
    }

    engine.on('request-blocked', () => {
      this.blockedCount++;
      this.emitChange();
    });
    // Session hooks look up `this.blocker` on every request, so the swap is immediate.
    this.blocker = engine;
    this.loadedLevel = level;
    this.engineState = 'ready';
    this.error = null;
  }

  private async loadCached(level: AdblockLevel): Promise<ElectronBlocker | null> {
    try {
      const buffer = await fs.readFile(this.cacheFile(level));
      return ElectronBlocker.deserialize(new Uint8Array(buffer)) as ElectronBlocker;
    } catch {
      // Missing or incompatible cache (e.g. after an engine upgrade): fall back to the network.
      return null;
    }
  }

  private apply(): void {
    const s = this.getSettings();
    const ready = this.blocker !== null;
    this.setSession(this.sessions.research, ready && s.enabled);
    this.setSession(this.sessions.media, ready && s.enabled && s.applyToOutput);
    if (!s.enabled) this.engineState = 'off';
    else if (ready) this.engineState = 'ready';
    this.emitChange();
  }

  private setSession(ses: Session, enabled: boolean): void {
    const isActive = this.active.has(ses);
    if (enabled && !isActive) {
      ses.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
        if (this.blocker && this.active.has(ses) && !isFromGooglePage(details)) this.blocker.onBeforeRequest(details, callback);
        else callback({});
      });
      ses.webRequest.onHeadersReceived({ urls: ['<all_urls>'] }, (details, callback) => {
        if (this.blocker && this.active.has(ses) && !isFromGooglePage(details)) this.blocker.onHeadersReceived(details, callback);
        else callback({});
      });
      const preloadId = ses.registerPreloadScript({ type: 'frame', filePath: cosmeticPreloadPath() });
      this.active.set(ses, preloadId);
    } else if (!enabled && isActive) {
      ses.webRequest.onBeforeRequest(null);
      ses.webRequest.onHeadersReceived(null);
      const preloadId = this.active.get(ses);
      if (preloadId) ses.unregisterPreloadScript(preloadId);
      this.active.delete(ses);
    }
  }

  /** Coalesces change notifications (the blocked-request counter can fire very often). */
  private emitChange(): void {
    if (this.changeTimer) return;
    this.changeTimer = setTimeout(() => {
      this.changeTimer = null;
      this.onChange();
    }, 500);
  }
}
