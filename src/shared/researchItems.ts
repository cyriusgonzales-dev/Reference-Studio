import type { ImageItem, VideoItem } from './types';
import {
  hostnameOf,
  isAllowedImageUrl,
  isHttpUrl,
  parseGoogleImgresLink,
  parseYouTubeVideo,
  titleFromImageUrl,
  youtubeThumbnailUrl,
  youtubeWatchUrl
} from './urls';

/**
 * Turns what the operator right-clicked in the research browser into
 * presentable items, using only the metadata Chromium supplies with the
 * context menu (no scraping of hidden APIs).
 */

/** The subset of Electron's ContextMenuParams used here. */
export interface ImageContext {
  srcURL: string;
  linkURL: string;
  altText: string;
  titleText: string;
  pageURL: string;
}

const isGoogleHost = (url: string) => /(^|\.)google\.[a-z.]+$/i.test(hostnameOf(url));

export function newItemId(): string {
  return globalThis.crypto.randomUUID();
}

/**
 * Builds an image item from a right-clicked image.
 * - A Google "imgres" link wrapping the image names the original image and its page; that wins.
 * - Otherwise the image's own src is used (which may be a thumbnail).
 * - The source page is the surrounding link or page, unless it is a Google page.
 */
export function imageItemFromContext(params: ImageContext, id: string = newItemId()): ImageItem | null {
  const imgres = params.linkURL ? parseGoogleImgresLink(params.linkURL) : null;
  const src = params.srcURL;
  const srcUsable = !!src && isAllowedImageUrl(src);

  const imageUrl = imgres?.imageUrl ?? (srcUsable ? src : null);
  if (!imageUrl) return null;

  let sourcePageUrl = imgres?.sourcePageUrl;
  if (!sourcePageUrl && params.linkURL && isHttpUrl(params.linkURL) && !isGoogleHost(params.linkURL)) {
    sourcePageUrl = params.linkURL;
  }
  if (!sourcePageUrl && isHttpUrl(params.pageURL) && !isGoogleHost(params.pageURL)) sourcePageUrl = params.pageURL;

  const thumbnailUrl = srcUsable && src !== imageUrl ? src : undefined;
  const title = (params.altText || params.titleText || titleFromImageUrl(imageUrl)).trim().slice(0, 200) || 'Image';
  return {
    kind: 'image',
    id,
    title,
    imageUrl,
    ...(sourcePageUrl ? { sourcePageUrl } : {}),
    ...(thumbnailUrl ? { thumbnailUrl } : {})
  };
}

/** Builds a video item from a YouTube link (watch, youtu.be, shorts, embed, live). */
export function videoItemFromUrl(url: string, title: string, id: string = newItemId()): VideoItem | null {
  const parsed = parseYouTubeVideo(url);
  if (!parsed) return null;
  return {
    kind: 'video',
    id,
    title: title.trim().slice(0, 200) || 'YouTube video',
    videoId: parsed.videoId,
    sourceUrl: youtubeWatchUrl(parsed.videoId),
    thumbnailUrl: youtubeThumbnailUrl(parsed.videoId),
    ...(parsed.startSeconds ? { startSeconds: parsed.startSeconds } : {})
  };
}
