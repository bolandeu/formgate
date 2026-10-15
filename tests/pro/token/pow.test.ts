// The ALTCHA proof-of-work of Pro over HTTP: with require_token and require_pow set (project:set), GET /f/<key>?token
// adds the challenge with the pow_max_number of the project, a post with the solved __pow is delivered without __pow in
// the message, and a post without it goes to the spam log as pow_missing, which spam:release delivers.
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Challenge, type FakeChannel, postJson, requestToken, solvePow, startFakeChannel } from '../../support/lite.ts';
import { createProFolders, type ProFolders, readQueue, runCli, runWorkerOnce, startPro } from '../../support/pro.ts';
import { createProject, runProject } from '../../support/pro-projects.ts';

const issuedAt = '2026-03-01T12:00:00+03:00';
const visitorForm = { __form: 'callback', name: 'Анна', phone: '+7 900 123-45-67', consent: '1' };
const powMaxNumber = 2000;

let channel: FakeChannel;
let folders: ProFolders;
let key: string;

function after(seconds: number) {
  return new Date(Date.parse(issuedAt) + seconds * 1000).toISOString();
}

async function withPro<T>(now: string, run: (formUrl: (projectKey: string) => string) => Promise<T>): Promise<T> {
  const pro = await startPro(folders, { FORMGATE_TEST_NOW: now });
  try {
    return await run(pro.formUrl);
  } finally {
    pro.stop();
  }
}

function spamLog() {
  const db = new DatabaseSync(join(folders.data, 'formgate.sqlite'), { readOnly: true });
  try {
    return db.prepare('SELECT id, reason FROM spam_log ORDER BY id').all().map((row) => ({ id: String(row.id), reason: String(row.reason) }));
  } finally {
    db.close();
  }
}

beforeEach(async () => {
  channel = await startFakeChannel();
  folders = createProFolders();
  folders.env.FORMGATE_TOKEN_SECRET = 'test-token-secret-of-pro';
  key = await createProject(folders, 'Acme', 'site.ru', ['telegram', '-o', 'bot_token=123:ABC', '-o', 'chat_id=-100', '-o', `api_url=${channel.url}`]);
  for (const [path, value] of [['project.require_token', 'true'], ['project.require_pow', 'true'], ['project.pow_max_number', String(powMaxNumber)]]) {
    expect((await runProject(folders, 'set', [key, path, value])).status).toBe(0);
  }
});

afterEach(async () => {
  folders.remove();
  await channel.stop();
});

describe('a Pro project with require_token and require_pow', () => {
  it('answers GET ?token with a challenge whose maxnumber is project.pow_max_number', async () => {
    const answer = await withPro(issuedAt, async (formUrl) => requestToken(formUrl(key), 'https://site.ru'));

    expect(answer.status).toBe(200);
    expect(answer.body?.challenge).toMatchObject({ algorithm: 'SHA-256', maxnumber: powMaxNumber });
  });

  it('delivers a post with the token and the solved __pow, and __pow is not in the message', async () => {
    const issued = await withPro(issuedAt, async (formUrl) => requestToken(formUrl(key), 'https://site.ru'));
    const pow = await solvePow(issued.body?.challenge as Challenge);

    const status = await withPro(after(6), async (formUrl) =>
      (await postJson(formUrl(key), { ...visitorForm, __token: String(issued.body?.token), __pow: pow }, { Origin: 'https://site.ru' })).status);
    await runWorkerOnce(folders, after(7));

    expect(status).toBe(200);
    expect(channel.calls).toHaveLength(1);
    expect(String(channel.calls[0].body.text)).not.toContain(pow);
    expect(String(channel.calls[0].body.text)).not.toContain('__pow');
    expect(spamLog()).toEqual([]);
  });

  it('logs a post without __pow as pow_missing, and spam:release delivers it', async () => {
    const issued = await withPro(issuedAt, async (formUrl) => requestToken(formUrl(key), 'https://site.ru'));
    await withPro(after(6), async (formUrl) =>
      postJson(formUrl(key), { ...visitorForm, __token: String(issued.body?.token) }, { Origin: 'https://site.ru' }));

    const [entry] = spamLog();
    const release = await runCli(folders, ['spam:release', entry.id], { COLUMNS: '1000' });
    await runWorkerOnce(folders, after(7));

    expect(entry.reason).toBe('pow_missing');
    expect(release.status).toBe(0);
    expect(spamLog()).toEqual([]);
    expect(readQueue(folders).map((queued) => queued.status)).toEqual(['delivered']);
    expect(channel.calls).toHaveLength(1);
  });

  it('logs a plain form without __token and __pow as pow_missing', async () => {
    await withPro(after(6), async (formUrl) => postJson(formUrl(key), visitorForm, { Origin: 'https://site.ru' }));

    expect(spamLog().map((entry) => entry.reason)).toEqual(['pow_missing']);
  });
});
