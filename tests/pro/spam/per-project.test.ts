// The spam records of Pro are per project: the rate counter and the duplicate window split by project, the spam
// log names the project, a fresh database has no Lite requests table and a database of v0.3.0 keeps working.
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type FakeChannel, postJson, projectSettings, startFakeChannel } from '../../support/lite.ts';
import { createProFolders, type Pro, type ProFolders, readQueue, runWorkerOnce, startPro } from '../../support/pro.ts';

const keyA = 'ProjectAAAAAAAAA';
const keyB = 'ProjectBBBBBBBBB';
const form = { __form: 'callback', name: 'Анна', phone: '+7 900 123-45-67', consent: '1' };

let channel: FakeChannel;
let folders: ProFolders;
let pro: Pro;

function writeProjects(project: Record<string, unknown>) {
  const settings = projectSettings(channel);
  for (const key of [keyA, keyB]) {
    folders.writeProject(key, { ...settings, project: { ...settings.project, ...project } });
  }
}

function query(sql: string): Record<string, unknown>[] {
  const db = new DatabaseSync(join(folders.data, 'formgate.sqlite'), { readOnly: true });
  try {
    return db.prepare(sql).all();
  } finally {
    db.close();
  }
}

beforeEach(async () => {
  channel = await startFakeChannel();
  folders = createProFolders();
});

afterEach(async () => {
  pro?.stop();
  folders.remove();
  await channel.stop();
});

describe('rate limit and duplicates', () => {
  it('counts the hits of one IP and form separately in two projects', async () => {
    writeProjects({ rate_limit: { requests: 2, window_seconds: 600 } });
    pro = await startPro(folders);

    await postJson(pro.formUrl(keyA), form);
    await postJson(pro.formUrl(keyA), { ...form, name: 'Борис' });
    await postJson(pro.formUrl(keyB), { ...form, name: 'Вера' });

    expect(query('SELECT reason FROM spam_log')).toEqual([]);
    expect(readQueue(folders).map((queued) => queued.project_key)).toEqual([keyA, keyA, keyB]);
  });

  it('treats the same form data in two projects as new in each', async () => {
    writeProjects({ duplicate_window_seconds: 600 });
    pro = await startPro(folders);

    await postJson(pro.formUrl(keyA), form);
    await postJson(pro.formUrl(keyB), form);
    await postJson(pro.formUrl(keyB), form);

    expect(query('SELECT project_key, reason FROM spam_log')).toEqual([{ project_key: keyB, reason: 'duplicate' }]);
  });
});

describe('the spam log', () => {
  it('names the project of a honeypot post', async () => {
    writeProjects({});
    pro = await startPro(folders);

    await postJson(pro.formUrl(keyA), { ...form, website: 'bot' });

    expect(query('SELECT project_key, reason FROM spam_log')).toEqual([{ project_key: keyA, reason: 'honeypot' }]);
  });
});

describe('the database', () => {
  it('has no Lite requests table on a fresh start of the worker and the web side', async () => {
    writeProjects({});
    pro = await startPro(folders);

    await runWorkerOnce(folders);
    await postJson(pro.formUrl(keyA), { ...form, website: 'bot' });

    expect(query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'requests'")).toEqual([]);
  });

  it('made by v0.3.0 keeps its spam log rows and logs new posts per project', async () => {
    const old = new DatabaseSync(join(folders.data, 'formgate.sqlite'));
    old.exec(
      'CREATE TABLE requests (id INTEGER PRIMARY KEY, received_at TEXT NOT NULL, form TEXT NOT NULL, fields TEXT NOT NULL, status TEXT NOT NULL, channels TEXT NOT NULL);' +
        'CREATE TABLE spam_log (id INTEGER PRIMARY KEY, received_at TEXT NOT NULL, form TEXT NOT NULL, fields TEXT NOT NULL, reason TEXT NOT NULL);' +
        'CREATE TABLE rate_hits (key TEXT NOT NULL, at INTEGER NOT NULL);' +
        'CREATE TABLE duplicates (hash TEXT PRIMARY KEY, at INTEGER NOT NULL);' +
        "INSERT INTO spam_log (received_at, form, fields, reason) VALUES ('2026-10-01T10:00:00Z', 'callback', '{}', 'honeypot');",
    );
    old.close();
    writeProjects({});
    pro = await startPro(folders);

    const answer = await postJson(pro.formUrl(keyB), { ...form, website: 'bot' });

    expect(answer.status).toBe(200);
    expect(query('SELECT project_key, reason FROM spam_log ORDER BY id')).toEqual([
      { project_key: null, reason: 'honeypot' },
      { project_key: keyB, reason: 'honeypot' },
    ]);
  });
});
