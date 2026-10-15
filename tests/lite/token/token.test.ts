// The time token of Lite over HTTP: GET <form address>?token gives a signed token and the lower limit with the CORS
// of posts; with require_token on, a post without a valid __token gets the normal success, is not delivered and goes
// to the spam log with the token reason. The clock moves by FORMGATE_TEST_NOW, one Lite start per moment.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  type Answer,
  createSite,
  type FakeChannel,
  type Lite,
  postJson,
  projectSettings,
  requestToken,
  type Site,
  startFakeChannel,
  startLite,
} from '../../support/lite.ts';
import { type Backend, forceBackend, readStored } from '../../support/storage.ts';

const issuedAt = '2026-03-01T12:00:00+03:00';
const visitorForm = { __form: 'callback', name: 'Анна', phone: '+7 900 123-45-67', consent: '1' };
const success = { status: 200, body: { ok: true } };

let telegram: FakeChannel;
let site: Site;

function tokenSettings(project: Record<string, unknown> = {}) {
  const settings = projectSettings(telegram);
  return { ...settings, project: { ...settings.project, require_token: true, ...project } };
}

// A moment `seconds` after the token was issued.
function after(seconds: number) {
  return new Date(Date.parse(issuedAt) + seconds * 1000).toISOString();
}

async function withLite<T>(settings: object, now: string, run: (lite: Lite) => Promise<T>, env: object = {}) {
  const lite = await startLite(settings, {}, { site, env: { FORMGATE_TEST_NOW: now, ...env } });
  try {
    return await run(lite);
  } finally {
    lite.stop();
  }
}

async function issueToken(settings: object = tokenSettings(), env: object = {}): Promise<string> {
  return withLite(settings, issuedAt, async (lite) => String((await requestToken(lite.url)).body?.token), env);
}

async function postAt(seconds: number, fields: Record<string, unknown>, settings: object = tokenSettings()) {
  return withLite(settings, after(seconds), async (lite) => bodyOf(await postJson(lite.url, fields)));
}

function bodyOf(answer: Answer) {
  return { status: answer.status, body: answer.body };
}

function spamLog(backend: Backend = 'sqlite') {
  return readStored(backend, site).spamLog;
}

beforeAll(async () => {
  telegram = await startFakeChannel();
});

afterAll(async () => {
  await telegram.stop();
});

beforeEach(() => {
  site = createSite();
});

afterEach(() => {
  site.remove();
  telegram.calls.length = 0;
});

describe('require_token off', () => {
  it('delivers a form without __token as today', async () => {
    expect(await postAt(0, visitorForm, projectSettings(telegram))).toEqual(success);

    expect(telegram.calls).toHaveLength(1);
    expect(spamLog()).toEqual([]);
  });

  it('drops __token and __token_unavailable from the fields', async () => {
    await postAt(0, { ...visitorForm, __token: 'x', __token_unavailable: '1' }, projectSettings(telegram));

    expect(readStored('sqlite', site).requests.map((request) => request.fields)).toEqual([
      { name: 'Анна', phone: '+7 900 123-45-67', consent: '1' },
    ]);
  });
});

describe('GET ?token', () => {
  it('from the project domain answers 200 with the token, min_seconds 5 and the CORS headers', async () => {
    const answer = await withLite(tokenSettings(), issuedAt, (lite) => requestToken(lite.url));

    expect(answer.status).toBe(200);
    expect(Object.keys(answer.body ?? {}).sort()).toEqual(['min_seconds', 'token']);
    expect(answer.body?.min_seconds).toBe(5);
    expect(answer.body?.token).toMatch(/^[A-Za-z0-9_.-]+$/);
    expect(answer.headers.get('access-control-allow-origin')).toBe('https://site.ru');
    expect(answer.headers.get('vary')).toBe('Origin');
  });

  it('from another domain is refused as a post: 403 origin_not_allowed, no CORS headers', async () => {
    const answer = await withLite(tokenSettings(), issuedAt, (lite) => requestToken(lite.url, 'https://other.ru'));

    expect(answer.status).toBe(403);
    expect(answer.body?.code).toBe('origin_not_allowed');
    expect(answer.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('gives the min_seconds of the settings', async () => {
    const answer = await withLite(tokenSettings({ token_min_seconds: 1 }), issuedAt, (lite) => requestToken(lite.url));

    expect(answer.body?.min_seconds).toBe(1);
  });
});

describe('require_token on', () => {
  it('delivers a request with a token 6 s old; the same token again goes to the spam log as reused', async () => {
    const token = await issueToken();

    expect(await postAt(6, { ...visitorForm, __token: token })).toEqual(success);
    expect(telegram.calls).toHaveLength(1);
    expect(await postAt(7, { ...visitorForm, name: 'Борис', __token: token })).toEqual(success);

    expect(telegram.calls).toHaveLength(1);
    expect(spamLog().map((entry) => entry.reason)).toEqual(['reused']);
  });

  it('keeps a used token after the duplicate window: 20 minutes later it is still reused', async () => {
    const token = await issueToken();
    const settings = tokenSettings({ duplicate_window_seconds: 600 });

    await postAt(6, { ...visitorForm, __token: token }, settings);
    await postAt(1206, { ...visitorForm, name: 'Борис', __token: token }, settings);

    expect(telegram.calls).toHaveLength(1);
    expect(spamLog().map((entry) => entry.reason)).toEqual(['reused']);
  });

  it('answers success to a missing, early, late and forged token, delivers none and logs each reason', async () => {
    const token = await issueToken();
    const lastCharacter = token.at(-1) === 'A' ? 'B' : 'A';
    const forged = token.slice(0, -1) + lastCharacter;

    const answers = [
      await postAt(10, visitorForm),
      await postAt(2, { ...visitorForm, __token: token }),
      await postAt(3 * 3600, { ...visitorForm, __token: token }),
      await postAt(10, { ...visitorForm, __token: forged }),
    ];

    expect(answers).toEqual([success, success, success, success]);
    expect(telegram.calls).toHaveLength(0);
    expect(spamLog().map((entry) => entry.reason)).toEqual(['token_missing', 'too_fast', 'expired', 'bad_signature']);
  });

  it('uses the limits of the settings: 1 s and 60 s', async () => {
    const settings = tokenSettings({ token_min_seconds: 1, token_max_seconds: 60 });
    const [early, late] = [await issueToken(settings), await issueToken(settings)];

    await postAt(2, { ...visitorForm, __token: early }, settings);
    await postAt(61, { ...visitorForm, name: 'Борис', __token: late }, settings);

    expect(telegram.calls).toHaveLength(1);
    expect(spamLog().map((entry) => entry.reason)).toEqual(['expired']);
  });

  it('logs __token_unavailable=1 without a token as token_unavailable with all its fields', async () => {
    const fields = { ...visitorForm, message: 'Перезвоните', website: '' };

    expect(await postAt(0, { ...fields, __token_unavailable: '1' })).toEqual(success);

    expect(telegram.calls).toHaveLength(0);
    expect(spamLog()).toEqual([
      {
        received_at: '2026-03-01T09:00:00Z',
        form: 'callback',
        fields: { name: 'Анна', phone: '+7 900 123-45-67', consent: '1', message: 'Перезвоните', website: '' },
        service: { __form: 'callback', __subject: '', __replyto: 'email', __redirect: '', __required: '' },
        reason: 'token_unavailable',
      },
    ]);
  });
});

describe('the signing key', () => {
  it('appears above the site root on the first token request and is not served over HTTP', async () => {
    const keyFile = join(site.above, 'formgate-token-key.jsonl');

    await issueToken();

    const secret = String(JSON.parse(readFileSync(keyFile, 'utf8')).secret);
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    const served = await withLite(tokenSettings(), issuedAt, async (lite) => {
      const response = await fetch(new URL('/formgate-token-key.jsonl', lite.url));
      return { status: response.status, text: await response.text() };
    });
    expect(served.status).toBe(404);
    expect(served.text).not.toContain(secret);
  });

  it('without a writable place above the site root is a guarded file in the Lite folder that shows nothing', async () => {
    const env = forceBackend('guarded', site);

    await issueToken(tokenSettings(), env);

    const [guard, record] = readFileSync(join(site.liteDir, 'formgate-token-key.php'), 'utf8').split('\n');
    expect(guard).toBe('<?php exit; ?>');
    const secret = String(JSON.parse(record).secret);
    const served = await withLite(tokenSettings(), issuedAt, async (lite) => {
      const response = await fetch(new URL('/formgate/formgate-token-key.php', lite.url));
      return response.text();
    }, env);
    expect(served).toBe('');
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
  });

  it('signs for one Lite install: a token of another install fails with bad_signature', async () => {
    const ownSite = site;
    site = createSite();
    const foreignToken = await issueToken();
    site.remove();
    site = ownSite;

    await postAt(10, { ...visitorForm, __token: foreignToken });

    expect(telegram.calls).toHaveLength(0);
    expect(spamLog().map((entry) => entry.reason)).toEqual(['bad_signature']);
  });
});
