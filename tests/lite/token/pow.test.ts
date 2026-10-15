// ALTCHA proof-of-work of Lite over HTTP: with require_pow on, GET ?token adds the challenge bound to the token, and
// a post needs __pow, the solved challenge; a post without a valid one goes to the spam log. The clock moves by
// FORMGATE_TEST_NOW, one Lite start per moment. Challenges are solved with altcha-lib, as the widget does.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  type Answer,
  type Challenge,
  createSite,
  type FakeChannel,
  type Lite,
  postJson,
  projectSettings,
  requestToken,
  type Site,
  solvePow,
  startFakeChannel,
  startLite,
} from '../../support/lite.ts';
import { readStored } from '../../support/storage.ts';

const issuedAt = '2026-03-01T12:00:00+03:00';
const visitorForm = { __form: 'callback', name: 'Анна', phone: '+7 900 123-45-67', consent: '1' };
const success = { status: 200, body: { ok: true } };
const powMaxNumber = 2000;

let telegram: FakeChannel;
let site: Site;

function powSettings(project: Record<string, unknown> = {}) {
  const settings = projectSettings(telegram);
  return {
    ...settings,
    project: { ...settings.project, require_token: true, require_pow: true, pow_max_number: powMaxNumber, ...project },
  };
}

function after(seconds: number) {
  return new Date(Date.parse(issuedAt) + seconds * 1000).toISOString();
}

async function withLite<T>(settings: object, now: string, run: (lite: Lite) => Promise<T>) {
  const lite = await startLite(settings, {}, { site, env: { FORMGATE_TEST_NOW: now } });
  try {
    return await run(lite);
  } finally {
    lite.stop();
  }
}

// A token with its challenge, asked as the client does.
async function issue(settings: object = powSettings()) {
  const answer = await withLite(settings, issuedAt, (lite) => requestToken(lite.url));
  return { token: String(answer.body?.token), challenge: answer.body?.challenge as Challenge };
}

async function postAt(seconds: number, fields: Record<string, unknown>, settings: object = powSettings()) {
  return withLite(settings, after(seconds), async (lite) => bodyOf(await postJson(lite.url, fields)));
}

function bodyOf(answer: Answer) {
  return { status: answer.status, body: answer.body };
}

function spamReasons() {
  return readStored('sqlite', site).spamLog.map((entry) => entry.reason);
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

describe('GET ?token with require_pow on', () => {
  it('adds the SHA-256 challenge with maxnumber of the settings to the token and min_seconds', async () => {
    const answer = await withLite(powSettings(), issuedAt, (lite) => requestToken(lite.url));

    expect(answer.status).toBe(200);
    expect(Object.keys(answer.body ?? {}).sort()).toEqual(['challenge', 'min_seconds', 'token']);
    expect(answer.body?.challenge).toEqual({
      algorithm: 'SHA-256',
      maxnumber: powMaxNumber,
      challenge: expect.stringMatching(/^[0-9a-f]{64}$/),
      salt: expect.any(String),
      signature: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });
});

describe('POST with require_pow on', () => {
  it('delivers a request with the solved __pow and keeps __pow out of the stored fields and the message', async () => {
    const { token, challenge } = await issue();
    const pow = await solvePow(challenge);

    expect(await postAt(6, { ...visitorForm, __token: token, __pow: pow })).toEqual(success);

    expect(telegram.calls).toHaveLength(1);
    const messageLines = String(telegram.calls[0].body.text).split('\n');
    expect(messageLines.filter((line) => line.startsWith('__pow') || line.includes(pow))).toEqual([]);
    expect(readStored('sqlite', site).requests.map((request) => request.fields)).toEqual([
      { name: 'Анна', phone: '+7 900 123-45-67', consent: '1' },
    ]);
  });

  it('logs a request without __pow as pow_missing and answers success', async () => {
    const { token } = await issue();

    expect(await postAt(6, { ...visitorForm, __token: token })).toEqual(success);

    expect(telegram.calls).toHaveLength(0);
    expect(spamReasons()).toEqual(['pow_missing']);
  });

  it('logs a plain form without the client, so without __token and __pow, as pow_missing and answers success', async () => {
    expect(await postAt(6, visitorForm)).toEqual(success);

    expect(telegram.calls).toHaveLength(0);
    expect(spamReasons()).toEqual(['pow_missing']);
  });

  it('logs __token_unavailable=1 without __token and __pow as token_unavailable', async () => {
    expect(await postAt(6, { ...visitorForm, __token_unavailable: '1' })).toEqual(success);

    expect(spamReasons()).toEqual(['token_unavailable']);
  });

  it('logs a wrong number, the solution of another token and an unreadable __pow as pow_invalid', async () => {
    const [first, second, third] = [await issue(), await issue(), await issue()];
    const solved = JSON.parse(Buffer.from(await solvePow(first.challenge), 'base64').toString());
    const wrongNumber = Buffer.from(JSON.stringify({ ...solved, number: solved.number + 1 })).toString('base64');

    const answers = [
      await postAt(6, { ...visitorForm, __token: first.token, __pow: wrongNumber }),
      await postAt(6, { ...visitorForm, __token: second.token, __pow: await solvePow(first.challenge) }),
      await postAt(6, { ...visitorForm, __token: third.token, __pow: 'not a payload' }),
    ];

    expect(answers).toEqual([success, success, success]);
    expect(telegram.calls).toHaveLength(0);
    expect(spamReasons()).toEqual(['pow_invalid', 'pow_invalid', 'pow_invalid']);
  });

  it('logs the same __token and __pow sent a second time as reused', async () => {
    const { token, challenge } = await issue();
    const fields = { ...visitorForm, __token: token, __pow: await solvePow(challenge) };

    await postAt(6, fields);
    await postAt(7, { ...fields, name: 'Борис' });

    expect(telegram.calls).toHaveLength(1);
    expect(spamReasons()).toEqual(['reused']);
  });
});

describe('require_pow off', () => {
  it('ignores __pow and keeps it out of the stored fields', async () => {
    const settings = powSettings({ require_pow: false });
    const { token } = await issue(settings);

    expect(await postAt(6, { ...visitorForm, __token: token, __pow: 'x' }, settings)).toEqual(success);

    expect(readStored('sqlite', site).requests.map((request) => request.fields)).toEqual([
      { name: 'Анна', phone: '+7 900 123-45-67', consent: '1' },
    ]);
  });
});

describe('the settings', () => {
  it.each([
    ['require_pow without require_token', { require_token: false }, 'project.require_pow (needs project.require_token)'],
    ['pow_max_number below 1000', { pow_max_number: 10 }, 'project.pow_max_number'],
    ['pow_max_number above 10000000', { pow_max_number: 10000001 }, 'project.pow_max_number'],
  ])('refuses %s', async (_name, project, message) => {
    const lite = await startLite(powSettings(project), {}, { site });
    try {
      await requestToken(lite.url);
      expect(lite.errorLog()).toContain(`has no valid ${message}`);
    } finally {
      lite.stop();
    }
  });
});
