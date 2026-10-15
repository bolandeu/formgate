// The server data of a Lite request (FORMGATE-042): request id, visitor IP, User-Agent and origin host, stored with each
// request and spam log entry in every backend, removed by retention with the request.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createSite,
  type FakeChannel,
  type Lite,
  postForm,
  projectSettings,
  type Site,
  startFakeChannel,
  startLite,
} from '../support/lite.ts';
import { type Backend, backends, forceBackend, readStored } from '../support/storage.ts';

const visitorForm = { __form: 'callback', name: 'Анна', phone: '+7 900 123-45-67', consent: '1' };
const visitorHeaders = { 'X-Forwarded-For': '203.0.113.5', 'User-Agent': 'TestUA/1.0', Accept: 'application/json' };

let telegram: FakeChannel;

beforeAll(async () => {
  telegram = await startFakeChannel();
});

afterAll(() => telegram.stop());

function behindProxy() {
  const settings = projectSettings(telegram);
  return { ...settings, project: { ...settings.project, trusted_proxies: ['127.0.0.1', '::1'] } };
}

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

  it('stores the request id, IP, User-Agent and origin host of a delivered request and of a honeypot request', async () => {
    await withLite(behindProxy(), async (lite) => {
      await postForm(lite.url, visitorForm, visitorHeaders);
      await postForm(lite.url, { ...visitorForm, website: 'x' }, visitorHeaders);
    });

    const stored = readStored(backend, site);
    const expected = { ip: '203.0.113.5', user_agent: 'TestUA/1.0', origin_host: 'site.ru' };
    expect(stored.requests[0]).toMatchObject(expected);
    expect(stored.requests[0].request_id).toMatch(/^[A-Za-z0-9_-]{16,}$/);
    expect(stored.spamLog[0]).toMatchObject(expected);
    expect(stored.spamLog[0].request_id).toMatch(/^[A-Za-z0-9_-]{16,}$/);
    expect(stored.spamLog[0].request_id).not.toBe(stored.requests[0].request_id);
  });

  it('takes the host of Referer when Origin is missing, cuts the User-Agent to 512 characters and ignores X-Forwarded-For of an untrusted peer', async () => {
    await withLite(projectSettings(telegram), async (lite) => {
      const headers = { Referer: 'https://Site.ru/price?a=1', 'User-Agent': 'U'.repeat(600), 'X-Forwarded-For': '203.0.113.5' };
      await postForm(lite.url, visitorForm, headers);
    });

    const [request] = readStored(backend, site).requests;
    expect(request.origin_host).toBe('site.ru');
    expect(request.user_agent).toBe('U'.repeat(512));
    expect(request.ip).toMatch(/^(127\.0\.0\.1|::1)$/);
  });

  it('removes the server data with the request when retention deletes it', async () => {
    const settings = behindProxy();
    const withRetention = { ...settings, project: { ...settings.project, retention_days: 1 } };
    await withLite(withRetention, async (lite) => {
      await postForm(lite.url, { ...visitorForm, name: 'old' }, visitorHeaders);
      await postForm(lite.url, { ...visitorForm, name: 'old', website: 'x' }, visitorHeaders);
    }, '2026-03-01T12:00:00+03:00');
    expect(readStored(backend, site).requests).toHaveLength(1);

    await withLite(withRetention, async (lite) => {
      await postForm(lite.url, { ...visitorForm, name: 'new' }, { ...visitorHeaders, 'X-Forwarded-For': '203.0.113.9' });
    }, '2026-03-03T12:00:00+03:00');

    const stored = readStored(backend, site);
    expect(stored.requests.map((request) => request.ip)).toEqual(['203.0.113.9']);
    expect(stored.spamLog).toEqual([]);
  });
});
