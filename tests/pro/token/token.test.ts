// The time token of Pro over HTTP: GET /f/<key>?token gives a token per project with the CORS of its domains, a post
// with a valid token is queued and delivered, a token of another project is a bad_signature, and without
// FORMGATE_TOKEN_SECRET the token request answers server_error and the project self-check names the missing secret.
// The clock moves by FORMGATE_TEST_NOW, one Pro start per moment.
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type FakeChannel, postJson, projectOrigin, projectSettings, requestToken, startFakeChannel } from '../../support/lite.ts';
import { createProFolders, type ProFolders, readQueue, runWorkerOnce, startPro } from '../../support/pro.ts';
import { runProject } from '../../support/pro-projects.ts';

const keyA = 'TokenProjectAAAA';
const keyB = 'TokenProjectBBBB';
const issuedAt = '2026-03-01T12:00:00+03:00';
const visitorForm = { __form: 'callback', name: 'Анна', phone: '+7 900 123-45-67', consent: '1' };

let channel: FakeChannel;
let folders: ProFolders;

// A moment `seconds` after the token was issued.
function after(seconds: number) {
  return new Date(Date.parse(issuedAt) + seconds * 1000).toISOString();
}

function writeProjects(keys: string[], project: Record<string, unknown> = {}) {
  const settings = projectSettings(channel);
  for (const key of keys) {
    folders.writeProject(key, { ...settings, project: { ...settings.project, require_token: true, ...project } });
  }
}

async function withPro<T>(now: string, run: (formUrl: (key: string) => string) => Promise<T>): Promise<T> {
  const pro = await startPro(folders, { FORMGATE_TEST_NOW: now });
  try {
    return await run(pro.formUrl);
  } finally {
    pro.stop();
  }
}

async function issueToken(key: string): Promise<string> {
  return withPro(issuedAt, async (formUrl) => String((await requestToken(formUrl(key))).body?.token));
}

async function postAt(seconds: number, key: string, fields: Record<string, unknown>) {
  return withPro(after(seconds), async (formUrl) => (await postJson(formUrl(key), fields)).status);
}

function spamReasons(): string[] {
  const db = new DatabaseSync(join(folders.data, 'formgate.sqlite'), { readOnly: true });
  try {
    return db.prepare('SELECT project_key, reason FROM spam_log ORDER BY id').all().map((row) => `${row.project_key} ${row.reason}`);
  } finally {
    db.close();
  }
}

beforeEach(async () => {
  channel = await startFakeChannel();
  folders = createProFolders();
  folders.env.FORMGATE_TOKEN_SECRET = 'test-token-secret-of-pro';
});

afterEach(async () => {
  folders.remove();
  await channel.stop();
});

describe('a project with require_token on', () => {
  it('gives a token with the lower limit and the CORS of the project domain, and delivers a post made 6 s later with it', async () => {
    writeProjects([keyA]);

    const answer = await withPro(issuedAt, async (formUrl) => requestToken(formUrl(keyA)));
    expect(answer.status).toBe(200);
    expect(answer.body).toEqual({ token: expect.stringMatching(/^\d+\.[\w-]+\.[\w-]+$/), min_seconds: 5 });
    expect(answer.headers.get('access-control-allow-origin')).toBe(projectOrigin);

    const status = await postAt(6, keyA, { ...visitorForm, __token: String(answer.body?.token) });
    await runWorkerOnce(folders, after(7));

    expect(status).toBe(200);
    expect(readQueue(folders).map((queued) => [queued.project_key, queued.status])).toEqual([[keyA, 'delivered']]);
    expect(channel.calls).toHaveLength(1);
    expect(spamReasons()).toEqual([]);
  });

  it('answers project_not_found to a token request for an unknown key', async () => {
    writeProjects([keyA]);

    const answer = await withPro(issuedAt, async (formUrl) => requestToken(formUrl('NoSuchProject123')));

    expect(answer.status).toBe(404);
    expect(answer.body).toMatchObject({ ok: false, code: 'project_not_found' });
  });

  it('refuses a token request from a domain that is not the project domain', async () => {
    writeProjects([keyA]);

    const answer = await withPro(issuedAt, async (formUrl) => requestToken(formUrl(keyA), 'https://evil.example'));

    expect(answer.status).toBe(403);
  });

  it('logs the token of project A posted to project B as bad_signature and delivers nothing', async () => {
    writeProjects([keyA, keyB]);
    const token = await issueToken(keyA);

    const status = await postAt(6, keyB, { ...visitorForm, __token: token });

    expect(status).toBe(200);
    expect(spamReasons()).toEqual([`${keyB} bad_signature`]);
    expect(readQueue(folders)).toEqual([]);
  });

  it('logs a post that comes before the lower limit as too_fast', async () => {
    writeProjects([keyA], { token_min_seconds: 10 });
    const token = await issueToken(keyA);

    await postAt(2, keyA, { ...visitorForm, __token: token });

    expect(spamReasons()).toEqual([`${keyA} too_fast`]);
  });
});

describe('without FORMGATE_TOKEN_SECRET', () => {
  beforeEach(() => {
    delete folders.env.FORMGATE_TOKEN_SECRET;
    writeProjects([keyA]);
  });

  it('answers server_error to the token request', async () => {
    const answer = await withPro(issuedAt, async (formUrl) => requestToken(formUrl(keyA)));

    expect(answer.status).toBe(500);
    expect(answer.body).toMatchObject({ ok: false, code: 'server_error' });
  });

  it('names the missing secret in the project self-check and fails it', async () => {
    const run = await runProject(folders, 'self-check', [keyA]);

    expect(run.stdout).toMatch(/^fail\s+Time token: .*FORMGATE_TOKEN_SECRET/m);
    expect(run.status).not.toBe(0);
  });
});
