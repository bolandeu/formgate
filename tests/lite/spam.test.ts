// Lite spam filter over HTTP: a filled honeypot, no User-Agent, the rate limit per visitor IP and form (with
// X-Forwarded-For from trusted proxies) and duplicates within 10 minutes. The visitor always gets the normal
// success; nothing is delivered and the spam log gets the reason.
import { request as httpRequest } from 'node:http';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  type Answer,
  createSite,
  type FakeChannel,
  type Lite,
  postFormForJson,
  postForm,
  projectSettings,
  projectOrigin,
  type Site,
  startFakeChannel,
  startLite,
} from '../support/lite.ts';
import { readStored } from '../support/storage.ts';

const visitorForm = { __form: 'callback', name: 'Анна', phone: '+7 900 123-45-67', consent: '1' };
const success = { status: 200, body: { ok: true } };

let telegram: FakeChannel;
let site: Site;

// Project settings with the spam settings under test; the duplicate window is the default 10 minutes.
function spamSettings(project: Record<string, unknown> = {}) {
  const settings = projectSettings(telegram);
  const { duplicate_window_seconds: _off, ...withDefaultWindow } = settings.project;
  return { ...settings, project: { ...withDefaultWindow, rate_limit: { requests: 3, window_seconds: 600 }, ...project } };
}

async function withLite(settings: object, run: (lite: Lite) => Promise<void>, now?: string) {
  const lite = await startLite(settings, {}, { site, env: now ? { FORMGATE_TEST_NOW: now } : {} });
  try {
    await run(lite);
  } finally {
    lite.stop();
  }
}

function spamReasons() {
  return readStored('sqlite', site).spamLog.map((entry) => entry.reason);
}

function bodyOf(answer: Answer) {
  return { status: answer.status, body: answer.body };
}

// Posts a form that asks for JSON with node:http, which, unlike fetch, sends no User-Agent header.
function postWithoutUserAgent(url: string, fields: Record<string, string>) {
  const body = new URLSearchParams(fields).toString();
  return new Promise<{ status: number; body: unknown }>((resolve, reject) => {
    const outgoing = httpRequest(
      url,
      {
        method: 'POST',
        headers: {
          Origin: projectOrigin,
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (incoming) => {
        let text = '';
        incoming.on('data', (chunk) => (text += chunk));
        incoming.on('end', () => resolve({ status: incoming.statusCode ?? 0, body: JSON.parse(text) }));
      },
    );
    outgoing.on('error', reject);
    outgoing.end(body);
  });
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

describe('the honeypot', () => {
  it('website=x gets the normal success, is not delivered and goes to the spam log as honeypot', async () => {
    await withLite(spamSettings(), async (lite) => {
      expect(bodyOf(await postFormForJson(lite.url, { ...visitorForm, website: 'x' }))).toEqual(success);
    });

    expect(telegram.calls).toHaveLength(0);
    expect(spamReasons()).toEqual(['honeypot']);
  });

  it('a plain form with the honeypot gets the normal 303 to the thank-you page', async () => {
    await withLite(spamSettings(), async (lite) => {
      const answer = await postForm(lite.url, { ...visitorForm, website: 'x' });

      expect(answer.status).toBe(303);
      expect(answer.location).toBe('https://site.ru/thanks/');
    });

    expect(telegram.calls).toHaveLength(0);
  });

  it('empty is dropped: the channel gets no website line and the request is stored without it', async () => {
    await withLite(spamSettings(), async (lite) => {
      expect(bodyOf(await postFormForJson(lite.url, { ...visitorForm, website: '' }))).toEqual(success);
    });

    expect(telegram.calls).toHaveLength(1);
    const lines = String(telegram.calls[0].body.text).split('\n');
    expect(lines.slice(0, 3)).toEqual(['name: Анна', 'phone: +7 900 123-45-67', 'consent: 1']);
    expect(lines).toHaveLength(4);
    expect(readStored('sqlite', site).requests.map((request) => request.fields)).toEqual([
      { name: 'Анна', phone: '+7 900 123-45-67', consent: '1' },
    ]);
  });

  it('uses the field name of the settings', async () => {
    await withLite(spamSettings({ honeypot_field: 'fax' }), async (lite) => {
      expect(bodyOf(await postFormForJson(lite.url, { ...visitorForm, fax: 'x' }))).toEqual(success);
      expect(bodyOf(await postFormForJson(lite.url, { ...visitorForm, website: 'x' }))).toEqual(success);
    });

    expect(telegram.calls).toHaveLength(1);
    expect(spamReasons()).toEqual(['honeypot']);
  });
});

describe('the User-Agent', () => {
  it('missing gets the normal success, is not delivered and goes to the spam log as empty_user_agent', async () => {
    await withLite(spamSettings(), async (lite) => {
      expect(await postWithoutUserAgent(lite.url, visitorForm)).toEqual(success);
    });

    expect(telegram.calls).toHaveLength(0);
    expect(spamReasons()).toEqual(['empty_user_agent']);
  });
});

describe('the rate limit of 3 per IP and form', () => {
  it('drops the 4th request to the same form as rate_limit and delivers a 4th request to another form', async () => {
    await withLite(spamSettings(), async (lite) => {
      for (const name of ['Анна', 'Борис', 'Вера', 'Глеб']) {
        expect(bodyOf(await postFormForJson(lite.url, { ...visitorForm, name }))).toEqual(success);
      }
      expect(telegram.calls).toHaveLength(3);

      await postFormForJson(lite.url, { ...visitorForm, __form: 'vacancy' });
    });

    expect(telegram.calls).toHaveLength(4);
    expect(spamReasons()).toEqual(['rate_limit']);
  });

  async function sendFromClients(trustedProxies: string[]) {
    await withLite(spamSettings({ trusted_proxies: trustedProxies }), async (lite) => {
      for (const client of ['203.0.113.1', '203.0.113.2', '203.0.113.3', '203.0.113.4']) {
        await postForm(lite.url, { ...visitorForm, name: client }, { Accept: 'application/json', 'X-Forwarded-For': client });
      }
    });
  }

  it('counts each X-Forwarded-For client on its own when the peer is a trusted proxy', async () => {
    await sendFromClients(['127.0.0.1']);

    expect(telegram.calls).toHaveLength(4);
    expect(spamReasons()).toEqual([]);
  });

  it('ignores X-Forwarded-For when the peer is not a trusted proxy and counts one peer', async () => {
    await sendFromClients([]);

    expect(telegram.calls).toHaveLength(3);
    expect(spamReasons()).toEqual(['rate_limit']);
  });
});

describe('a duplicate', () => {
  const fields = { ...visitorForm, name: 'Анна Иванова', message: 'Перезвоните после обеда' };
  const sameWithOtherSpacesAndCase = {
    ...fields,
    name: '  анна   ИВАНОВА ',
    phone: '+7900 123-45-67',
    message: 'перезвоните после  обеда',
  };

  it('within 10 minutes gets the normal success and goes to the spam log; 11 minutes later it is delivered', async () => {
    const send = (now: string, form: Record<string, string>) =>
      withLite(spamSettings(), async (lite) => {
        expect(bodyOf(await postFormForJson(lite.url, form))).toEqual(success);
      }, now);

    await send('2026-03-01T12:00:00+03:00', fields);
    await send('2026-03-01T12:01:00+03:00', sameWithOtherSpacesAndCase);
    expect(telegram.calls).toHaveLength(1);
    expect(spamReasons()).toEqual(['duplicate']);

    await send('2026-03-01T12:11:00+03:00', fields);
    expect(telegram.calls).toHaveLength(2);
  });

  it('for another form is delivered', async () => {
    await withLite(spamSettings(), async (lite) => {
      await postFormForJson(lite.url, fields);
      await postFormForJson(lite.url, { ...fields, __form: 'vacancy' });
    });

    expect(telegram.calls).toHaveLength(2);
    expect(spamReasons()).toEqual([]);
  });
});
