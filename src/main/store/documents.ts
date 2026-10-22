import path from 'node:path';
import { bookmarkSchema, idSchema, queueEntrySchema, songSchema } from '../../shared/schemas';
import { defaultSettings, parseSettings, type Settings } from '../../shared/settings';
import { emptyQueue, MAX_QUEUE_ENTRIES } from '../../shared/queue';
import type { Bookmark, QueueEntry, QueueState, Song } from '../../shared/types';
import { JsonStore, parseRecordList, type ParseOutcome } from './jsonStore';

/**
 * Document definitions for everything the application persists. Only
 * user-created content and preferences are stored; browsing data stays in the
 * Chromium session folders.
 */

export interface QueueFile {
  version: 1;
  entries: QueueEntry[];
  currentId: string | null;
}

export interface LyricsFile {
  version: 1;
  songs: Song[];
}

export interface BookmarksFile {
  version: 1;
  bookmarks: Bookmark[];
}

export function parseSettingsDocument(raw: unknown): ParseOutcome<Settings> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('unexpected document format');
  return { data: parseSettings(raw), warnings: [] };
}

export function parseQueueDocument(raw: unknown): ParseOutcome<QueueFile> {
  const { records, warnings, doc } = parseRecordList(
    raw,
    'entries',
    (value) => {
      const result = queueEntrySchema.safeParse(value);
      return result.success ? (result.data as QueueEntry) : null;
    },
    'queue item'
  );
  const unique = dedupeById(records).slice(0, MAX_QUEUE_ENTRIES);
  const current = idSchema.safeParse(doc.currentId);
  const currentId = current.success && unique.some((e) => e.id === current.data) ? current.data : null;
  return { data: { version: 1, entries: unique, currentId }, warnings };
}

export function parseLyricsDocument(raw: unknown): ParseOutcome<LyricsFile> {
  const { records, warnings } = parseRecordList(
    raw,
    'songs',
    (value) => {
      const result = songSchema.safeParse(value);
      return result.success ? (result.data as Song) : null;
    },
    'song'
  );
  return { data: { version: 1, songs: dedupeById(records) }, warnings };
}

export function parseBookmarksDocument(raw: unknown): ParseOutcome<BookmarksFile> {
  const { records, warnings } = parseRecordList(
    raw,
    'bookmarks',
    (value) => {
      const result = bookmarkSchema.safeParse(value);
      return result.success ? (result.data as Bookmark) : null;
    },
    'bookmark'
  );
  return { data: { version: 1, bookmarks: dedupeById(records) }, warnings };
}

function dedupeById<T extends { id: string }>(records: T[]): T[] {
  const seen = new Set<string>();
  return records.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
}

export function queueStateFromFile(file: QueueFile): QueueState {
  return { entries: file.entries, currentId: file.currentId };
}

export function queueFileFromState(state: QueueState): QueueFile {
  return { version: 1, entries: state.entries, currentId: state.currentId };
}

export interface Stores {
  settings: JsonStore<Settings>;
  queue: JsonStore<QueueFile>;
  lyrics: JsonStore<LyricsFile>;
  bookmarks: JsonStore<BookmarksFile>;
}

export function createStores(dataDir: string): Stores {
  return {
    settings: new JsonStore({
      file: path.join(dataDir, 'settings.json'),
      label: 'Settings',
      parse: parseSettingsDocument,
      defaults: defaultSettings
    }),
    queue: new JsonStore({
      file: path.join(dataDir, 'queue.json'),
      label: 'Presentation queue',
      parse: parseQueueDocument,
      defaults: () => queueFileFromState(emptyQueue())
    }),
    lyrics: new JsonStore({
      file: path.join(dataDir, 'lyrics.json'),
      label: 'Lyrics library',
      parse: parseLyricsDocument,
      defaults: () => ({ version: 1, songs: [] })
    }),
    bookmarks: new JsonStore({
      file: path.join(dataDir, 'bookmarks.json'),
      label: 'Bookmarks',
      parse: parseBookmarksDocument,
      defaults: () => ({ version: 1, bookmarks: [] })
    })
  };
}
