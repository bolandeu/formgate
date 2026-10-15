// Analytics fields (meta_*) over HTTP: the source block in Telegram and email, and the separate meta_ limits.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  type FakeChannel,
  type Lite,
  numberedFields,
  postForm,
  projectSettings,
  startFakeChannel,
  startLite,
} from '../support/lite.ts';
import { type SmtpSink, startSmtpSink } from '../support/smtp-sink.ts';

const consentLine = /^Согласие на обработку ПД: дано \d{2}\.\d{2}\.\d{4} \d{2}:\d{2}$/;
const visitorForm = { name: 'Анна', phone: '+7 900 123-45-67', consent: '1' };
const analytics = {
  meta_utm_source: 'yandex',
  meta_utm_medium: 'cpc',
  meta_utm_campaign: 'spring',
  meta_page: 'https://site.ru/price',
  meta_referrer: 'https://ya.ru/',
  meta_yclid: '123',
};
const sourceBlock = ['', 'Источник: yandex / cpc / spring', 'Страница: https://site.ru/price', 'Реферер: https://ya.ru/'];

let telegram: FakeChannel;
let sink: SmtpSink;
let lite: Lite;
let emailLite: Lite;

const telegramLines = () => String(telegram.calls[0].body.text).split('\n');

beforeAll(async () => {
  telegram = await startFakeChannel();
  sink = await startSmtpSink();
  lite = await startLite(projectSettings(telegram));
  emailLite = await startLite({
    ...projectSettings(telegram),
    channels: [
      {
        type: 'email',
        options: { to: 'sales@site.ru', methods: [{ type: 'smtp', host: '127.0.0.1', port: sink.port, encryption: 'none', from: 'forms@site.ru' }] },
      },
    ],
  });
});

afterEach(() => {
  telegram.calls.length = 0;
  sink.messages.length = 0;
});

afterAll(async () => {
  lite.stop();
  emailLite.stop();
  await Promise.all([telegram.stop(), sink.stop()]);
});

describe('the source block', () => {
  it('Telegram: visitor lines, consent line, an empty line, then the block; no other meta_ field', async () => {
    await postForm(lite.url, { ...visitorForm, ...analytics });

    const lines = telegramLines();
    expect(lines.slice(0, 3)).toEqual(['name: Анна', 'phone: +7 900 123-45-67', 'consent: 1']);
    expect(lines[3]).toMatch(consentLine);
    expect(lines.slice(4)).toEqual(sourceBlock);
    expect(lines.join('\n')).not.toContain('meta_yclid');
  });

  it('email: the body has the same order and block', async () => {
    await postForm(emailLite.url, { ...visitorForm, ...analytics });

    const lines = sink.messages[0].body.split('\n');
    expect(lines.slice(0, 3)).toEqual(['name: Анна', 'phone: +7 900 123-45-67', 'consent: 1']);
    expect(lines[3]).toMatch(consentLine);
    expect(lines.slice(4)).toEqual(sourceBlock);
  });

  it('leaves out a block line whose fields are all missing', async () => {
    await postForm(lite.url, { ...visitorForm, meta_page: 'https://site.ru/price' });

    expect(telegramLines().slice(4)).toEqual(['', 'Страница: https://site.ru/price']);
  });

  it('without meta_ fields the text has the visitor lines and the consent line only', async () => {
    await postForm(lite.url, visitorForm);

    const lines = telegramLines();
    expect(lines.slice(0, 3)).toEqual(['name: Анна', 'phone: +7 900 123-45-67', 'consent: 1']);
    expect(lines[3]).toMatch(consentLine);
    expect(lines).toHaveLength(4);
  });
});

describe('the meta_ limits', () => {
  it('accepts 100 visitor fields and 50 meta_ fields', async () => {
    const answer = await postForm(lite.url, { ...visitorForm, ...numberedFields('f', 97), ...numberedFields('meta_f', 50) });

    expect(answer.status).toBe(303);
    expect(telegram.calls).toHaveLength(1);
  });

  it('refuses 51 meta_ fields with 413 payload_too_large', async () => {
    const answer = await postForm(lite.url, { ...visitorForm, ...numberedFields('meta_f', 51) }, { Accept: 'application/json' });

    expect(answer.status).toBe(413);
    expect(answer.body).toMatchObject({ code: 'payload_too_large' });
  });

  it('refuses a meta_ value of 2001 characters but accepts 2000', async () => {
    const long = await postForm(lite.url, { ...visitorForm, meta_page: 'x'.repeat(2001) }, { Accept: 'application/json' });
    const edge = await postForm(lite.url, { ...visitorForm, meta_page: 'x'.repeat(2000) }, { Accept: 'application/json' });

    expect(long.status).toBe(413);
    expect(long.body).toMatchObject({ code: 'payload_too_large' });
    expect(edge.status).toBe(200);
  });

  it('still accepts a visitor value of 2001 characters', async () => {
    const answer = await postForm(lite.url, { ...visitorForm, comment: 'x'.repeat(2001) }, { Accept: 'application/json' });

    expect(answer.status).toBe(200);
  });
});
