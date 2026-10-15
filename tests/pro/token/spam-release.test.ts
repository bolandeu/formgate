// The spam commands of Pro: spam:list shows the spam log entries (secrets masked), spam:release <id> makes an entry of
// a token reason a queued request with its service fields and removes it from the spam log, and refuses an entry of
// another reason or a wrong id without changing anything.
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type FakeChannel, postJson, projectSettings, startFakeChannel } from '../../support/lite.ts';
import { createProFolders, type Pro, type ProFolders, readQueue, runCli, runWorkerOnce, startPro } from '../../support/pro.ts';

const key = 'SpamReleaseProj1';
// A project with a Bitrix24 channel: the lead shows the subject that the visitor sent.
const bitrixKey = 'SpamReleaseBitrx';
const visitorForm = { __form: 'callback', name: 'Анна', phone: '+7 900 123-45-67', consent: '1' };
const postedAt = '2026-03-01T12:00:00+03:00';

let channel: FakeChannel;
let folders: ProFolders;
let pro: Pro;

function database<T>(read: (db: DatabaseSync) => T): T {
  const db = new DatabaseSync(join(folders.data, 'formgate.sqlite'), { readOnly: true });
  try {
    return read(db);
  } finally {
    db.close();
  }
}

function spamLog() {
  return database((db) => db.prepare('SELECT id, reason FROM spam_log ORDER BY id').all());
}

function spamList() {
  return runCli(folders, ['spam:list'], { COLUMNS: '1000' });
}

function release(id: string) {
  return runCli(folders, ['spam:release', id], { COLUMNS: '1000' });
}

// The id that spam:list prints for the entry of the reason.
async function idOf(reason: string): Promise<string> {
  const match = new RegExp(`^#(\\d+) .*reason ${reason}`, 'm').exec((await spamList()).stdout);
  if (!match) throw new Error(`spam:list shows no ${reason} entry`);
  return match[1];
}

beforeEach(async () => {
  channel = await startFakeChannel();
  folders = createProFolders();
  folders.env.FORMGATE_TOKEN_SECRET = 'test-token-secret-of-pro';
  folders.env.FORMGATE_TEST_NOW = postedAt;
  const settings = projectSettings(channel);
  folders.writeProject(key, { ...settings, project: { ...settings.project, require_token: true } });
  folders.writeProject(bitrixKey, {
    project: { ...settings.project, require_token: true },
    channels: [{ type: 'bitrix24', options: { webhook_url: `${channel.url}/rest/1/WEBHOOK-KEY/`, map: { name: 'NAME' } } }],
  });
  pro = await startPro(folders, { FORMGATE_TEST_NOW: postedAt });
});

afterEach(async () => {
  pro.stop();
  folders.remove();
  await channel.stop();
});

describe('spam:release', () => {
  it('delivers a token_unavailable entry to the channels as the visitor sent it and removes it from the spam log', async () => {
    const service = { __subject: 'Звонок', __replyto: 'mail', __redirect: 'https://site.ru/ok/', __required: 'name,phone' };
    await postJson(pro.formUrl(bitrixKey), { ...visitorForm, ...service, mail: 'anna@site.ru', __token_unavailable: '1' });

    const list = await spamList();
    const run = await release(await idOf('token_unavailable'));
    await runWorkerOnce(folders);

    expect(list.stdout).toMatch(
      new RegExp(`^#\\d+ project ${bitrixKey} received 2026-03-01T09:00:00Z reason token_unavailable route default$`, 'm'),
    );
    expect(list.stdout).toContain('"name":"Анна"');
    expect(run.status).toBe(0);
    expect(spamLog()).toEqual([]);
    expect(readQueue(folders).map((queued) => [queued.project_key, queued.received_at, queued.status])).toEqual([
      [bitrixKey, '2026-03-01T09:00:00Z', 'delivered'],
    ]);
    expect(channel.calls).toHaveLength(1);
    const lead = channel.calls[0].body.fields as Record<string, unknown>;
    expect(lead.TITLE).toBe('Звонок');
    expect(lead.NAME).toBe('Анна');
  });

  it('releases an entry of another token reason too', async () => {
    await postJson(pro.formUrl(key), { ...visitorForm, __token: 'garbage' });

    const run = await release(await idOf('bad_signature'));

    expect(run.status).toBe(0);
    expect(spamLog()).toEqual([]);
    expect(readQueue(folders)).toHaveLength(1);
  });

  it('refuses a honeypot entry with its reason and changes nothing', async () => {
    await postJson(pro.formUrl(key), { ...visitorForm, website: 'x' });
    const id = await idOf('honeypot');

    const run = await release(id);

    expect(run.status).not.toBe(0);
    expect(run.stdout + run.stderr).toContain('honeypot');
    expect(spamLog()).toEqual([{ id: Number(id), reason: 'honeypot' }]);
    expect(readQueue(folders)).toEqual([]);
  });

  it.each(['999', 'abc'])('refuses the wrong id %s with not found and changes nothing', async (id) => {
    await postJson(pro.formUrl(key), { ...visitorForm, __token_unavailable: '1' });

    const run = await release(id);

    expect(run.status).not.toBe(0);
    expect(run.stdout + run.stderr).toContain(`spam log entry ${id} not found`);
    expect(spamLog()).toHaveLength(1);
    expect(readQueue(folders)).toEqual([]);
  });

  it('releases an entry once: the second run says not found and queues nothing more', async () => {
    await postJson(pro.formUrl(key), { ...visitorForm, __token_unavailable: '1' });
    const id = await idOf('token_unavailable');
    await release(id);

    const second = await release(id);

    expect(second.status).not.toBe(0);
    expect(second.stdout + second.stderr).toContain('not found');
    expect(readQueue(folders)).toHaveLength(1);
  });
});

describe('spam:list', () => {
  it('says so when the spam log is empty', async () => {
    const run = await spamList();

    expect(run.status).toBe(0);
    expect(run.stdout).toContain('The spam log is empty.');
  });

  it('masks the secret fields of an entry as project:show does', async () => {
    await postJson(pro.formUrl(key), { ...visitorForm, password: 'hunter2-secret', __token_unavailable: '1' });

    const run = await spamList();

    expect(run.stdout).toContain('"password":"***"');
    expect(run.stdout).not.toContain('hunter2-secret');
  });
});
