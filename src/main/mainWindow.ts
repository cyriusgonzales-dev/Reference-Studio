import { app, BrowserWindow, screen } from 'electron';
import { isAppPageUrl, preloadPath, rendererPage } from './paths';
import { lockNavigation } from './security';

/** Creates the single application window (all three panels live inside it). */
export function createMainWindow(): BrowserWindow {
  const area = screen.getPrimaryDisplay().workArea;
  const win = new BrowserWindow({
    x: area.x,
    y: area.y,
    width: area.width,
    height: area.height,
    minWidth: 1100,
    minHeight: 680,
    show: false,
    title: 'Vmix Reference Studio',
    backgroundColor: '#0f1115',
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath('main'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: true,
      // Panel 3 must keep painting while the window is covered so vMix capture never freezes.
      backgroundThrottling: false,
      devTools: !app.isPackaged
    }
  });
  win.setMenu(null);
  lockNavigation(win.webContents, isAppPageUrl);
  win.once('ready-to-show', () => {
    win.maximize();
    win.show();
  });

  const page = rendererPage();
  if (page.kind === 'url') void win.loadURL(page.url);
  else void win.loadFile(page.file);
  return win;
}
