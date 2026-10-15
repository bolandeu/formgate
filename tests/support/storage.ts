// Reads what Lite stored, for each of the three storage backends: SQLite above the site root, JSONL files there,
// and guarded JSONL .php files in the Lite folder. Every row and line is parsed, so a broken record fails the test.
// It also writes a request the way Lite stored it before routing, without the route.
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Site } from './lite.ts';

export const backends = ['sqlite', 'jsonl', 'guarded'] as const;
export type Backend = (typeof backends)[number];

export const guardLine = '<?php exit; ?>';

export interface StoredRequest {
  received_at: string;
  form: string;
  fields: Record<string, string>;
  status: string;
  channels: Record<string, { delivered: boolean; reason: string }>;
  route: string;
}

// A stored request as Lite kept it before routing: it has no route.
export type OldStoredRequest = Omit<StoredRequest, 'route'>;

export interface SpamEntry {
  received_at: string;
  form: string;
  fields: Record<string, string>;
  service: Record<string, string>;
  reason: string;
}

export interface Stored {
  requests: StoredRequest[];
  spamLog: SpamEntry[];
  rateHits: number;
}

// Forces the backend and gives the env for Lite: the JSONL backend hides pdo_sqlite, the guarded backend gets
// a read-only folder above the site root (the variable covers root, which ignores chmod).
export function forceBackend(backend: Backend, site: Site): Record<string, string> {
  if (backend === 'guarded') {
    chmodSync(site.above, 0o555);
    return { FORMGATE_TEST_ABOVE_NOT_WRITABLE: '1' };
  }
  return backend === 'jsonl' ? { FORMGATE_TEST_WITHOUT_SQLITE: '1' } : {};
}

// The folder where the backend keeps its files.
function storageDir(backend: Backend, site: Site) {
  return backend === 'guarded' ? site.liteDir : site.above;
}

export function readStored(backend: Backend, site: Site): Stored {
  return backend === 'sqlite' ? readSqlite(site) : readJsonl(backend, site);
}

function readSqlite(site: Site): Stored {
  const db = new DatabaseSync(join(site.above, 'formgate.sqlite'), { readOnly: true });
  try {
    const requests = db.prepare('SELECT received_at, form, fields, status, channels, route FROM requests ORDER BY id').all();
    const spamLog = db.prepare('SELECT received_at, form, fields, service, reason FROM spam_log ORDER BY id').all();
    const { hits } = db.prepare('SELECT COUNT(*) AS hits FROM rate_hits').get() as { hits: number };
    return {
      requests: requests.map((row) => ({
        ...row,
        fields: JSON.parse(String(row.fields)),
        channels: JSON.parse(String(row.channels)),
      })) as unknown as StoredRequest[],
      spamLog: spamLog.map((row) => ({ ...row, fields: JSON.parse(String(row.fields)), service: JSON.parse(String(row.service)) })) as unknown as SpamEntry[],
      rateHits: hits,
    };
  } finally {
    db.close();
  }
}

function readJsonl(backend: Backend, site: Site): Stored {
  return {
    // A line stored before routing has no route: it took the default route (lite/src/Storage/Records.php).
    requests: (readLines(backend, site, 'requests') as StoredRequest[]).map((request) => ({ route: 'default', ...request })),
    spamLog: readLines(backend, site, 'spam-log') as SpamEntry[],
    rateHits: readLines(backend, site, 'rate-hits').length,
  };
}

// The records of one JSONL file; a guarded file must start with the guard line.
function readLines(backend: Backend, site: Site, name: string): unknown[] {
  const file = jsonlPath(backend, site, name);
  if (!existsSync(file)) return [];
  const lines = readFileSync(file, 'utf8').split('\n').filter((line) => line !== '');
  if (backend === 'guarded' && lines.shift() !== guardLine) throw new Error(`${file} has no guard line`);
  return lines.map((line) => JSON.parse(line));
}

// The file of one JSONL record kind of the backend.
function jsonlPath(backend: Backend, site: Site, name: string) {
  return join(storageDir(backend, site), `formgate-${name}.${backend === 'guarded' ? 'php' : 'jsonl'}`);
}

// Writes the request the way Lite stored it before routing, before Lite makes its storage: the SQLite requests table
// without the route column, or a JSONL line without the route.
export function writeOldRequest(backend: Backend, site: Site, request: OldStoredRequest) {
  if (backend !== 'sqlite') {
    const line = `${JSON.stringify(request)}\n`;
    writeFileSync(jsonlPath(backend, site, 'requests'), backend === 'guarded' ? `${guardLine}\n${line}` : line);
    return;
  }
  const db = new DatabaseSync(join(site.above, 'formgate.sqlite'));
  try {
    db.exec(
      'CREATE TABLE requests (id INTEGER PRIMARY KEY, received_at TEXT NOT NULL, form TEXT NOT NULL,'
        + ' fields TEXT NOT NULL, status TEXT NOT NULL, channels TEXT NOT NULL)',
    );
    db.prepare('INSERT INTO requests (received_at, form, fields, status, channels) VALUES (?, ?, ?, ?, ?)').run(
      request.received_at,
      request.form,
      JSON.stringify(request.fields),
      request.status,
      JSON.stringify(request.channels),
    );
  } finally {
    db.close();
  }
}
