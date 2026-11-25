import { app, shell } from 'electron';
import log from 'electron-log/main';
import { autoUpdater, type ProgressInfo, type UpdateInfo } from 'electron-updater';
import { WEBSITE_URL } from '../shared/product';
import type { UpdateStatus } from '../shared/types';

/** Background checks: shortly after start-up, then every few hours while the app runs. */
const FIRST_CHECK_DELAY_MS = 20_000;
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

export interface UpdatePreferences {
  autoCheck: boolean;
  autoDownload: boolean;
}

/**
 * Checks GitHub Releases for new versions (electron-updater).
 *
 * The app is used during live broadcasts, so an update NEVER restarts the app
 * by itself: a downloaded update is installed when the operator clicks
 * "Restart and install", or the next time they quit the app.
 *
 * Background checks fail silently (venues often have no internet); only a
 * check the operator starts reports its error.
 */
export class UpdateManager {
  private statusValue: UpdateStatus;
  private timer: NodeJS.Timeout | null = null;
  private firstTimer: NodeJS.Timeout | null = null;
  private userInitiated = false;

  constructor(
    private readonly preferences: () => UpdatePreferences,
    private readonly onChange: () => void,
    private readonly notify: (level: 'info' | 'success' | 'error', message: string) => void
  ) {
    this.statusValue = {
      mode: detectMode(),
      state: 'idle',
      currentVersion: app.getVersion(),
      latestVersion: null,
      progress: null,
      error: null,
      lastChecked: null
    };
    if (this.statusValue.mode === 'disabled') return;

    autoUpdater.logger = log;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = false;
    autoUpdater.allowDowngrade = false;
    this.applyPreferences();

    autoUpdater.on('checking-for-update', () => this.update({ state: 'checking', error: null }));
    autoUpdater.on('update-not-available', () => {
      this.update({ state: 'not-available', lastChecked: new Date().toISOString(), latestVersion: null });
      if (this.userInitiated) this.notify('success', `You have the latest version (${app.getVersion()}).`);
      this.userInitiated = false;
    });
    autoUpdater.on('update-available', (info: UpdateInfo) => {
      this.update({ state: 'available', latestVersion: info.version, lastChecked: new Date().toISOString() });
      const downloading = this.statusValue.mode === 'auto' && autoUpdater.autoDownload;
      this.notify('info', downloading ? `Version ${info.version} is downloading in the background.` : `Version ${info.version} is available. Open Settings → Updates to get it.`);
      this.userInitiated = false;
    });
    autoUpdater.on('download-progress', (p: ProgressInfo) => this.update({ state: 'downloading', progress: Math.round(p.percent) }));
    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      this.update({ state: 'downloaded', latestVersion: info.version, progress: 100 });
      this.notify('success', `Version ${info.version} is ready. It installs when you restart or quit the app.`);
    });
    autoUpdater.on('error', (error: Error) => {
      log.warn('[updates]', error);
      const message = friendlyError(error);
      // An unsigned macOS build can find updates but not install them: send the operator to the website instead.
      if (process.platform === 'darwin' && /code signature|signature|codesign/i.test(error.message)) {
        this.update({ mode: 'manual', state: this.statusValue.latestVersion ? 'available' : 'error', error: null, progress: null });
        return;
      }
      this.update({ state: 'error', error: message, progress: null });
      if (this.userInitiated) this.notify('error', `Update check failed: ${message}`);
      this.userInitiated = false;
    });
  }

  get status(): UpdateStatus {
    return this.statusValue;
  }

  /** Starts background checks if the operator allows them. */
  start(): void {
    if (this.statusValue.mode === 'disabled') return;
    this.schedule();
  }

  /** Call after the update preferences change. */
  preferencesChanged(): void {
    if (this.statusValue.mode === 'disabled') return;
    this.applyPreferences();
    this.schedule();
  }

  async check(userInitiated = true): Promise<void> {
    if (this.statusValue.mode === 'disabled') throw new Error('Updates are only available in the installed app.');
    if (this.statusValue.state === 'checking' || this.statusValue.state === 'downloading') return;
    this.userInitiated = userInitiated;
    try {
      await autoUpdater.checkForUpdates();
    } catch {
      // Reported through the 'error' event.
    }
  }

  /** Downloads the available update, or opens the website when this build cannot update itself. */
  async download(): Promise<void> {
    if (this.statusValue.mode === 'manual') {
      await shell.openExternal(`${WEBSITE_URL}/#download`);
      return;
    }
    if (this.statusValue.mode !== 'auto' || this.statusValue.state !== 'available') return;
    this.userInitiated = true;
    this.update({ state: 'downloading', progress: 0 });
    try {
      await autoUpdater.downloadUpdate();
    } catch {
      // Reported through the 'error' event.
    }
  }

  /** Quits, installs the downloaded update and starts the new version. */
  install(): void {
    if (this.statusValue.state !== 'downloaded') return;
    // isSilent: no installer wizard; isForceRunAfter: reopen the app when done.
    setImmediate(() => autoUpdater.quitAndInstall(true, true));
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.firstTimer) clearTimeout(this.firstTimer);
    this.timer = null;
    this.firstTimer = null;
  }

  private applyPreferences(): void {
    // Portable / unsigned builds never download installers they cannot run.
    autoUpdater.autoDownload = this.statusValue.mode === 'auto' && this.preferences().autoDownload;
  }

  private schedule(): void {
    this.dispose();
    if (!this.preferences().autoCheck) return;
    if (!this.statusValue.lastChecked) this.firstTimer = setTimeout(() => void this.check(false), FIRST_CHECK_DELAY_MS);
    this.timer = setInterval(() => void this.check(false), CHECK_INTERVAL_MS);
  }

  private update(patch: Partial<UpdateStatus>): void {
    this.statusValue = { ...this.statusValue, ...patch };
    this.onChange();
  }
}

function detectMode(): UpdateStatus['mode'] {
  if (!app.isPackaged) return 'disabled';
  // electron-builder's portable exe sets this; it cannot replace itself.
  if (process.env['PORTABLE_EXECUTABLE_DIR']) return 'manual';
  return 'auto';
}

function friendlyError(error: Error): string {
  const text = error.message || String(error);
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ENETUNREACH|net::ERR_/i.test(text)) return 'No internet connection.';
  if (/404|Cannot find latest|No published versions/i.test(text)) return 'No published release was found.';
  if (/403|rate limit/i.test(text)) return 'GitHub is busy right now. Try again later.';
  return text.split('\n')[0]!.slice(0, 200);
}
