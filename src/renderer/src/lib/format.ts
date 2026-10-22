import type { ItemKind, OutputStatus, PresentableItem } from '../../../shared/types';
import { hostnameOf, youtubeThumbnailUrl } from '../../../shared/urls';

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

export const KIND_LABEL: Record<ItemKind, string> = { image: 'Image', video: 'Video', lyrics: 'Lyrics' };

export function itemSubtitle(item: PresentableItem): string {
  switch (item.kind) {
    case 'image':
      return item.imageUrl.startsWith('data:') ? 'Embedded image' : hostnameOf(item.sourcePageUrl ?? item.imageUrl);
    case 'video':
      return 'YouTube';
    case 'lyrics':
      return `starts at slide ${item.slideIndex + 1}`;
  }
}

export function itemThumbnail(item: PresentableItem): string | null {
  switch (item.kind) {
    case 'image':
      return item.thumbnailUrl ?? item.imageUrl;
    case 'video':
      return item.thumbnailUrl ?? youtubeThumbnailUrl(item.videoId);
    case 'lyrics':
      return null;
  }
}

export const STATUS_LABEL: Record<OutputStatus, string> = {
  EMPTY: 'Black',
  LOADING_IMAGE: 'Loading image',
  IMAGE: 'Image',
  LOADING_VIDEO: 'Loading video',
  VIDEO: 'Video',
  LYRICS: 'Lyrics',
  ERROR: 'Error'
};

export function newId(): string {
  return crypto.randomUUID();
}

export function formatCount(n: number): string {
  return n.toLocaleString();
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (target as HTMLInputElement).type;
    return !['checkbox', 'radio', 'button', 'submit', 'range', 'color'].includes(type);
  }
  return false;
}

export function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return !!target.closest('button, a, input, select, textarea, [role="button"], [contenteditable="true"]');
}
