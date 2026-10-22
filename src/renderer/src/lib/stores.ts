import { useSyncExternalStore } from 'react';
import type { AppSnapshot, Bookmark, Notification, NotifyLevel, Song } from '../../../shared/types';

/**
 * Small external stores fed by main-process events. The main process is the
 * source of truth; these only cache the latest pushed values for React.
 */

function createStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next: T) {
      value = next;
      listeners.forEach((l) => l());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

const snapshotStore = createStore<AppSnapshot | null>(null);
const songsStore = createStore<Song[]>([]);
const bookmarksStore = createStore<Bookmark[]>([]);
const notificationsStore = createStore<Notification[]>([]);

let nextNotificationId = 1;

export function notify(level: NotifyLevel, message: string): void {
  const id = nextNotificationId++;
  notificationsStore.set([...notificationsStore.get(), { id, level, message }].slice(-5));
  window.setTimeout(() => dismissNotification(id), level === 'error' ? 9000 : 5000);
}

export function dismissNotification(id: number): void {
  notificationsStore.set(notificationsStore.get().filter((n) => n.id !== id));
}

let started = false;

/** Subscribes to main-process events and loads initial data. Called once at startup. */
export async function startStores(): Promise<void> {
  if (started) return;
  started = true;
  window.vrs.on('app:snapshot', (s) => snapshotStore.set(s));
  window.vrs.on('lyrics:changed', (songs) => songsStore.set(songs));
  window.vrs.on('bookmarks:changed', (b) => bookmarksStore.set(b));
  window.vrs.on('app:notify', ({ level, message }) => notify(level, message));

  const [snapshot, songs, bookmarks] = await Promise.all([
    window.vrs.invoke('app:getSnapshot'),
    window.vrs.invoke('lyrics:list'),
    window.vrs.invoke('bookmarks:list')
  ]);
  if (snapshot.ok && !snapshotStore.get()) snapshotStore.set(snapshot.data);
  if (songs.ok) songsStore.set(songs.data);
  if (bookmarks.ok) bookmarksStore.set(bookmarks.data);
}

export function useSnapshot(): AppSnapshot | null {
  return useSyncExternalStore(snapshotStore.subscribe, snapshotStore.get);
}

export function useSongs(): Song[] {
  return useSyncExternalStore(songsStore.subscribe, songsStore.get);
}

export function useBookmarks(): Bookmark[] {
  return useSyncExternalStore(bookmarksStore.subscribe, bookmarksStore.get);
}

export function useNotifications(): Notification[] {
  return useSyncExternalStore(notificationsStore.subscribe, notificationsStore.get);
}
