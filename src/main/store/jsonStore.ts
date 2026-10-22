import fs from 'node:fs';
import path from 'node:path';

/**
 * A small JSON document store with atomic writes, a rolling backup and
 * corruption recovery. It deliberately uses only Node APIs so it can be unit
 * tested without Electron.
 *
 * Write path:  data → <file>.tmp → (existing <file> copied to <file>.bak) → rename to <file>
 * Load path:   <file> → on failure <file>.bak → on failure defaults.
 * A damaged file is never deleted; it is kept as <file>.corrupt-<timestamp>.
 */

export interface ParseOutcome<T> {
  data: T;
  /** Non-fatal problems, e.g. individual records that were skipped. */
  warnings: string[];
}

export type DocumentParser<T> = (raw: unknown) => ParseOutcome<T>;

export interface LoadReport<T> {
  data: T;
  source: 'file' | 'backup' | 'defaults';
  issues: string[];
}

export interface JsonStoreOptions<T> {
  file: string;
  label: string;
  parse: DocumentParser<T>;
  defaults: () => T;
  debounceMs?: number;
  now?: () => Date;
}

export class JsonStore<T> {
  private pending: T | null = null;
  private timer: NodeJS.Timeout | null = null;
  private lastError: string | null = null;
  private readonly debounceMs: number;
  private readonly now: () => Date;

  constructor(private readonly options: JsonStoreOptions<T>) {
    this.debounceMs = options.debounceMs ?? 250;
    this.now = options.now ?? (() => new Date());
  }

  get file(): string {
    return this.options.file;
  }

  get backupFile(): string {
    return `${this.options.file}.bak`;
  }

  /** The last write error, if writing is currently failing. */
  get writeError(): string | null {
    return this.lastError;
  }

  load(): LoadReport<T> {
    const { file, label } = this.options;
    const issues: string[] = [];

    const primary = this.tryRead(file);
    if (primary.kind === 'ok') {
      return { data: primary.outcome.data, source: 'file', issues: primary.outcome.warnings.map((w) => `${label}: ${w}`) };
    }
    if (primary.kind === 'missing') {
      // A missing primary with an existing backup means a write was interrupted.
      const backup = this.tryRead(this.backupFile);
      if (backup.kind === 'ok') {
        issues.push(`${label}: the data file was missing and has been restored from its backup.`);
        return { data: backup.outcome.data, source: 'backup', issues };
      }
      return { data: this.options.defaults(), source: 'defaults', issues };
    }

    const kept = this.quarantine(file);
    const keptNote = kept ? ` The damaged file was kept as "${path.basename(kept)}".` : '';
    const backup = this.tryRead(this.backupFile);
    if (backup.kind === 'ok') {
      issues.push(`${label}: the data file could not be read (${primary.error}) and was restored from the last backup.${keptNote}`);
      return { data: backup.outcome.data, source: 'backup', issues };
    }
    issues.push(`${label}: the data file could not be read (${primary.error}) and no usable backup exists; starting empty.${keptNote}`);
    return { data: this.options.defaults(), source: 'defaults', issues };
  }

  /** Schedules a debounced write. */
  save(data: T): void {
    this.pending = data;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, this.debounceMs);
  }

  /** Writes any pending data immediately. Returns false when the write failed. */
  flush(): boolean {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.pending === null) return true;
    const data = this.pending;
    try {
      this.writeNow(data);
      this.pending = null;
      this.lastError = null;
      return true;
    } catch (error) {
      this.lastError = `${this.options.label}: could not save (${(error as Error).message}).`;
      return false;
    }
  }

  writeNow(data: T): void {
    const { file } = this.options;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    if (fs.existsSync(file)) {
      try {
        fs.copyFileSync(file, this.backupFile);
      } catch {
        // A failed backup must not prevent saving the new data.
      }
    }
    renameWithRetry(tmp, file);
  }

  private tryRead(
    file: string
  ): { kind: 'ok'; outcome: ParseOutcome<T> } | { kind: 'missing' } | { kind: 'error'; error: string } {
    let text: string;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { kind: 'missing' };
      return { kind: 'error', error: (error as Error).message };
    }
    try {
      // Strip a UTF-8 byte-order mark left by editors such as Notepad.
      const raw: unknown = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
      return { kind: 'ok', outcome: this.options.parse(raw) };
    } catch (error) {
      return { kind: 'error', error: error instanceof SyntaxError ? 'invalid JSON' : (error as Error).message };
    }
  }

  private quarantine(file: string): string | null {
    const stamp = this.now().toISOString().replace(/[:.]/g, '-');
    const target = `${file}.corrupt-${stamp}`;
    try {
      fs.renameSync(file, target);
      return target;
    } catch {
      return null;
    }
  }
}

/** On Windows, antivirus or indexers can briefly lock files; retry renames a few times. */
function renameWithRetry(from: string, to: string): void {
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (error) {
      lastError = error;
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES') break;
      // Brief synchronous back-off; writes are small and rare.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20 * (attempt + 1));
    }
  }
  throw lastError;
}

/**
 * Parses a versioned document containing one array of records, skipping
 * invalid records individually instead of discarding the whole file.
 */
export function parseRecordList<R>(
  raw: unknown,
  key: string,
  parseRecord: (value: unknown) => R | null,
  noun: string
): { records: R[]; warnings: string[]; doc: Record<string, unknown> } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('unexpected document format');
  const doc = raw as Record<string, unknown>;
  const list = doc[key];
  if (!Array.isArray(list)) throw new Error(`missing "${key}" list`);
  const records: R[] = [];
  let skipped = 0;
  for (const value of list) {
    const record = parseRecord(value);
    if (record) records.push(record);
    else skipped++;
  }
  const warnings = skipped > 0 ? [`${skipped} invalid ${noun}${skipped === 1 ? ' was' : 's were'} skipped.`] : [];
  return { records, warnings, doc };
}
