import { useSyncExternalStore } from 'react';
import type { AppSnapshot, Notification, NotifyLevel } from '../../../shared/types';

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
const notificationStore = createStore<Notification | null>(null);
let nextId = 1;

export function notify(level: NotifyLevel, message: string): void {
  const id = nextId++;
  notificationStore.set({ id, level, message });
  window.setTimeout(() => {
    if (notificationStore.get()?.id === id) notificationStore.set(null);
  }, level === 'error' ? 9000 : 5000);
}

let started = false;

/** Subscribes to main-process events and loads the first snapshot. Called once at startup. */
export async function startStores(): Promise<void> {
  if (started) return;
  started = true;
  window.vrs.on('app:snapshot', (s) => snapshotStore.set(s));
  window.vrs.on('app:notify', ({ level, message }) => notify(level, message));
  const first = await window.vrs.invoke('app:getSnapshot');
  if (first.ok && !snapshotStore.get()) snapshotStore.set(first.data);
}

export function useSnapshot(): AppSnapshot | null {
  return useSyncExternalStore(snapshotStore.subscribe, snapshotStore.get);
}

export function useNotification(): Notification | null {
  return useSyncExternalStore(notificationStore.subscribe, notificationStore.get);
}
