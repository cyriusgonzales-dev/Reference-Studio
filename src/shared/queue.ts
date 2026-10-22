import type { PresentableItem, QueueEntry, QueueState } from './types';

/**
 * Pure queue operations. The queue cursor (`currentId`) is tracked by entry id
 * so that removals and reorders never silently point it at a different item.
 */

export const MAX_QUEUE_ENTRIES = 500;

export function emptyQueue(): QueueState {
  return { entries: [], currentId: null };
}

export function currentIndex(state: QueueState): number {
  if (!state.currentId) return -1;
  return state.entries.findIndex((e) => e.id === state.currentId);
}

export function currentEntry(state: QueueState): QueueEntry | null {
  const index = currentIndex(state);
  return index >= 0 ? (state.entries[index] ?? null) : null;
}

export type InsertPosition = 'end' | 'next';

export function addEntry(state: QueueState, entry: QueueEntry, position: InsertPosition = 'end'): QueueState {
  if (state.entries.length >= MAX_QUEUE_ENTRIES) {
    throw new Error(`The queue is limited to ${MAX_QUEUE_ENTRIES} items.`);
  }
  if (state.entries.some((e) => e.id === entry.id)) return state;
  const entries = [...state.entries];
  const cursor = currentIndex(state);
  if (position === 'next' && cursor >= 0) entries.splice(cursor + 1, 0, entry);
  else entries.push(entry);
  return { ...state, entries };
}

export function removeEntry(state: QueueState, id: string): QueueState {
  const index = state.entries.findIndex((e) => e.id === id);
  if (index < 0) return state;
  const entries = state.entries.filter((e) => e.id !== id);
  let currentId = state.currentId;
  if (currentId === id) {
    // Keep the cursor near where it was rather than jumping to the start.
    const neighbour = entries[Math.min(index, entries.length - 1)];
    currentId = neighbour ? neighbour.id : null;
  }
  return { entries, currentId };
}

export function moveEntry(state: QueueState, fromIndex: number, toIndex: number): QueueState {
  const count = state.entries.length;
  if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) return state;
  if (fromIndex < 0 || fromIndex >= count || toIndex < 0 || toIndex >= count || fromIndex === toIndex) return state;
  const entries = [...state.entries];
  const [moved] = entries.splice(fromIndex, 1);
  if (!moved) return state;
  entries.splice(toIndex, 0, moved);
  return { ...state, entries };
}

export function selectEntry(state: QueueState, id: string | null): QueueState {
  if (id !== null && !state.entries.some((e) => e.id === id)) return state;
  return { ...state, currentId: id };
}

export function clearQueue(): QueueState {
  return emptyQueue();
}

export function updateNotes(state: QueueState, id: string, notes: string): QueueState {
  return {
    ...state,
    entries: state.entries.map((e) => (e.id === id ? { ...e, notes } : e))
  };
}

export interface StepResult {
  state: QueueState;
  entry: QueueEntry | null;
}

/** Moves the cursor forward. With no cursor it starts at the first entry. Stops at the end. */
export function stepNext(state: QueueState): StepResult {
  if (state.entries.length === 0) return { state, entry: null };
  const index = currentIndex(state);
  const nextIndex = index < 0 ? 0 : index + 1;
  const entry = state.entries[nextIndex];
  if (!entry) return { state, entry: null };
  return { state: { ...state, currentId: entry.id }, entry };
}

/** Moves the cursor backward. With no cursor it starts at the last entry. Stops at the start. */
export function stepPrevious(state: QueueState): StepResult {
  if (state.entries.length === 0) return { state, entry: null };
  const index = currentIndex(state);
  const prevIndex = index < 0 ? state.entries.length - 1 : index - 1;
  const entry = prevIndex >= 0 ? state.entries[prevIndex] : undefined;
  if (!entry) return { state, entry: null };
  return { state: { ...state, currentId: entry.id }, entry };
}

export function makeEntry(item: PresentableItem, id: string, now: Date, notes = ''): QueueEntry {
  return { id, addedAt: now.toISOString(), notes, item };
}
