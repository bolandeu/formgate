// Test delivery of Lite: with FORMGATE_TEST_DELIVERY_FILE set, a request that would be delivered is appended to that
// file as one JSON line and no channel is called; spam and duplicates are not written; a file that cannot be written
// is a failed delivery.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  type FakeChannel,
  type Lite,
  postFormForJson,
  projectSettings,
  startFakeChannel,
  startLite,
} from '../support/lite.ts';

const visitorForm = { __form: 'callback', name: 'Анна', phone: '+7 900 123-45-67', consent: '1' };

let deadChannel: FakeChannel;
let outputDir: string;
let running: Lite | undefined;

beforeAll(async () => {
  // A port that had a server and has none now: a connection to it is refused.
  deadChannel = await startFakeChannel();
  await deadChannel.stop();
});

beforeEach(() => {
  outputDir = mkdtempSync(join(tmpdir(), 'formgate-delivery-'));
});

afterEach(() => {
  running?.stop();
  running = undefined;
  rmSync(outputDir, { recursive: true, force: true });
});

async function startWithDeliveryFile(file: string, project: object = {}) {
  const settings = projectSettings(deadChannel);
  running = await startLite(
    { ...settings, project: { ...settings.project, ...project } },
    {},
    { env: { FORMGATE_TEST_DELIVERY_FILE: file } },
  );
  return running;
}

const linesOf = (file: string) =>
  readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line));

describe('with FORMGATE_TEST_DELIVERY_FILE set', () => {
  it('writes one line for a valid request, calls no channel and answers success', async () => {
    const file = join(outputDir, 'out.jsonl');
    const lite = await startWithDeliveryFile(file);

    const answer = await postFormForJson(lite.url, visitorForm);

    expect(answer.status).toBe(200);
    expect(answer.body).toEqual({ ok: true });
    const lines = linesOf(file);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      form: 'callback',
      fields: { name: 'Анна', phone: '+7 900 123-45-67' },
      channels: [{ number: 1, type: 'telegram', name: null }],
    });
    expect(lines[0].time).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d$/);
    expect(lines[0].consent).toMatch(/^Согласие на обработку ПД: дано \d\d\.\d\d\.\d{4} \d\d:\d\d$/);
    expect(lines[0].service).toEqual({ subject: '', reply_to: 'email', redirect: '' });
  });

  it('writes the request id of the request in its line', async () => {
    const file = join(outputDir, 'out.jsonl');
    const lite = await startWithDeliveryFile(file);

    await postFormForJson(lite.url, visitorForm);
    await postFormForJson(lite.url, { ...visitorForm, name: 'Борис' });

    const [first, second] = linesOf(file);
    expect(first.request_id).toMatch(/^[A-Za-z0-9_-]{16,}$/);
    expect(second.request_id).toMatch(/^[A-Za-z0-9_-]{16,}$/);
    expect(second.request_id).not.toBe(first.request_id);
  });

  it('with meta_ fields keeps the consent line as consent and all meta_ fields in fields', async () => {
    const file = join(outputDir, 'out.jsonl');
    const lite = await startWithDeliveryFile(file);
    const analytics = { meta_utm_source: 'yandex', meta_page: 'https://site.ru/price', meta_referrer: 'https://ya.ru/', meta_yclid: '123' };

    await postFormForJson(lite.url, { ...visitorForm, ...analytics });

    const [line] = linesOf(file);
    expect(line.consent).toMatch(/^Согласие на обработку ПД: дано \d\d\.\d\d\.\d{4} \d\d:\d\d$/);
    expect(line.fields).toMatchObject(analytics);
  });

  it('writes no line for a honeypot request or for a duplicate of a delivered request', async () => {
    const file = join(outputDir, 'out.jsonl');
    const lite = await startWithDeliveryFile(file, { duplicate_window_seconds: 600 });

    const delivered = await postFormForJson(lite.url, visitorForm);
    const duplicate = await postFormForJson(lite.url, visitorForm);
    const honeypot = await postFormForJson(lite.url, { ...visitorForm, name: 'Bot', website: 'http://spam.example' });

    expect([delivered.status, duplicate.status, honeypot.status]).toEqual([200, 200, 200]);
    expect(linesOf(file)).toHaveLength(1);
  });

  it('answers 500 delivery_failed and logs the reason when the file cannot be written', async () => {
    const lite = await startWithDeliveryFile(join(outputDir, 'missing-folder', 'out.jsonl'));

    const answer = await postFormForJson(lite.url, visitorForm);

    expect(answer.status).toBe(500);
    expect(answer.body).toMatchObject({ ok: false, code: 'delivery_failed' });
    expect(lite.errorLog()).toContain('formgate: test delivery');
  });
});
