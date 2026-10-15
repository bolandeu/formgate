// Lite storage over HTTP, for each backend (SQLite, JSONL, guarded JSONL): where the files are, the stored request
// with its status and channel results, the spam log, retention, and the .htaccess that denies the storage files.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createSite,
  type FakeChannel,
  type Lite,
  postFormForJson,
  projectSettings,
  type Site,
  startFakeChannel,
  startLite,
} from '../support/lite.ts';
import { type Backend, backends, forceBackend, guardLine, readStored } from '../support/storage.ts';

const liteDir = fileURLToPath(new URL('../../lite/', import.meta.url));
const visitorForm = { __form: 'callback', name: 'Анна', phone: '+7 900 123-45-67', consent: '1' };

// The FilesMatch pattern of the shipped .htaccess and the rule inside it.
function htaccessRule() {
  const text = readFileSync(`${liteDir}.htaccess`, 'utf8');
  const match = /<FilesMatch "([^"]+)">([\s\S]*?)<\/FilesMatch>/.exec(text);
  if (!match) throw new Error('.htaccess has no FilesMatch block');
  return { pattern: new RegExp(match[1]), body: match[2] };
}

let telegram: FakeChannel;
let failing: FakeChannel;

beforeAll(async () => {
  telegram = await startFakeChannel();
  failing = await startFakeChannel();
  failing.answerWith(500, { ok: false, description: 'Internal Server Error' });
});

afterAll(async () => {
  await telegram.stop();
  await failing.stop();
});

afterEach(() => {
  telegram.calls.length = 0;
  failing.calls.length = 0;
});

describe.each(backends)('the %s backend', (backend: Backend) => {
  let site: Site;

  async function withLite(settings: object, run: (lite: Lite) => Promise<void>, now?: string) {
    const env = { ...forceBackend(backend, site), ...(now ? { FORMGATE_TEST_NOW: now } : {}) };
    const lite = await startLite(settings, {}, { site, env });
    try {
      await run(lite);
    } finally {
      lite.stop();
    }
  }

  beforeEach(() => {
    site = createSite();
  });

  afterEach(() => site.remove());

  it('keeps a valid request with status delivered and a honeypot request in the spam log', async () => {
    await withLite(projectSettings(telegram), async (lite) => {
      expect((await postFormForJson(lite.url, visitorForm)).body).toEqual({ ok: true });
      expect((await postFormForJson(lite.url, { ...visitorForm, website: 'x' })).body).toEqual({ ok: true });
    });

    const stored = readStored(backend, site);
    expect(stored.requests).toHaveLength(1);
    expect(stored.requests[0]).toMatchObject({
      form: 'callback',
      fields: { name: 'Анна', phone: '+7 900 123-45-67', consent: '1' },
      status: 'delivered',
      channels: { 'telegram #1': { delivered: true, reason: '' } },
    });
    expect(stored.spamLog).toHaveLength(1);
    expect(stored.spamLog[0]).toMatchObject({ form: 'callback', reason: 'honeypot' });
    expect(stored.spamLog[0].fields.website).toBe('x');
  });

  it('keeps the service field values of a spam log entry, so the request can be delivered as the visitor sent it', async () => {
    const service = { __subject: 'Звонок', __replyto: 'mail', __redirect: 'https://site.ru/ok/', __required: 'name,phone' };
    await withLite(projectSettings(telegram), async (lite) => {
      await postFormForJson(lite.url, { ...visitorForm, ...service, website: 'x' });
    });

    expect(readStored(backend, site).spamLog[0].service).toEqual({
      __form: 'callback',
      __subject: 'Звонок',
      __replyto: 'mail',
      __redirect: 'https://site.ru/ok/',
      __required: 'name,phone',
    });
  });

  it('keeps its files in its own place and nowhere else', async () => {
    const liteBefore = readdirSync(site.liteDir);
    await withLite(projectSettings(telegram), async (lite) => {
      await postFormForJson(lite.url, visitorForm);
    });

    const above = readdirSync(site.above).filter((name) => name !== 'public_html');
    const inLite = readdirSync(site.liteDir).filter((name) => !liteBefore.includes(name));
    if (backend === 'sqlite') {
      expect(above).toEqual(['formgate.sqlite']);
      expect(inLite).toEqual([]);
    } else if (backend === 'jsonl') {
      expect(above.sort()).toEqual(['formgate-duplicates.jsonl', 'formgate-rate-hits.jsonl', 'formgate-requests.jsonl']);
      expect(inLite).toEqual([]);
    } else {
      expect(above).toEqual([]);
      expect(inLite.sort()).toEqual(['formgate-duplicates.php', 'formgate-rate-hits.php', 'formgate-requests.php']);
      for (const name of inLite) {
        expect(readFileSync(`${site.liteDir}/${name}`, 'utf8').split('\n')[0]).toBe(guardLine);
      }
    }
    const { pattern } = htaccessRule();
    for (const name of [...above, ...inLite]) expect(name).toMatch(pattern);
  });

  it('stores status partial with both channel results when one channel fails, failed when all fail', async () => {
    const settings = projectSettings(telegram);
    const failingChannel = { type: 'telegram', options: { ...settings.channels[0].options, api_url: failing.url } };

    await withLite({ ...settings, channels: [...settings.channels, failingChannel] }, async (lite) => {
      expect((await postFormForJson(lite.url, visitorForm)).status).toBe(200);
    });
    await withLite({ ...settings, channels: [failingChannel] }, async (lite) => {
      expect((await postFormForJson(lite.url, visitorForm)).body).toMatchObject({ code: 'delivery_failed' });
    });

    const [partial, failed] = readStored(backend, site).requests;
    expect(partial.status).toBe('partial');
    expect(partial.channels['telegram #1']).toEqual({ delivered: true, reason: '' });
    expect(partial.channels['telegram #2'].delivered).toBe(false);
    expect(partial.channels['telegram #2'].reason).not.toBe('');
    expect(failed.status).toBe('failed');
    expect(failed.channels['telegram #1'].delivered).toBe(false);
  });

  // Requests and honeypot entries 31 and 29 days before 2026-03-01 12:00, then one request on that day.
  async function sendOverTime(settings: object) {
    const days = { old: '2026-01-29T12:00:00+03:00', kept: '2026-01-31T12:00:00+03:00', now: '2026-03-01T12:00:00+03:00' };
    for (const [name, now] of Object.entries(days)) {
      await withLite(
        settings,
        async (lite) => {
          await postFormForJson(lite.url, { ...visitorForm, name });
          if (name !== 'now') await postFormForJson(lite.url, { ...visitorForm, name, website: 'x' });
        },
        now,
      );
    }
    const stored = readStored(backend, site);
    return {
      requests: stored.requests.map((request) => request.fields.name),
      spamLog: stored.spamLog.map((entry) => entry.fields.name),
    };
  }

  it('with retention 30 days deletes the 31-day request and spam log entry and keeps the 29-day ones', async () => {
    const settings = projectSettings(telegram);
    const stored = await sendOverTime({ ...settings, project: { ...settings.project, retention_days: 30 } });

    expect(stored).toEqual({ requests: ['kept', 'now'], spamLog: ['kept'] });
  });

  it('without retention deletes nothing', async () => {
    const stored = await sendOverTime(projectSettings(telegram));

    expect(stored).toEqual({ requests: ['old', 'kept', 'now'], spamLog: ['old', 'kept'] });
  });
});

describe('the guarded backend over HTTP', () => {
  it('answers a GET of a storage file with no stored data', async () => {
    const site = createSite();
    const lite = await startLite(projectSettings(telegram), {}, { site, env: forceBackend('guarded', site) });
    try {
      await postFormForJson(lite.url, visitorForm);
      expect(existsSync(`${site.liteDir}/formgate-requests.php`)).toBe(true);

      const response = await fetch(lite.url.replace('submit.php', 'formgate-requests.php'));

      expect(response.status).toBe(200);
      expect(await response.text()).toBe('');
    } finally {
      lite.stop();
      site.remove();
    }
  });
});

describe('the Lite folder', () => {
  it('has an .htaccess that denies the settings file and the storage files, not the entry script', () => {
    expect(readdirSync(liteDir)).toContain('.htaccess');
    const { pattern, body } = htaccessRule();

    expect(body).toMatch(/^\s*Require all denied$/m);
    for (const name of ['formgate.php', 'formgate.sqlite', 'formgate-requests.jsonl', 'formgate-spam-log.php']) {
      expect(name).toMatch(pattern);
    }
    for (const name of ['submit.php', 'formgate.js', ['site', 'gen', '-form.php'].join('')]) expect(name).not.toMatch(pattern);
  });
});
