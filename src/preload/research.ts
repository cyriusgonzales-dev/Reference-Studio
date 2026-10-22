import { ipcRenderer } from 'electron';
import { RESEARCH_PICK_CHANNEL, RESEARCH_ROLE_CHANNEL } from '../shared/researchChannels';

/**
 * Runs in the isolated world of every page shown in the three search tabs.
 * It exposes nothing to the page. It only watches for genuine operator input
 * (event.isTrusted, so pages cannot fake clicks) and reports:
 *
 *  - Images tab:  a clicked image (and, shortly after, the full-size image
 *                 Google reveals in its preview pane).
 *  - YouTube tab: a clicked video link. The click is cancelled so the search
 *                 results stay open; the video plays in panel 2 instead.
 *  - Lyrics tab:  highlighted text.
 *
 * The main process validates every message and decides what to do with it.
 */

type Role = 'images' | 'youtube' | 'lyrics' | '';

// Only the top-level page is handled; ads and other embedded frames are ignored.
const role: Role = window.top === window ? (ipcRenderer.sendSync(RESEARCH_ROLE_CHANNEL) as Role) : '';

function send(payload: Record<string, unknown>): void {
  ipcRenderer.send(RESEARCH_PICK_CHANNEL, payload);
}

function isWebUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function isGoogleHost(host: string): boolean {
  return /(^|\.)(google\.[a-z.]+|gstatic\.com|googleusercontent\.com)$/i.test(host);
}

/* ------------------------------------------------------------------ */
/* Images                                                              */
/* ------------------------------------------------------------------ */

const MIN_IMAGE_SIZE = 50;

function imageAt(event: MouseEvent): HTMLImageElement | null {
  const direct = (event.target as Element | null)?.closest?.('img');
  if (direct instanceof HTMLImageElement) return direct;
  // Google often overlays thumbnails with transparent elements; look underneath.
  for (const el of document.elementsFromPoint(event.clientX, event.clientY)) {
    if (el instanceof HTMLImageElement) return el;
  }
  return null;
}

function usableSrc(img: HTMLImageElement): string | null {
  const src = img.currentSrc || img.src;
  if (isWebUrl(src) || src.startsWith('data:image/')) return src;
  return null;
}

/** Large, visible images on the page that are not Google's own thumbnails. */
function fullSizeCandidates(): Array<{ src: string; area: number }> {
  const found: Array<{ src: string; area: number }> = [];
  for (const img of Array.from(document.images)) {
    const src = img.currentSrc || img.src;
    if (!isWebUrl(src)) continue;
    const host = safeHost(src);
    if (!host || isGoogleHost(host) || !img.complete || img.naturalWidth < 200) continue;
    const r = img.getBoundingClientRect();
    if (r.width < 150 || r.height < 100) continue;
    found.push({ src, area: r.width * r.height });
  }
  return found;
}

let watchTimer = 0;

/**
 * After a thumbnail click, Google's preview pane loads the original image from
 * the source website. Watch briefly for it and report it as an upgrade.
 */
function watchForFullSize(pickId: string, before: Set<string>): void {
  window.clearInterval(watchTimer);
  const started = Date.now();
  watchTimer = window.setInterval(() => {
    const fresh = fullSizeCandidates()
      .filter((c) => !before.has(c.src))
      .sort((a, b) => b.area - a.area)[0];
    if (fresh) {
      window.clearInterval(watchTimer);
      send({ type: 'imageUpgrade', pickId, src: fresh.src });
    } else if (Date.now() - started > 5000) {
      window.clearInterval(watchTimer);
    }
  }, 250);
}

function onImageClick(event: MouseEvent): void {
  if (!event.isTrusted || event.button !== 0) return;
  const img = imageAt(event);
  if (!img) return;
  const rect = img.getBoundingClientRect();
  if (rect.width < MIN_IMAGE_SIZE || rect.height < MIN_IMAGE_SIZE) return;
  const src = usableSrc(img);
  if (!src) return;

  const link = img.closest('a');
  const href = link?.href ?? '';
  // Clicking an image that links to another website would leave the results; stay instead.
  if (link && isWebUrl(href)) {
    let host = '';
    try {
      host = new URL(href).hostname;
    } catch {
      /* ignore */
    }
    if (host && !isGoogleHost(host)) event.preventDefault();
  }

  const pickId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const before = new Set(fullSizeCandidates().map((c) => c.src));
  send({ type: 'image', pickId, src, alt: (img.alt || img.title || '').slice(0, 500), href: href.slice(0, 8000) });
  // A Google thumbnail was clicked: the original image may appear in the preview pane.
  if (src.startsWith('data:') || isGoogleHost(safeHost(src))) watchForFullSize(pickId, before);
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/* ------------------------------------------------------------------ */
/* YouTube                                                             */
/* ------------------------------------------------------------------ */

const VIDEO_PATH = /^\/(watch|shorts\/[\w-]{11}|live\/[\w-]{11})/;

function videoTitle(link: HTMLAnchorElement): string {
  const container = link.closest(
    'ytd-video-renderer, ytd-rich-item-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, ytd-reel-item-renderer, ytd-playlist-video-renderer, yt-lockup-view-model, ytm-shorts-lockup-view-model'
  );
  const titled = container?.querySelector<HTMLElement>('#video-title, h3, a[title]');
  const text = titled?.getAttribute('title') || titled?.textContent || link.getAttribute('title') || link.getAttribute('aria-label') || link.textContent || '';
  return text.replace(/\s+/g, ' ').trim().slice(0, 500);
}

function onVideoClick(event: MouseEvent): void {
  if (!event.isTrusted || event.button !== 0) return;
  const link = (event.target as Element | null)?.closest?.('a');
  if (!(link instanceof HTMLAnchorElement) || !link.href) return;
  let url: URL;
  try {
    url = new URL(link.href);
  } catch {
    return;
  }
  if (!/(^|\.)youtube\.com$|^youtu\.be$/i.test(url.hostname)) return;
  if (!VIDEO_PATH.test(url.pathname) && url.hostname !== 'youtu.be') return;
  if (url.pathname === '/watch' && !url.searchParams.get('v')) return;
  // Keep the results page; YouTube's own click handlers never see this click.
  event.preventDefault();
  event.stopImmediatePropagation();
  send({ type: 'video', href: url.toString(), title: videoTitle(link) });
}

/* ------------------------------------------------------------------ */
/* Lyrics                                                              */
/* ------------------------------------------------------------------ */

let lastSelection = '';

function reportSelection(event: Event): void {
  if (!event.isTrusted) return;
  window.setTimeout(() => {
    const text = window.getSelection()?.toString() ?? '';
    if (text.trim().length < 15 || text === lastSelection) return;
    lastSelection = text;
    send({ type: 'lyrics', text: text.slice(0, 20000), pageTitle: document.title.slice(0, 500) });
  }, 120);
}

/* ------------------------------------------------------------------ */

if (role === 'images') {
  window.addEventListener('click', onImageClick, true);
} else if (role === 'youtube') {
  window.addEventListener('click', onVideoClick, true);
} else if (role === 'lyrics') {
  window.addEventListener('mouseup', reportSelection, true);
  window.addEventListener('keyup', (e) => {
    if (e.shiftKey || e.key === 'Shift') reportSelection(e);
  }, true);
}
