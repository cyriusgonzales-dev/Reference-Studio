import path from 'node:path';
import { app } from 'electron';

/** Locations of the bundled renderer page, preload scripts and data folders. */

const devServerUrl = process.env['ELECTRON_RENDERER_URL'];

export const isDev = !app.isPackaged && !!devServerUrl;

export function preloadPath(name: 'main' | 'research'): string {
  return path.join(__dirname, '../preload', `${name}.cjs`);
}

export function rendererPage(): { kind: 'url'; url: string } | { kind: 'file'; file: string } {
  if (isDev && devServerUrl) return { kind: 'url', url: `${devServerUrl.replace(/\/$/, '')}/index.html` };
  return { kind: 'file', file: path.join(__dirname, '../renderer/index.html') };
}

/** True when a URL is the application's own operator page. */
export function isAppPageUrl(url: string): boolean {
  const target = rendererPage();
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
