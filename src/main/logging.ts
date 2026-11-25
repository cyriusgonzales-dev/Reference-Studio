import path from 'node:path';
import { app } from 'electron';
import log from 'electron-log/main';

/**
 * Writes the app's console output and any uncaught errors to a log file, so a
 * problem at a live event can be diagnosed afterwards (Settings → About → Open logs).
 *   Windows: %APPDATA%\Vmix Reference Studio\logs\main.log
 *   macOS:   ~/Library/Logs/Vmix Reference Studio/main.log
 */
export function initLogging(): void {
  log.initialize();
  log.transports.file.level = 'info';
  log.transports.file.maxSize = 5 * 1024 * 1024;
  log.transports.console.level = app.isPackaged ? false : 'debug';
  Object.assign(console, log.functions);
  log.errorHandler.startCatching({ showDialog: false });
  log.info(`Starting ${app.getName()} ${app.getVersion()} (${process.platform} ${process.arch}, Electron ${process.versions.electron})`);
}

export function logsDirectory(): string {
  return path.dirname(log.transports.file.getFile().path);
}
