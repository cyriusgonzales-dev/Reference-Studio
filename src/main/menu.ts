import { app, Menu, shell, type MenuItemConstructorOptions } from 'electron';
import { RELEASES_URL, WEBSITE_URL } from '../shared/product';

export interface MenuActions {
  openSettings(section?: 'general' | 'slides' | 'updates' | 'about'): void;
  checkForUpdates(): void;
}

/**
 * The application menu. Windows shows no menu bar (the app is one full-screen
 * workspace). macOS always has a menu bar, and without Edit items the standard
 * ⌘C / ⌘V / ⌘A / ⌘Z shortcuts would not work in text fields.
 */
export function installAppMenu(actions: MenuActions): void {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
    return;
  }
  const template: MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { label: `About ${app.name}`, click: () => actions.openSettings('about') },
        { label: 'Check for Updates…', click: () => actions.checkForUpdates() },
        { type: 'separator' },
        // ⌘, is handled by the app's own shortcut handler so it also works inside web pages.
        { label: 'Settings…', accelerator: 'Cmd+,', registerAccelerator: false, click: () => actions.openSettings() },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }]
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        { label: 'Website', click: () => void shell.openExternal(WEBSITE_URL) },
        { label: 'Release Notes', click: () => void shell.openExternal(RELEASES_URL) }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
