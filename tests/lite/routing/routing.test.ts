// Lite routing over HTTP: a special case sends a request only to its channels, other requests take the default route
// (all channels); the route of each request is stored in every storage backend.
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
  telegramChannel,
} from '../../support/lite.ts';
import { type Backend, backends, forceBackend, readStored, writeOldRequest } from '../../support/storage.ts';

const visitorForm = { name: 'Анна', phone: '+7 900 123-45-67', consent: '1' };

let first: FakeChannel;
let second: FakeChannel;

beforeAll(async () => {
  first = await startFakeChannel();
  second = await startFakeChannel();
});

afterAll(async () => {
  await first.stop();
  await second.stop();
});

afterEach(() => {
  first.calls.length = 0;
  second.calls.length = 0;
});

// Settings with channel #1 on the first fake server and #2 on the second, and the given special cases.
function routedSettings(cases: object[], secondName?: string) {
  return { ...projectSettings(first), channels: [telegramChannel(first), telegramChannel(second, secondName)], cases };
}

// The number of requests each channel got: [#1, #2].
function deliveries() {
  return [first.calls.length, second.calls.length];
}

describe('routing', () => {
  let lite: Lite | undefined;

  afterEach(() => lite?.stop());

  it('sends a vacancy only to the channel of its case and a callback to all channels', async () => {
    lite = await startLite(routedSettings([{ when: { form: 'vacancy' }, channels: [2] }]));

    expect((await postFormForJson(lite.url, { ...visitorForm, __form: 'vacancy' })).body).toEqual({ ok: true });
    expect(deliveries()).toEqual([0, 1]);

    expect((await postFormForJson(lite.url, { ...visitorForm, __form: 'callback' })).body).toEqual({ ok: true });
    expect(deliveries()).toEqual([1, 2]);
  });

  it('matches a field value without case and outer spaces, and needs every condition of the case', async () => {
    lite = await startLite(routedSettings([{ when: { form: 'callback', field: 'city', equals: 'Москва' }, channels: [2] }]));

    await postFormForJson(lite.url, { ...visitorForm, __form: 'callback', city: ' москва ' });
    expect(deliveries()).toEqual([0, 1]);

    await postFormForJson(lite.url, { ...visitorForm, __form: 'callback', city: 'Казань' });
    expect(deliveries()).toEqual([1, 2]);
  });

  it('takes only the first of two matching cases', async () => {
    lite = await startLite(
      routedSettings([
        { when: { form: 'vacancy' }, channels: [1] },
        { when: { form: 'vacancy' }, channels: [2] },
      ]),
    );

    await postFormForJson(lite.url, { ...visitorForm, __form: 'vacancy' });

    expect(deliveries()).toEqual([1, 0]);
  });

  it('finds a channel of a case by the channel name', async () => {
    lite = await startLite(routedSettings([{ when: { form: 'vacancy' }, channels: ['hr'] }], 'hr'));

    await postFormForJson(lite.url, { ...visitorForm, __form: 'vacancy' });

    expect(deliveries()).toEqual([0, 1]);
  });
});

describe.each(backends)('the route in the %s backend', (backend: Backend) => {
  let site: Site;

  beforeEach(() => {
    site = createSite();
  });

  afterEach(() => site.remove());

  it('is the case with its number and name, else default; a request stored before routing reads as default', async () => {
    writeOldRequest(backend, site, {
      received_at: '2026-01-10T09:00:00Z',
      form: 'callback',
      fields: { name: 'Борис' },
      status: 'delivered',
      channels: { 'telegram #1': { delivered: true, reason: '' } },
    });
    const lite = await startLite(routedSettings([{ name: 'vacancies', when: { form: 'vacancy' }, channels: [2] }]), {}, {
      site,
      env: forceBackend(backend, site),
    });
    try {
      await postFormForJson(lite.url, { ...visitorForm, __form: 'vacancy' });
      await postFormForJson(lite.url, { ...visitorForm, __form: 'callback' });
    } finally {
      lite.stop();
    }

    const requests = readStored(backend, site).requests;
    expect(requests.map((request) => [request.form, request.route])).toEqual([
      ['callback', 'default'],
      ['vacancy', 'case #1 vacancies'],
      ['callback', 'default'],
    ]);
    expect(requests[1].channels).toEqual({ 'telegram #2': { delivered: true, reason: '' } });
  });
});
