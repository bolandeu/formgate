// Lite checks over HTTP: consent, required fields, phone and email syntax, origin and CORS.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  type FakeChannel,
  type Lite,
  postForm,
  postJson,
  projectSettings,
  send,
  startFakeChannel,
  startLite,
} from '../support/lite.ts';

const visitorForm = { name: 'Анна', phone: '+7 900 123-45-67', email: 'anna@site.ru', consent: '1' };
const russianText = /[а-яё]/i;

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

describe('consent', () => {
  const consentRequired = {
    ok: false,
    code: 'consent_required',
    error: 'Нужно согласие на обработку персональных данных.',
  };

  it('missing consent gets 422 consent_required and nothing is delivered', async () => {
    const { consent: _, ...withoutConsent } = visitorForm;

    const answer = await postJson(lite.url, withoutConsent);

    expect(answer.status).toBe(422);
    expect(answer.body).toEqual(consentRequired);
    expect(telegram.calls).toHaveLength(0);
  });

  it('consent=on gets 422 consent_required and nothing is delivered', async () => {
    const answer = await postJson(lite.url, { ...visitorForm, consent: 'on' });

    expect(answer.status).toBe(422);
    expect(answer.body).toEqual(consentRequired);
    expect(telegram.calls).toHaveLength(0);
  });
});

describe('field checks', () => {
  function expectFieldError(answer: Awaited<ReturnType<typeof postJson>>, field: string) {
    expect(answer.status).toBe(422);
    expect(answer.body).toMatchObject({ ok: false, code: 'validation_failed', error: 'Проверьте поля формы.' });
    const errors = answer.body?.errors as Record<string, string>;
    expect(Object.keys(errors)).toEqual([field]);
    expect(errors[field]).toMatch(russianText);
    expect(telegram.calls).toHaveLength(0);
  }

  it('__required=phone,email with an empty phone gets 422 validation_failed for phone', async () => {
    const answer = await postJson(lite.url, { ...visitorForm, phone: '  ', __required: ['phone', 'email'] });

    expectFieldError(answer, 'phone');
  });

  it('__required as a comma list works the same way', async () => {
    const answer = await postJson(lite.url, { ...visitorForm, phone: '', __required: 'phone,email' });

    expectFieldError(answer, 'phone');
  });

  it('a phone with 9 digits gets validation_failed for phone', async () => {
    expectFieldError(await postJson(lite.url, { ...visitorForm, phone: '900 123-45-6' }), 'phone');
  });

  it('a phone with 16 digits gets validation_failed for phone', async () => {
    expectFieldError(await postJson(lite.url, { ...visitorForm, phone: '+7 900 123-45-67 89012' }), 'phone');
  });

  it('an email "a@b" without a dot in the domain gets validation_failed for email', async () => {
    expectFieldError(await postJson(lite.url, { ...visitorForm, email: 'a@b' }), 'email');
  });

  it('a plain form that fails the checks gets 303 to the error page with ?formgate_error=validation_failed', async () => {
    const answer = await postForm(lite.url, { ...visitorForm, phone: '', __required: 'phone,email' });

    expect(answer.status).toBe(303);
    expect(answer.location).toBe('https://site.ru/error/?formgate_error=validation_failed');
    expect(telegram.calls).toHaveLength(0);
  });
});

describe('origin and CORS', () => {
  const originNotAllowed = {
    ok: false,
    code: 'origin_not_allowed',
    error: 'Форма этого сайта не подключена к обработчику заявок.',
  };

  it('a post with Origin https://evil.ru gets 403 origin_not_allowed and no CORS headers', async () => {
    const answer = await postJson(lite.url, visitorForm, { Origin: 'https://evil.ru' });

    expect(answer.status).toBe(403);
    expect(answer.body).toEqual(originNotAllowed);
    expect(answer.headers.get('access-control-allow-origin')).toBeNull();
    expect(telegram.calls).toHaveLength(0);
  });

  it('a post without Origin and with Referer https://evil.ru/x gets 403 origin_not_allowed', async () => {
    const answer = await send(
      lite.url,
      { body: JSON.stringify(visitorForm), headers: { 'Content-Type': 'application/json', Referer: 'https://evil.ru/x' } },
      false,
    );

    expect(answer.status).toBe(403);
    expect(answer.body).toEqual(originNotAllowed);
    expect(telegram.calls).toHaveLength(0);
  });

  it('a post without Origin and with Referer on the project domain is delivered', async () => {
    const answer = await send(
      lite.url,
      { body: JSON.stringify(visitorForm), headers: { 'Content-Type': 'application/json', Referer: 'https://site.ru/x' } },
      false,
    );

    expect(answer.body).toEqual({ ok: true });
    expect(telegram.calls).toHaveLength(1);
  });

  it('OPTIONS from https://site.ru gets Access-Control-Allow-Origin and the allowed methods and headers', async () => {
    const answer = await send(lite.url, {
      method: 'OPTIONS',
      headers: { 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
    });

    expect(answer.status).toBe(204);
    expect(answer.headers.get('access-control-allow-origin')).toBe('https://site.ru');
    expect(answer.headers.get('access-control-allow-methods')).toBe('POST, OPTIONS');
    expect(answer.headers.get('access-control-allow-headers')).toBe('Content-Type, Accept');
  });

  it('OPTIONS from https://evil.ru gets no CORS headers', async () => {
    const answer = await send(lite.url, { method: 'OPTIONS', headers: { Origin: 'https://evil.ru' } });

    expect(answer.headers.get('access-control-allow-origin')).toBeNull();
    expect(answer.headers.get('access-control-allow-methods')).toBeNull();
  });

  it('a valid post from https://site.ru gets Access-Control-Allow-Origin https://site.ru', async () => {
    const answer = await postJson(lite.url, visitorForm);

    expect(answer.body).toEqual({ ok: true });
    expect(answer.headers.get('access-control-allow-origin')).toBe('https://site.ru');
  });
});
