import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createStores, parseQueueDocument, queueFileFromState, queueStateFromFile } from '../src/main/store/documents';
import { addEntry, emptyQueue, makeEntry, moveEntry, selectEntry } from '../src/shared/queue';
import { image, video } from './fixtures';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vrs-test-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('queue persistence', () => {
  it('round-trips the queue, order and cursor', () => {
    const stores = createStores(dir);
    let q = emptyQueue();
    q = addEntry(q, makeEntry(image('a'), 'a', new Date()));
    q = addEntry(q, makeEntry(video('b'), 'b', new Date()));
    q = moveEntry(selectEntry(q, 'b'), 1, 0);
    stores.queue.save(queueFileFromState(q));
    expect(stores.queue.flush()).toBe(true);

    const reloaded = createStores(dir).queue.load();
    expect(reloaded.source).toBe('file');
    const state = queueStateFromFile(reloaded.data);
    expect(state.entries.map((e) => e.id)).toEqual(['b', 'a']);
    expect(state.currentId).toBe('b');
  });

  it('skips individual invalid entries and reports them', () => {
    const raw = {
      version: 1,
      currentId: 'gone',
      entries: [
        { id: 'a', addedAt: 'x', notes: '', item: image('a') },
        { id: 'b', addedAt: 'x', notes: '', item: image('b', { imageUrl: 'file:///etc/passwd' }) },
        { id: 'a', addedAt: 'x', notes: '', item: image('a') }
      ]
    };
    const parsed = parseQueueDocument(raw);
    expect(parsed.data.entries.map((e) => e.id)).toEqual(['a']);
    expect(parsed.data.currentId).toBeNull();
    expect(parsed.warnings[0]).toMatch(/1 invalid queue item was skipped/);
  });
});

describe('corruption recovery', () => {
  it('restores from backup and keeps the damaged file', () => {
    const stores = createStores(dir);
    stores.lyrics.writeNow({ version: 1, songs: [] });
    stores.lyrics.writeNow({
      version: 1,
      songs: [{ id: 's1', title: 'Song', slides: [], createdAt: 'x', updatedAt: 'x' }]
    });
    // Second write copied the first version to .bak; now corrupt the main file.
    fs.writeFileSync(stores.lyrics.file, '{ this is not json', 'utf8');

    const report = createStores(dir).lyrics.load();
    expect(report.source).toBe('backup');
    expect(report.issues[0]).toMatch(/restored from the last backup/);
    const files = fs.readdirSync(dir);
    expect(files.some((f) => f.startsWith('lyrics.json.corrupt-'))).toBe(true);
  });

  it('falls back to defaults when no backup exists', () => {
    fs.writeFileSync(path.join(dir, 'bookmarks.json'), '[1,2,3]', 'utf8');
    const report = createStores(dir).bookmarks.load();
    expect(report.source).toBe('defaults');
    expect(report.data.bookmarks).toEqual([]);
    expect(report.issues[0]).toMatch(/no usable backup/);
  });

  it('treats a missing file as a fresh start without issues', () => {
    const report = createStores(dir).settings.load();
    expect(report.source).toBe('defaults');
    expect(report.issues).toEqual([]);
  });

  it('recovers settings field by field', () => {
    fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ output: { transitionMs: 'fast' }, queue: { presentOnNavigate: true } }));
    const report = createStores(dir).settings.load();
    expect(report.source).toBe('file');
    expect(report.data.output.transitionMs).toBe(200);
    expect(report.data.queue.presentOnNavigate).toBe(true);
  });

  it('reports write failures instead of throwing', () => {
    const blocker = path.join(dir, 'blocker');
    fs.writeFileSync(blocker, 'x');
    const stores = createStores(path.join(blocker, 'sub'));
    stores.queue.save(queueFileFromState(emptyQueue()));
    expect(stores.queue.flush()).toBe(false);
    expect(stores.queue.writeError).toMatch(/could not save/);
  });
});
