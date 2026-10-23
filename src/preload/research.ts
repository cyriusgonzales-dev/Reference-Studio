import { ipcRenderer } from 'electron';
import { RESEARCH_COLLECT_CHANNEL, RESEARCH_PICK_CHANNEL, RESEARCH_ROLE_CHANNEL } from '../shared/researchChannels';

/**
 * Runs in the isolated world of every page shown in the four search tabs.
 * It exposes nothing to the page. It only watches for genuine operator input
 * (event.isTrusted, so pages cannot fake clicks) and reports:
 *
 *  - Images tab:  a clicked image (and, shortly after, the full-size image
 *                 Google reveals in its preview pane).
 *  - YouTube tab: a clicked video link. The click is cancelled so the search
 *                 results stay open; the video plays in panel 2 instead.
 *  - Lyrics tab:  highlighted text. On Google results it also hides everything
 *                 below the first web result that is not a lyrics page.
 *  - Research tab: highlighted text, with the source details the page itself
 *                 declares (publisher, title, publication date).
 *
 * The main process validates every message and decides what to do with it.
 */

type Role = 'images' | 'youtube' | 'lyrics' | 'research' | '';

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

/*
 * On Google's results for a song, everything above the first web result stays
 * (the AI overview and Google's lyrics box). Below it, only results that are
 * lyrics pages stay; videos, social posts and "People also search for" are
 * hidden. Hiding is done with CSS on this page only; nothing is blocked.
 */

const VIDEO_OR_SOCIAL_HOST = /(^|\.)(youtube\.com|youtu\.be|tiktok\.com|facebook\.com|fb\.watch|instagram\.com|x\.com|twitter\.com|brainly\.[a-z.]+|quora\.com)$/i;
const LYRICS_WORDS = /lyric|liriko|titik|letra|chords|paroles|songtext|hymn/i;
const LYRICS_HOST = /(^|\.)(genius\.com|azlyrics\.com|musixmatch\.com|lyrics\.com|songlyrics\.com|lyricstranslate\.com|hymnal\.net|hymnary\.org|letras\.com)$/i;
const HIDDEN_CLASS = 'vrs-lyrics-hidden';

/** The site a result link leads to, looking through Google's "/url?q=" redirects. */
function linkHost(a: HTMLAnchorElement): string {
  const host = safeHost(a.href).toLowerCase();
  if (isGoogleHost(host)) {
    try {
      const target = new URL(a.href).searchParams.get('q') ?? new URL(a.href).searchParams.get('url');
      if (target && isWebUrl(target)) return safeHost(target).toLowerCase();
    } catch {
      /* ignore */
    }
  }
  return host;
}

/** External result links in a block (Google's own links are ignored). */
function externalLinks(block: Element): HTMLAnchorElement[] {
  return Array.from(block.querySelectorAll<HTMLAnchorElement>('a[href]')).filter((a) => isWebUrl(a.href) && !isGoogleHost(linkHost(a)));
}

/**
 * Google's AI overview, recognised by its markup rather than its heading, which
 * is translated ("AI Overview", "AI na Overview"). It is always kept: it lists
 * its sources (videos among them), so it can look like a video strip.
 */
const AI_OVERVIEW = '#m-x-content, [data-subtree="mfc"], [data-attnms]';

function holdsAiOverview(block: Element): boolean {
  return block.matches(AI_OVERVIEW) || !!block.querySelector(AI_OVERVIEW);
}

/** Google labels video and social results with the platform's name ("YouTube · Channel"), in every language. */
const PLATFORM_LABEL = /(YouTube|TikTok|Facebook|Instagram)\s*·/;

/** A strip of videos or images, or a single video/social post. */
function isMediaBlock(block: Element): boolean {
  if (block.querySelector('a[href*="udm=2"], a[href*="tbm=isch"]')) return true;
  if (PLATFORM_LABEL.test(block.textContent ?? '')) return true;
  const links = externalLinks(block);
  return links.length > 0 && links.every((a) => VIDEO_OR_SOCIAL_HOST.test(linkHost(a)));
}

/**
 * The site a web result belongs to. Google sometimes hides the address behind
 * an opaque "/goto" link, so the address it shows under the title is used then.
 */
function resultHost(block: Element, link: HTMLAnchorElement): string {
  const host = linkHost(link);
  if (!isGoogleHost(host)) return host;
  const shown = block.querySelector('cite')?.textContent?.trim().split(/\s/)[0] ?? '';
  return safeHost(/^https?:\/\//i.test(shown) ? shown : `https://${shown}`).toLowerCase();
}

function isLyricsResult(block: Element): boolean {
  const link = Array.from(block.querySelectorAll<HTMLAnchorElement>('a[href]')).find((a) => a.querySelector('h3'));
  if (!link) return false;
  const host = resultHost(block, link);
  if (VIDEO_OR_SOCIAL_HOST.test(host) || PLATFORM_LABEL.test(block.textContent ?? '')) return false;
  return LYRICS_HOST.test(host) || LYRICS_WORDS.test(`${link.querySelector('h3')?.textContent ?? ''} ${host}`);
}

/** Below the results: hides everything except the page numbers, which can share a container with other blocks. */
function filterBelowResults(container: Element, depth: number): void {
  for (const block of Array.from(container.children)) {
    if (block.getAttribute('role') === 'navigation') continue;
    const holdsPageNumbers = !!block.querySelector('[role="navigation"]');
    block.classList.toggle(HIDDEN_CLASS, !holdsPageNumbers);
    if (holdsPageNumbers && depth < 6) filterBelowResults(block, depth + 1);
  }
}

function filterLyricsResults(): void {
  const results = document.getElementById('rso');
  if (!results) return;
  let seenWebResult = false;
  for (const block of Array.from(results.children)) {
    const isWebResult = !!block.querySelector('a[href] h3');
    let hide: boolean;
    if (holdsAiOverview(block)) hide = false;
    else if (!seenWebResult && !isWebResult) hide = isMediaBlock(block);
    else hide = !(isWebResult && isLyricsResult(block));
    if (isWebResult) seenWebResult = true;
    block.classList.toggle(HIDDEN_CLASS, hide);
  }
  const below = document.getElementById('botstuff');
  if (below) filterBelowResults(below, 0);
}

function startLyricsFilter(): void {
  if (!isGoogleHost(location.hostname) || location.pathname !== '/search') return;
  // Only plain web searches: Images, Videos and other Google tabs are left alone.
  const udm = new URLSearchParams(location.search).get('udm');
  if ((udm && udm !== '0') || new URLSearchParams(location.search).get('tbm')) return;
  const style = document.createElement('style');
  style.textContent = `.${HIDDEN_CLASS} { display: none !important; }`;
  let timer = 0;
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(filterLyricsResults, 100);
  };
  const start = () => {
    document.head.appendChild(style);
    filterLyricsResults();
    // Google adds and replaces results after loading.
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}

/* ------------------------------------------------------------------ */
/* Research                                                            */
/* ------------------------------------------------------------------ */

const trimmed = (value: string | null | undefined, max = 500) => (value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

function metaContent(...selectors: string[]): string {
  for (const selector of selectors) {
    const value = document.querySelector<HTMLMetaElement>(selector)?.content;
    if (value && value.trim()) return trimmed(value);
  }
  return '';
}

/** The first schema.org object (JSON-LD) on the page that describes an article or web page. */
function structuredData(): { headline: string; publisher: string; published: string; modified: string } {
  const result = { headline: '', publisher: '', published: '', modified: '' };
  const visit = (node: unknown, depth: number): void => {
    if (depth > 6 || !node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }
    const obj = node as Record<string, unknown>;
    if (!result.headline && typeof obj.headline === 'string') result.headline = trimmed(obj.headline);
    if (!result.published && typeof obj.datePublished === 'string') result.published = trimmed(obj.datePublished, 100);
    if (!result.modified && typeof obj.dateModified === 'string') result.modified = trimmed(obj.dateModified, 100);
    const publisher = obj.publisher as Record<string, unknown> | undefined;
    if (!result.publisher && publisher && typeof publisher === 'object' && typeof publisher.name === 'string') result.publisher = trimmed(publisher.name);
    if (obj['@graph']) visit(obj['@graph'], depth + 1);
  };
  for (const script of Array.from(document.querySelectorAll('script[type="application/ld+json"]')).slice(0, 10)) {
    try {
      visit(JSON.parse(script.textContent ?? ''), 0);
    } catch {
      // malformed JSON-LD is ignored
    }
  }
  return result;
}

/** On a Google results page: the single result that contains the highlighted text, if any. */
function googleResultFor(selection: Selection): { href: string; title: string } | null {
  let el: Element | null = selection.anchorNode instanceof Element ? selection.anchorNode : (selection.anchorNode?.parentElement ?? null);
  for (let depth = 0; el && depth < 12; depth++, el = el.parentElement) {
    // Google's dictionary box credits its definitions to Oxford Languages and links to it.
    const dictionary = el.querySelector<HTMLAnchorElement>('a[href*="languages.oup.com"]');
    if (dictionary && isWebUrl(dictionary.href)) {
      return { href: dictionary.href.slice(0, 8000), title: trimmed(el.querySelector('[data-dobid="hdw"]')?.textContent) };
    }
    const links = Array.from(el.querySelectorAll('a[href]')).filter((a) => a.querySelector('h3'));
    if (links.length === 0) continue;
    // A block holding several results (or Google's AI overview) cannot be attributed to one source.
    if (links.length > 1) return null;
    const link = links[0] as HTMLAnchorElement;
    if (!isWebUrl(link.href)) return null;
    return { href: link.href.slice(0, 8000), title: trimmed(link.querySelector('h3')?.textContent) };
  }
  return null;
}

function pageInfo(selection: Selection | null) {
  const data = structuredData();
  const firstTime = document.querySelector('article time[datetime], main time[datetime]')?.getAttribute('datetime');
  return {
    url: location.href.slice(0, 8000),
    documentTitle: trimmed(document.title),
    title: metaContent('meta[name="citation_title"]', 'meta[property="og:title"]', 'meta[name="twitter:title"]') || data.headline,
    siteName: metaContent('meta[property="og:site_name"]', 'meta[name="application-name"]'),
    publisher: data.publisher || metaContent('meta[name="citation_publisher"]', 'meta[name="citation_journal_title"]', 'meta[name="DC.publisher"]'),
    published: trimmed(
      metaContent(
        'meta[name="citation_publication_date"]',
        'meta[name="citation_date"]',
        'meta[property="article:published_time"]',
        'meta[name="article:published_time"]',
        'meta[itemprop="datePublished"]',
        'meta[name="DC.date.issued"]',
        'meta[name="dcterms.date"]',
        'meta[name="date"]'
      ) ||
        data.published ||
        firstTime,
      100
    ),
    modified: trimmed(metaContent('meta[property="article:modified_time"]', 'meta[property="og:updated_time"]', 'meta[itemprop="dateModified"]') || data.modified, 100),
    result: selection && isGoogleHost(location.hostname) ? googleResultFor(selection) : null
  };
}

let lastResearch = '';

function sendResearch(explicit: boolean): void {
  const selection = window.getSelection();
  const text = selection?.toString() ?? '';
  if (!explicit && (text.trim().length < 15 || text === lastResearch)) return;
  lastResearch = text;
  send({ type: 'research', text: text.slice(0, 20000), explicit, page: pageInfo(selection) });
}

function reportResearch(event: Event): void {
  if (!event.isTrusted) return;
  window.setTimeout(() => sendResearch(false), 120);
}

/* ------------------------------------------------------------------ */

if (role === 'images') {
  window.addEventListener('click', onImageClick, true);
} else if (role === 'youtube') {
  window.addEventListener('click', onVideoClick, true);
} else if (role === 'lyrics') {
  startLyricsFilter();
  window.addEventListener('mouseup', reportSelection, true);
  window.addEventListener('keyup', (e) => {
    if (e.shiftKey || e.key === 'Shift') reportSelection(e);
  }, true);
} else if (role === 'research') {
  window.addEventListener('mouseup', reportResearch, true);
  window.addEventListener('keyup', (e) => {
    if (e.shiftKey || e.key === 'Shift') reportResearch(e);
  }, true);
  // The operator pressed "Use highlighted text" or used the right-click menu.
  ipcRenderer.on(RESEARCH_COLLECT_CHANNEL, () => sendResearch(true));
}
