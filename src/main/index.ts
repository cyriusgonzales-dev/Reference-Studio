import { app, session, type BrowserWindow } from 'electron';
import { AppController } from './appController';
import { registerIpc } from './ipc';
import { createMainWindow } from './mainWindow';
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
 * ("native window occlusion"). A covered Presentation Output must keep
 * rendering for vMix capture, so the optimisation is disabled.
 */
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.setAppUserModelId('app.vmix-reference-studio');

registerPrivilegedSchemes();
installGlobalWebContentsGuards();

let controller: AppController | null = null;
let mainWindow: BrowserWindow | null = null;

if (!app.requestSingleInstanceLock()) {
  // A second copy would fight over the same data files and output display.
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
    installProtocolHandlers(research);

    mainWindow = createMainWindow();
    controller = new AppController(mainWindow, { research, media });
    registerIpc(controller, mainWindow);

    // Closing the operator window ends the session. The output window normally
    // hides instead of closing (so Alt+F4 cannot black out a live show), so it is
    // destroyed explicitly here rather than relying on the quit sequence.
    mainWindow.on('closed', () => {
      mainWindow = null;
      controller?.dispose();
      controller = null;
      app.quit();
    });

    controller.start().catch((error: Error) => {
      console.error('Startup task failed:', error);
    });
  });

  app.on('before-quit', () => {
    controller?.flush();
  });

  app.on('will-quit', () => {
    controller?.dispose();
    controller = null;
  });

  app.on('window-all-closed', () => app.quit());
}
