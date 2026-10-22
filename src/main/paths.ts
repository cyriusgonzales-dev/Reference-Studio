import path from 'node:path';
import { app } from 'electron';

/** Locations of the bundled renderer pages and preload scripts. */

const devServerUrl = process.env['ELECTRON_RENDERER_URL'];

export const isDev = !app.isPackaged && !!devServerUrl;

export function preloadPath(name: 'main' | 'output'): string {
  return path.join(__dirname, '../preload', `${name}.cjs`);
}

export function rendererPage(name: 'index' | 'output'): { kind: 'url'; url: string } | { kind: 'file'; file: string } {
  if (isDev && devServerUrl) return { kind: 'url', url: `${devServerUrl.replace(/\/$/, '')}/${name}.html` };
  return { kind: 'file', file: path.join(__dirname, '../renderer', `${name}.html`) };
}

/** True when a URL belongs to the application's own renderer pages. */
export function isAppPageUrl(url: string, page: 'index' | 'output'): boolean {
  const target = rendererPage(page);
  if (target.kind === 'url') {
    try {
      const actual = new URL(url);
      const expected = new URL(target.url);
      return actual.origin === expected.origin && actual.pathname === expected.pathname;
    } catch {
      return false;
    }
  }
  try {
    const actual = new URL(url);
    if (actual.protocol !== 'file:') return false;
    const actualPath = path.normalize(decodeURIComponent(actual.pathname).replace(/^\/([A-Za-z]:)/, '$1'));
    return actualPath.toLowerCase() === path.normalize(target.file).toLowerCase();
  } catch {
    return false;
  }
}

export function dataDirectory(): string {
  return path.join(app.getPath('userData'), 'data');
}

export function assetsDirectory(): string {
  return path.join(app.getPath('userData'), 'assets');
}

export function adblockCacheDirectory(): string {
  return path.join(app.getPath('userData'), 'adblock');
}
