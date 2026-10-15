// Broken special cases in the Lite settings over HTTP: Lite handles them as any broken settings file. The visitor gets
// server_error, the request is stored as failed, and error_log names the case and its wrong field.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  type FakeChannel,
  type Lite,
  postFormForJson,
  projectSettings,
  startFakeChannel,
  startLite,
  telegramChannel,
} from '../../support/lite.ts';
import { readStored } from '../../support/storage.ts';

const visitorForm = { __form: 'vacancy', name: 'Анна', phone: '+7 900 123-45-67', consent: '1' };

let telegram: FakeChannel;
let lite: Lite | undefined;

beforeAll(async () => {
  telegram = await startFakeChannel();
});

afterAll(() => telegram.stop());

afterEach(() => {
  lite?.stop();
  telegram.calls.length = 0;
});

describe('a broken special case', () => {
  it.each([
    ['points at channel 5 of 2', { name: 'vacancies', when: { form: 'vacancy' }, channels: [5] }, 'case #1 vacancies: channels (no channel 5)'],
    ['points at a channel name that no channel has', { when: { form: 'vacancy' }, channels: ['hr'] }, 'case #1: channels (no channel hr)'],
    ['has no when', { name: 'vacancies', channels: [2] }, 'case #1 vacancies: when'],
    ['has a field without equals', { name: 'vacancies', when: { field: 'city' }, channels: [2] }, 'case #1 vacancies: when'],
    ['has no channels', { name: 'vacancies', when: { form: 'vacancy' }, channels: [] }, 'case #1 vacancies: channels'],
  ])('that %s: server_error, the request stored as failed, error_log names the case', async (_name, specialCase, reason) => {
    const settings = projectSettings(telegram);
    lite = await startLite({ ...settings, channels: [telegramChannel(telegram), telegramChannel(telegram)], cases: [specialCase] });

    const answer = await postFormForJson(lite.url, visitorForm);

    expect(answer.status).toBe(500);
    expect(answer.body).toMatchObject({ ok: false, code: 'server_error' });
    expect(lite.errorLog()).toContain(`has no valid ${reason}`);
    expect(telegram.calls).toHaveLength(0);
    const stored = readStored('sqlite', lite.site).requests;
    expect(stored).toHaveLength(1);
    expect(stored[0].status).toBe('failed');
  });
});
