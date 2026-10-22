export type SearchMode = 'images' | 'youtube' | 'web';
export type SearchEngine = 'google' | 'duckduckgo' | 'bing';

/** Largest data: image URL accepted for presentation (characters). */
export const MAX_DATA_IMAGE_URL_LENGTH = 6 * 1024 * 1024;
/** Largest URL accepted in general. */
export const MAX_URL_LENGTH = 8192;

const DATA_IMAGE_PREFIX_RE = /^data:image\/(png|jpe?g|gif|webp|avif|bmp|svg\+xml);base64,/i;
const BASE64_RE = /^[A-Za-z0-9+/=\s]+$/;
const BLOCKED_SCHEME_RE = /^(javascript|file|data|vbscript|chrome|devtools|about|blob|view-source):/i;
const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/** Parses an absolute http(s) URL. Returns null for every other scheme or malformed input. */
export function parseHttpUrl(input: string): URL | null {
  if (typeof input !== 'string' || input.length === 0 || input.length > MAX_URL_LENGTH) return null;
  try {
    const url = new URL(input);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname) return null;
    if (url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

export function isHttpUrl(input: string): boolean {
  return parseHttpUrl(input) !== null;
}

/** Accepts http(s) image URLs and base64 data: image URLs within the size limit. */
export function isAllowedImageUrl(input: string): boolean {
  if (typeof input !== 'string') return false;
  if (input.startsWith('data:')) {
    if (input.length > MAX_DATA_IMAGE_URL_LENGTH) return false;
    const prefix = DATA_IMAGE_PREFIX_RE.exec(input);
    if (!prefix) return false;
    const payload = input.slice(prefix[0].length);
    return payload.length > 0 && BASE64_RE.test(payload);
  }
  return isHttpUrl(input);
}

/** Heuristic used by the address bar: does the input look like a URL rather than search terms? */
export function looksLikeUrl(input: string): boolean {
  const text = input.trim();
  if (!text || /\s/.test(text)) return false;
  if (/^https?:\/\//i.test(text)) return true;
  if (/^localhost(:\d+)?(\/.*)?$/i.test(text)) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/.*)?$/.test(text)) return true;
  return /^([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?([/?#].*)?$/i.test(text);
}

export function buildSearchUrl(query: string, mode: SearchMode, engine: SearchEngine): string {
  const q = encodeURIComponent(query.trim());
  switch (mode) {
    case 'images':
      return `https://www.google.com/search?tbm=isch&q=${q}`;
    case 'youtube':
      return `https://www.youtube.com/results?search_query=${q}`;
    case 'web':
      switch (engine) {
        case 'duckduckgo':
          return `https://duckduckgo.com/?q=${q}`;
        case 'bing':
          return `https://www.bing.com/search?q=${q}`;
        default:
          return `https://www.google.com/search?q=${q}`;
      }
  }
}

/**
 * Converts what the operator typed into a URL to load in the research view.
 * URLs navigate directly in every mode; anything else is searched using the mode.
 * Returns null when the input is empty or would resolve to a disallowed scheme.
 */
export function resolveAddressInput(input: string, mode: SearchMode, engine: SearchEngine): string | null {
  const text = input.trim();
  if (!text) return null;
  // Local and script schemes are never navigated from the address bar.
  if (BLOCKED_SCHEME_RE.test(text)) return null;
  if (looksLikeUrl(text)) {
    const candidate = /^https?:\/\//i.test(text) ? text : `https://${text}`;
    const parsed = parseHttpUrl(candidate);
    return parsed ? parsed.toString() : null;
  }
  return buildSearchUrl(text, mode, engine);
}

/** Returns the search mode the current page belongs to, used to keep the selector in sync. */
export function inferSearchMode(url: string): SearchMode | null {
  const parsed = parseHttpUrl(url);
  if (!parsed) return null;
  if (isYouTubeHost(parsed.hostname)) return 'youtube';
  if (/(^|\.)google\.[a-z.]+$/i.test(parsed.hostname)) {
    if (parsed.searchParams.get('tbm') === 'isch' || parsed.searchParams.get('udm') === '2') return 'images';
    if (parsed.pathname.startsWith('/imghp')) return 'images';
  }
  return null;
}

/** Extracts the search query from a Google/YouTube/Bing/DDG results URL. */
export function extractSearchQuery(url: string): string | null {
  const parsed = parseHttpUrl(url);
  if (!parsed) return null;
  return parsed.searchParams.get('search_query') ?? parsed.searchParams.get('q');
}

/* ------------------------------------------------------------------ */
/* YouTube                                                             */
/* ------------------------------------------------------------------ */

export function isYouTubeHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === 'youtube.com' ||
    host.endsWith('.youtube.com') ||
    host === 'youtu.be' ||
    host === 'youtube-nocookie.com' ||
    host.endsWith('.youtube-nocookie.com')
  );
}

export function isValidYouTubeId(id: string): boolean {
  return YOUTUBE_ID_RE.test(id);
}

/** Parses "90", "90s", "1m30s", "1h2m3s" into seconds. */
export function parseYouTubeTime(value: string | null): number | undefined {
  if (!value) return undefined;
  if (/^\d+$/.test(value)) return Number(value);
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
  if (!match || (!match[1] && !match[2] && !match[3])) return undefined;
  return Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
}

export interface ParsedYouTubeVideo {
  videoId: string;
  startSeconds?: number;
}

/** Recognises watch, short, embed, live and youtu.be links. Returns null for anything else. */
export function parseYouTubeVideo(input: string): ParsedYouTubeVideo | null {
  const url = parseHttpUrl(input);
  if (!url || !isYouTubeHost(url.hostname)) return null;
  const start = parseYouTubeTime(url.searchParams.get('t') ?? url.searchParams.get('start'));
  let id: string | null;
  if (url.hostname.toLowerCase() === 'youtu.be') {
    id = url.pathname.split('/')[1] ?? null;
  } else if (url.pathname === '/watch') {
    id = url.searchParams.get('v');
  } else {
    const match = /^\/(shorts|embed|live|v)\/([^/?#]+)/.exec(url.pathname);
    id = match?.[2] ?? null;
  }
  if (!id || !isValidYouTubeId(id)) return null;
  return start !== undefined && start > 0 ? { videoId: id, startSeconds: start } : { videoId: id };
}

export function youtubeWatchUrl(videoId: string, startSeconds?: number): string {
  const t = startSeconds && startSeconds > 0 ? `&t=${Math.floor(startSeconds)}s` : '';
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}${t}`;
}

export interface EmbedOptions {
  startSeconds?: number;
  /** Show YouTube's controls and allow its keyboard shortcuts (operator player). */
  controls: boolean;
}

export function youtubeEmbedUrl(videoId: string, options: EmbedOptions): string {
  const params = new URLSearchParams({
    autoplay: '1',
    rel: '0',
    playsinline: '1',
    modestbranding: '1',
    iv_load_policy: '3',
    fs: '0',
    disablekb: options.controls ? '0' : '1',
    controls: options.controls ? '1' : '0'
  });
  if (options.startSeconds && options.startSeconds > 0) params.set('start', String(Math.floor(options.startSeconds)));
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?${params.toString()}`;
}

export function youtubeThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`;
}

/** Strips YouTube's " - YouTube" suffix and notification counters from a page title. */
export function cleanYouTubeTitle(title: string): string {
  return title
    .replace(/^\(\d+\)\s*/, '')
    .replace(/\s*-\s*YouTube\s*$/i, '')
    .trim();
}

/* ------------------------------------------------------------------ */
/* Google Images helpers                                               */
/* ------------------------------------------------------------------ */

/** Google's result thumbnails are served from encrypted-tbnN.gstatic.com and are small previews. */
export function isGoogleThumbnailUrl(input: string): boolean {
  const url = parseHttpUrl(input);
  return !!url && /^encrypted-tbn\d+\.gstatic\.com$/i.test(url.hostname);
}

/** Google "imgres" links carry the original image URL and its page as query parameters. */
export function parseGoogleImgresLink(input: string): { imageUrl: string; sourcePageUrl?: string } | null {
  const url = parseHttpUrl(input);
  if (!url || !/(^|\.)google\.[a-z.]+$/i.test(url.hostname) || url.pathname !== '/imgres') return null;
  const imageUrl = url.searchParams.get('imgurl');
  if (!imageUrl || !isHttpUrl(imageUrl)) return null;
  const ref = url.searchParams.get('imgrefurl');
  return ref && isHttpUrl(ref) ? { imageUrl, sourcePageUrl: ref } : { imageUrl };
}

/** A readable title for an image derived from its URL. */
export function titleFromImageUrl(input: string): string {
  if (input.startsWith('data:')) return 'Embedded image';
  const url = parseHttpUrl(input);
  if (!url) return 'Image';
  const last = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() ?? '');
  const name = last.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[-_]+/g, ' ').trim();
  return name && name.length <= 80 && !/^[a-z0-9]{20,}$/i.test(name) ? name : url.hostname;
}

export function hostnameOf(input: string): string {
  return parseHttpUrl(input)?.hostname ?? '';
}
