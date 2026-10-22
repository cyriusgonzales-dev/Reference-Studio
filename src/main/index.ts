import { app, session, type BrowserWindow } from 'electron';
import { Controller } from './controller';
import { registerIpc } from './ipc';
import { createMainWindow } from './mainWindow';
import { preloadPath } from './paths';
import { installProtocolHandlers, registerPrivilegedSchemes } from './protocols';
import {
  hardenAppSession,
  hardenRemoteSession,
  installGlobalWebContentsGuards,
  MEDIA_PARTITION,
  RESEARCH_PARTITION
} from './security';

/*
 * Chromium on Windows stops painting windows it believes are fully covered
 * ("native window occlusion"). The vMix panel must keep rendering even when
 * another window is in front, so the optimisation is disabled.
 */
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.setAppUserModelId('app.vmix-reference-studio');

registerPrivilegedSchemes();
installGlobalWebContentsGuards();

let controller: Controller | null = null;
let mainWindow: BrowserWindow | null = null;

if (!app.requestSingleInstanceLock()) {
  // A second copy would fight over the same data files.
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  void app.whenReady().then(() => {
    hardenAppSession();
    const research = session.fromPartition(RESEARCH_PARTITION);
    const media = session.fromPartition(MEDIA_PARTITION);
    hardenRemoteSession(research);
    hardenRemoteSession(media);
    // Reports genuine clicks and selections in the search tabs (exposes nothing to pages).
    research.registerPreloadScript({ type: 'frame', filePath: preloadPath('research') });
    installProtocolHandlers(research);

    mainWindow = createMainWindow();
    controller = new Controller(mainWindow, { research, media });
    registerIpc(controller, mainWindow);
    const ctl = controller;
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown' && ctl.handleKey(input, 'web')) event.preventDefault();
    });

    mainWindow.on('closed', () => {
      mainWindow = null;
      controller?.dispose();
      controller = null;
      app.quit();
    });

    controller.start().catch((error: Error) => console.error('Startup task failed:', error));
  });

  app.on('before-quit', () => {
    controller?.dispose();
    controller = null;
  });

  app.on('window-all-closed', () => app.quit());
}
