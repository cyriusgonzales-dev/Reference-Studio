import { protocol, type Session } from 'electron';
import { parseHttpUrl } from '../shared/urls';

/**
 * A private scheme registered only on the application's default session (the
 * operator UI). Remote pages live in other sessions and cannot reach it.
 *
 *  vrs-proxy://image/?u=<url>  Re-fetches a remote image through the research session when
 *                              a direct load fails (for example hotlink protection). The
 *                              response is passed to panels 2 and 3 and never written to disk.
 */

const MAX_PROXY_BYTES = 40 * 1024 * 1024;
const PROXY_TIMEOUT_MS = 20_000;

export function registerPrivilegedSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'vrs-proxy', privileges: { standard: true, secure: true } }
  ]);
}

export function installProtocolHandlers(researchSession: Session): void {
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

