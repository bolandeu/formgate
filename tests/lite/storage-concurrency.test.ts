// Lite storage under parallel requests, for each backend: php -S runs several workers, 20 requests come at once,
// and every request, every rate hit and every stored line or row must be there whole.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSite, type FakeChannel, postFormForJson, projectSettings, startFakeChannel, startLite } from '../support/lite.ts';
import { type Backend, backends, forceBackend, readStored } from '../support/storage.ts';

const parallelRequests = 20;

let telegram: FakeChannel;

beforeAll(async () => {
  telegram = await startFakeChannel();
});

afterAll(async () => {
  await telegram.stop();
});

describe.each(backends)('the %s backend', (backend: Backend) => {
  it('stores all of 20 parallel requests whole and counts 20 rate hits', async () => {
    const site = createSite();
    const env = { ...forceBackend(backend, site), PHP_CLI_SERVER_WORKERS: '8' };
    const lite = await startLite(projectSettings(telegram), {}, { site, env });
    const names = Array.from({ length: parallelRequests }, (_, index) => `Посетитель ${index + 1}`);
    try {
      const answers = await Promise.all(
        names.map((name) => postFormForJson(lite.url, { __form: 'callback', name, phone: '+7 900 123-45-67', consent: '1' })),
      );
      expect(answers.map((answer) => answer.status)).toEqual(names.map(() => 200));

      const stored = readStored(backend, site);
      expect(stored.requests.map((request) => request.fields.name).sort()).toEqual([...names].sort());
      for (const request of stored.requests) {
        expect(request).toMatchObject({
          form: 'callback',
          fields: { phone: '+7 900 123-45-67', consent: '1' },
          status: 'delivered',
        });
      }
      expect(stored.rateHits).toBe(parallelRequests);
    } finally {
      lite.stop();
      site.remove();
    }
  });
});
