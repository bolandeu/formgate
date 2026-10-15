// Lite intake over HTTP: service fields, multi-value fields, multipart, size limits, method and content type.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  type FakeChannel,
  type Lite,
  postForm,
  postFormForJson,
  projectSettings,
  send,
  startFakeChannel,
  startLite,
} from '../support/lite.ts';

const visitorForm = { name: 'Анна', phone: '+7 900 123-45-67', consent: '1' };

let telegram: FakeChannel;
let lite: Lite;

beforeAll(async () => {
  telegram = await startFakeChannel();
  lite = await startLite(projectSettings(telegram));
});

afterAll(async () => {
  lite.stop();
  await telegram.stop();
});

afterEach(() => {
  telegram.calls.length = 0;
});

function deliveredLines() {
  expect(telegram.calls).toHaveLength(1);
  return String(telegram.calls[0].body.text).split('\n');
}

describe('service fields', () => {
  it('no __ field reaches the channel and an unknown __ field is ignored', async () => {
    const answer = await postFormForJson(lite.url, {
      ...visitorForm,
      __form: 'callback',
      __subject: 'Обратный звонок',
      __replyto: 'contact_email',
      __redirect: 'https://site.ru/spasibo',
      __required: 'name',
      __x: 'unknown',
    });

    expect(answer.body).toEqual({ ok: true });
    expect(deliveredLines().slice(0, 3)).toEqual(['name: Анна', 'phone: +7 900 123-45-67', 'consent: 1']);
    expect(deliveredLines()).toHaveLength(4);
  });
});

describe('fields with several values', () => {
  it('interests[]=a and interests[]=b reach the channel as "interests: a, b"', async () => {
    const answer = await postFormForJson(lite.url, { ...visitorForm, interests: ['a', 'b'] });

    expect(answer.body).toEqual({ ok: true });
    expect(deliveredLines()).toContain('interests: a, b');
  });
});

describe('multipart form', () => {
  it('without files is delivered; a file field is dropped', async () => {
    const body = new FormData();
    for (const [name, value] of Object.entries(visitorForm)) body.append(name, value);
    body.append('resume', new Blob(['file data']), 'resume.txt');

    const answer = await send(lite.url, { body, headers: { Accept: 'application/json' } });

    expect(answer.body).toEqual({ ok: true });
    expect(deliveredLines().slice(0, 3)).toEqual(['name: Анна', 'phone: +7 900 123-45-67', 'consent: 1']);
    expect(deliveredLines()).toHaveLength(4);
  });
});

describe('size limits', () => {
  const tooLarge = { ok: false, code: 'payload_too_large', error: 'Заявка слишком большая.' };

  it('101 fields get 413 payload_too_large', async () => {
    const fields: Record<string, string> = { ...visitorForm };
    for (let index = 0; Object.keys(fields).length < 101; index++) fields[`extra${index}`] = 'x';

    const answer = await postFormForJson(lite.url, fields);

    expect(answer.status).toBe(413);
    expect(answer.body).toEqual(tooLarge);
    expect(telegram.calls).toHaveLength(0);
  });

  it('a value of 10001 characters gets 413 payload_too_large', async () => {
    const answer = await postFormForJson(lite.url, { ...visitorForm, message: 'я'.repeat(10001) });

    expect(answer.status).toBe(413);
    expect(answer.body).toEqual(tooLarge);
    expect(telegram.calls).toHaveLength(0);
  });

  it('a body over 100 KB gets 413 payload_too_large', async () => {
    const fields: Record<string, string> = { ...visitorForm };
    for (let index = 0; index < 11; index++) fields[`part${index}`] = 'x'.repeat(10000);

    const answer = await postFormForJson(lite.url, fields);

    expect(answer.status).toBe(413);
    expect(answer.body).toEqual(tooLarge);
    expect(telegram.calls).toHaveLength(0);
  });

  it('a plain form over the limits gets 303 to the error page with the code', async () => {
    const answer = await postForm(lite.url, { ...visitorForm, message: 'x'.repeat(10001) });

    expect(answer.status).toBe(303);
    expect(answer.location).toBe('https://site.ru/error/?formgate_error=payload_too_large');
    expect(telegram.calls).toHaveLength(0);
  });
});

describe('method and content type', () => {
  it('GET without the self-check key gets 405 method_not_allowed', async () => {
    const answer = await send(lite.url, { method: 'GET' });

    expect(answer.status).toBe(405);
    expect(answer.body).toEqual({
      ok: false,
      code: 'method_not_allowed',
      error: 'Заявка принимается только методом POST.',
    });
    expect(telegram.calls).toHaveLength(0);
  });

  it('Content-Type text/plain gets 415 unsupported_media_type', async () => {
    const answer = await send(lite.url, { body: 'name=Анна', headers: { 'Content-Type': 'text/plain' } });

    expect(answer.status).toBe(415);
    expect(answer.body).toEqual({
      ok: false,
      code: 'unsupported_media_type',
      error: 'Неподдерживаемый формат заявки.',
    });
    expect(telegram.calls).toHaveLength(0);
  });
});
