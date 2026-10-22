import { describe, expect, it } from 'vitest';
import {
  addEntry,
  currentEntry,
  emptyQueue,
  makeEntry,
  moveEntry,
  removeEntry,
  selectEntry,
  stepNext,
  stepPrevious,
  updateNotes
} from '../src/shared/queue';
import type { QueueState } from '../src/shared/types';
import { image, video } from './fixtures';

const now = new Date('2026-01-01T00:00:00Z');

function queueOf(...ids: string[]): QueueState {
  return ids.reduce((q, id) => addEntry(q, makeEntry(image(id), id, now)), emptyQueue());
}

const ids = (q: QueueState) => q.entries.map((e) => e.id);

describe('queue', () => {
  it('appends entries and ignores duplicate ids', () => {
    let q = queueOf('a', 'b');
    q = addEntry(q, makeEntry(image('a'), 'a', now));
    expect(ids(q)).toEqual(['a', 'b']);
  });

  it('inserts "next" after the cursor', () => {
    let q = selectEntry(queueOf('a', 'b', 'c'), 'a');
    q = addEntry(q, makeEntry(video('v'), 'v', now), 'next');
    expect(ids(q)).toEqual(['a', 'v', 'b', 'c']);
  });

  it('inserts "next" at the end when there is no cursor', () => {
    const q = addEntry(queueOf('a'), makeEntry(video('v'), 'v', now), 'next');
    expect(ids(q)).toEqual(['a', 'v']);
  });

  it('reorders entries and keeps the cursor on the same entry', () => {
    let q = selectEntry(queueOf('a', 'b', 'c'), 'b');
    q = moveEntry(q, 0, 2);
    expect(ids(q)).toEqual(['b', 'c', 'a']);
    expect(currentEntry(q)?.id).toBe('b');
  });

  it('ignores out-of-range or non-integer moves', () => {
    const q = queueOf('a', 'b');
    expect(moveEntry(q, 0, 5)).toBe(q);
    expect(moveEntry(q, -1, 0)).toBe(q);
    expect(moveEntry(q, 0.5, 1)).toBe(q);
  });

  it('moves the cursor to a neighbour when the current entry is removed', () => {
    let q = selectEntry(queueOf('a', 'b', 'c'), 'b');
    q = removeEntry(q, 'b');
    expect(q.currentId).toBe('c');
    q = removeEntry(selectEntry(q, 'c'), 'c');
    expect(q.currentId).toBe('a');
    q = removeEntry(q, 'a');
    expect(q.currentId).toBeNull();
  });

  it('steps forward and backward without wrapping', () => {
    let q = queueOf('a', 'b');
    let r = stepNext(q);
    expect(r.entry?.id).toBe('a');
    r = stepNext(r.state);
    expect(r.entry?.id).toBe('b');
    const end = stepNext(r.state);
    expect(end.entry).toBeNull();
    expect(end.state.currentId).toBe('b');
    q = end.state;
    expect(stepPrevious(q).entry?.id).toBe('a');
    expect(stepPrevious(selectEntry(q, 'a')).entry).toBeNull();
  });

  it('starts "previous" at the last entry when no cursor is set', () => {
    expect(stepPrevious(queueOf('a', 'b')).entry?.id).toBe('b');
  });

  it('returns nothing when stepping an empty queue', () => {
    expect(stepNext(emptyQueue()).entry).toBeNull();
    expect(stepPrevious(emptyQueue()).entry).toBeNull();
  });

  it('refuses to select unknown entries and updates notes', () => {
    const q = queueOf('a');
    expect(selectEntry(q, 'zzz')).toBe(q);
    expect(updateNotes(q, 'a', 'hello').entries[0]?.notes).toBe('hello');
  });
});
