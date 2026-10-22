import { parseGoogleImgresLink, parseYouTubeVideo, titleFromImageUrl } from './urls';

/**
 * Turns what the operator clicked in a search tab into something panels 2
 * and 3 can show, using only what the page itself shows (no hidden APIs).
 */

export interface ImagePick {
  src: string;
  alt: string;
  href: string;
}

export interface ResolvedImage {
  title: string;
  url: string;
  fallbackUrl: string | null;
}

/**
 * The clicked <img> is usually a thumbnail. When it sits inside a Google
 * "imgres" link, that link names the original image, which is preferred; the
 * thumbnail is kept as a fallback in case the original cannot be loaded.
 */
export function resolveImagePick(pick: ImagePick): ResolvedImage {
  const original = pick.href ? parseGoogleImgresLink(pick.href)?.imageUrl : undefined;
  const url = original ?? pick.src;
  const title = (pick.alt.trim() || titleFromImageUrl(url)).slice(0, 200) || 'Image';
  return { title, url, fallbackUrl: original ? pick.src : null };
}

export interface ResolvedVideo {
  videoId: string;
  startSeconds: number;
  title: string;
}

export function resolveVideoLink(href: string, title: string): ResolvedVideo | null {
  const parsed = parseYouTubeVideo(href);
  if (!parsed) return null;
  return { videoId: parsed.videoId, startSeconds: parsed.startSeconds ?? 0, title: cleanVideoTitle(title) || 'YouTube video' };
}

/** YouTube's accessible link text ends with the spoken duration ("… 3 minutes, 49 seconds"); drop it. */
export function cleanVideoTitle(title: string): string {
  const unit = String.raw`\d+\s+(?:hours?|minutes?|seconds?)`;
  return title
    .replace(new RegExp(String.raw`\s+${unit}(?:,?\s+${unit})*\s*$`, 'i'), '')
    .replace(/\s*-\s*YouTube\s*$/i, '')
    .trim()
    .slice(0, 200);
}
