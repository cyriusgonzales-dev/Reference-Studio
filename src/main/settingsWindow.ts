import { app, BrowserWindow } from 'electron';
import { isAppPageUrl, preloadPath, rendererPage } from './paths';
import { lockNavigation } from './security';

/**
 * The Settings window. It is a separate window because the search tabs and
 * players are native views drawn above the main page, so a dialog inside the
 * page would be hidden under them. Only one Settings window exists at a time.
 */
export class SettingsWindow {
  private window: BrowserWindow | null = null;

  constructor(private readonly parent: BrowserWindow) {}

  get webContents(): Electron.WebContents | null {
    return this.window && !this.window.isDestroyed() ? this.window.webContents : null;
  }

  open(section?: 'general' | 'slides' | 'updates' | 'about'): void {
    if (this.window && !this.window.isDestroyed()) {
      if (this.window.isMinimized()) this.window.restore();
      this.window.focus();
      if (section) this.window.webContents.send('app:settingsSection', section);
      return;
    }
    const win = new BrowserWindow({
      parent: this.parent,
      width: 760,
      height: 600,
      minWidth: 640,
      minHeight: 480,
      show: false,
      title: 'Settings',
      backgroundColor: '#0f1115',
      autoHideMenuBar: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      webPreferences: {
        preload: preloadPath('main'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        spellcheck: false,
        devTools: !app.isPackaged
      }
    });
    this.window = win;
    win.setMenu(null);
    lockNavigation(win.webContents, (url) => isAppPageUrl(url, 'settings'));
    win.once('ready-to-show', () => win.show());
    win.on('closed', () => {
      if (this.window === win) this.window = null;
    });

    const page = rendererPage('settings');
    const hash = section ?? 'general';
    if (page.kind === 'url') void win.loadURL(`${page.url}#${hash}`);
    else void win.loadFile(page.file, { hash });
  }

  close(): void {
    if (this.window && !this.window.isDestroyed()) this.window.close();
    this.window = null;
  }
}
