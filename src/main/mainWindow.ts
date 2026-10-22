import { app, BrowserWindow, screen } from 'electron';
import { isAppPageUrl, preloadPath, rendererPage } from './paths';
import { lockNavigation } from './security';

/** Creates the operator window on the primary display. */
export function createMainWindow(): BrowserWindow {
  const primary = screen.getPrimaryDisplay().workArea;
  const width = Math.min(1600, primary.width);
  const height = Math.min(1000, primary.height);
  const win = new BrowserWindow({
    x: Math.round(primary.x + (primary.width - width) / 2),
    y: Math.round(primary.y + (primary.height - height) / 2),
    width,
    height,
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
      devTools: !app.isPackaged
    }
  });
  win.setMenu(null);
  lockNavigation(win.webContents, (url) => isAppPageUrl(url, 'index'));
  win.once('ready-to-show', () => {
    win.maximize();
    win.show();
  });

  const page = rendererPage('index');
  if (page.kind === 'url') void win.loadURL(page.url);
  else void win.loadFile(page.file);
  return win;
}
