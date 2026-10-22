import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { ProgramState } from '../../../shared/types';
import { run } from './api';

/**
 * Reports an element's position so the main process can place a native view
 * (a search tab or a YouTube player) exactly over it. Native views are drawn
 * above the page, so the element itself only reserves the space.
 */
export function useViewBounds(ref: RefObject<HTMLElement | null>, view: 'research' | 'player' | 'output'): void {
  const last = useRef('');
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const send = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const rect = { view, x: r.left, y: r.top, width: r.width, height: r.height };
        const key = JSON.stringify(rect);
        if (key === last.current) return;
        last.current = key;
        run('view:setBounds', rect);
      });
    };
    send();
    const ro = new ResizeObserver(send);
    ro.observe(el);
    ro.observe(document.body);
    window.addEventListener('resize', send);
    const interval = window.setInterval(send, 500); // catches position-only layout shifts
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      window.removeEventListener('resize', send);
      window.clearInterval(interval);
    };
  }, [ref, view]);
}

function proxied(url: string): string | null {
  return /^https?:/i.test(url) ? `vrs-proxy://image/?${new URLSearchParams({ u: url }).toString()}` : null;
}

function load(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    img.onload = () => {
      img.decode().catch(() => undefined).then(() => resolve());
    };
    img.onerror = () => reject(new Error('failed'));
    img.src = src;
  });
}

/**
 * Picks the image URL that panels 2 and 3 display: the best URL, then the
 * same through the app's proxy (for hotlink-protected sites), then the
 * thumbnail. The previous picture stays up until the next one has loaded, so
 * the output never flashes.
 */
export function useResolvedImage(program: ProgramState): { src: string | null; failed: boolean } {
  const [result, setResult] = useState<{ src: string | null; failed: boolean }>({ src: null, failed: false });
  const url = program.kind === 'image' ? program.url : null;
  const fallback = program.kind === 'image' ? program.fallbackUrl : null;

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    const candidates = [url, proxied(url), fallback, fallback ? proxied(fallback) : null].filter((c): c is string => !!c);
    void (async () => {
      for (const candidate of candidates) {
        try {
          await load(candidate);
          if (!cancelled) setResult({ src: candidate, failed: false });
          return;
        } catch {
          // try the next candidate
        }
      }
      if (!cancelled) setResult((r) => ({ src: r.src, failed: true }));
    })();
    return () => {
      cancelled = true;
    };
  }, [url, fallback]);

  return program.kind === 'image' ? result : { src: null, failed: false };
}
