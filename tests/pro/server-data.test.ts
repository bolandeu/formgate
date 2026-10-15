// The server data of a Pro request (FORMGATE-042): the queue row and the spam log entry keep the request id, IP,
// User-Agent and origin host; the channels never get them.
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type FakeChannel, postForm, projectSettings, startFakeChannel } from '../support/lite.ts';
import { createProFolders, type Pro, type ProFolders, readQueue, runWorkerOnce, startPro } from '../support/pro.ts';

const key = 'ServerDataProj01';
const form = { __form: 'callback', name: 'Анна', phone: '+7 900 123-45-67', consent: '1' };
const headers = { 'X-Forwarded-For': '203.0.113.5', 'User-Agent': 'TestUA/1.0', Accept: 'application/json' };
const expected = { ip: '203.0.113.5', user_agent: 'TestUA/1.0', origin_host: 'site.ru' };

let channel: FakeChannel;
let folders: ProFolders;
let pro: Pro;

function spamLog(): Record<string, unknown>[] {
  const db = new DatabaseSync(join(folders.data, 'formgate.sqlite'), { readOnly: true });
  try {
    return db.prepare('SELECT request_id, ip, user_agent, origin_host FROM spam_log ORDER BY id').all();
  } finally {
    db.close();
  }
}

beforeEach(async () => {
  channel = await startFakeChannel();
  folders = createProFolders();
  const settings = projectSettings(channel);
  folders.writeProject(key, { ...settings, project: { ...settings.project, trusted_proxies: ['127.0.0.1', '::1'] } });
  pro = await startPro(folders);
});

afterEach(async () => {
  pro.stop();
  folders.remove();
  await channel.stop();
});

describe('a Pro request', () => {
  it('is queued with the server data, delivered by the worker without the IP and the User-Agent in the text', async () => {
    await postForm(pro.formUrl(key), form, headers);

    const [queued] = readQueue(folders);
    expect(queued).toMatchObject(expected);
    expect(queued.request_id).toMatch(/^[A-Za-z0-9_-]{16,}$/);

    await runWorkerOnce(folders);

    expect(readQueue(folders)[0]).toMatchObject({ status: 'delivered', request_id: queued.request_id, ...expected });
    const text = JSON.stringify(channel.calls);
    expect(channel.calls).toHaveLength(1);
    expect(text).not.toContain('203.0.113.5');
    expect(text).not.toContain('TestUA');
    expect(text).not.toContain(queued.request_id);
  });

  it('keeps the server data in the spam log entry of a honeypot request', async () => {
    await postForm(pro.formUrl(key), { ...form, website: 'x' }, headers);

    const [entry] = spamLog();
    expect(entry).toMatchObject(expected);
    expect(String(entry.request_id)).toMatch(/^[A-Za-z0-9_-]{16,}$/);
  });
});
