import path from 'node:path';
import { app } from 'electron';

/** Locations of the bundled renderer page, preload scripts and data folders. */

const devServerUrl = process.env['ELECTRON_RENDERER_URL'];

export const isDev = !app.isPackaged && !!devServerUrl;

export function preloadPath(name: 'main' | 'research' | 'outputPage' | 'audioTap'): string {
  return path.join(__dirname, '../preload', `${name}.cjs`);
}

/** "index" is the operator window; "output" is the offscreen page drawn for NDI. */
export type AppPage = 'index' | 'output';

export function rendererPage(page: AppPage = 'index'): { kind: 'url'; url: string } | { kind: 'file'; file: string } {
  if (isDev && devServerUrl) return { kind: 'url', url: `${devServerUrl.replace(/\/$/, '')}/${page}.html` };
  return { kind: 'file', file: path.join(__dirname, `../renderer/${page}.html`) };
}

/** True when a URL is one of the application's own pages. */
export function isAppPageUrl(url: string, page: AppPage = 'index'): boolean {
  const target = rendererPage(page);
  try {
    const actual = new URL(url);
    if (target.kind === 'url') {
      const expected = new URL(target.url);
      return actual.origin === expected.origin && actual.pathname === expected.pathname;
    }
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

export function adblockCacheDirectory(): string {
  return path.join(app.getPath('userData'), 'adblock');
}
