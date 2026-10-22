import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { net, protocol, type Session } from 'electron';
import { parseHttpUrl } from '../shared/urls';
import { assetsDirectory } from './paths';

/**
 * Two private schemes, registered only on the application's default session
 * (the operator UI and Presentation Output). Remote pages live in other
 * sessions and cannot reach them.
 *
 *  vrs-asset://local/<file>   Images the operator imported (e.g. a lyrics background).
 *  vrs-proxy://image?u=<url>  Re-fetches a remote image through the research session when
 *                             a direct load fails (for example hotlink protection). The
 *                             response is streamed to the output and never written to disk.
 */

const MAX_PROXY_BYTES = 40 * 1024 * 1024;
const PROXY_TIMEOUT_MS = 20_000;
const ASSET_NAME_RE = /^[a-z0-9-]+\.(png|jpe?g|gif|webp|bmp|avif)$/i;

export function registerPrivilegedSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'vrs-asset', privileges: { standard: true, secure: true } },
    { scheme: 'vrs-proxy', privileges: { standard: true, secure: true } }
  ]);
}

export function proxiedImageUrl(url: string, referrer?: string): string {
  const params = new URLSearchParams({ u: url });
  if (referrer) params.set('r', referrer);
  return `vrs-proxy://image/?${params.toString()}`;
}

export function installProtocolHandlers(researchSession: Session): void {
  protocol.handle('vrs-asset', async (request) => {
    const url = new URL(request.url);
    const name = decodeURIComponent(url.pathname.replace(/^\//, ''));
    if (url.hostname !== 'local' || !ASSET_NAME_RE.test(name)) return new Response('Not found', { status: 404 });
    const file = path.join(assetsDirectory(), name);
    if (!fs.existsSync(file)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });

  protocol.handle('vrs-proxy', async (request) => {
    const url = new URL(request.url);
    const target = parseHttpUrl(url.searchParams.get('u') ?? '');
    if (url.hostname !== 'image' || !target) return new Response('Bad request', { status: 400 });
    const referrer = parseHttpUrl(url.searchParams.get('r') ?? '');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);
    try {
      const headers: Record<string, string> = { Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8' };
      if (referrer) headers['Referer'] = referrer.toString();
      const upstream = await researchSession.fetch(target.toString(), { headers, signal: controller.signal });
      if (!upstream.ok) return new Response(`Upstream ${upstream.status}`, { status: 502 });
      const type = upstream.headers.get('content-type') ?? '';
      if (!type.toLowerCase().startsWith('image/')) return new Response('Not an image', { status: 415 });
      const length = Number(upstream.headers.get('content-length') ?? '0');
      if (length > MAX_PROXY_BYTES) return new Response('Image too large', { status: 413 });
      const body = await upstream.arrayBuffer();
      if (body.byteLength > MAX_PROXY_BYTES) return new Response('Image too large', { status: 413 });
      return new Response(body, { status: 200, headers: { 'Content-Type': type, 'Cache-Control': 'no-store' } });
    } catch (error) {
      return new Response(`Fetch failed: ${(error as Error).message}`, { status: 502 });
    } finally {
      clearTimeout(timer);
    }
  });
}

/** Copies an operator-chosen image into the asset folder and returns its vrs-asset URL. */
export function importAsset(sourceFile: string, id: string): string {
  const ext = path.extname(sourceFile).toLowerCase().replace('.', '');
  const name = `${id}.${ext}`;
  if (!ASSET_NAME_RE.test(name)) throw new Error('Unsupported image type.');
  const stats = fs.statSync(sourceFile);
  if (stats.size > 25 * 1024 * 1024) throw new Error('The image is larger than 25 MB.');
  fs.mkdirSync(assetsDirectory(), { recursive: true });
  fs.copyFileSync(sourceFile, path.join(assetsDirectory(), name));
  return `vrs-asset://local/${name}`;
}
