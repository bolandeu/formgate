// Lite frame over HTTP: delivery to Telegram, the answer contract (303 for a plain form, JSON for fetch),
// the PHP streams fallback without curl, a failed channel, broken settings, and a stop of php -S that leaves no
// worker process.
import { execFileSync } from 'node:child_process';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  type FakeChannel,
  type Lite,
  postForm,
  postFormForJson,
  postJson,
  projectSettings,
  startFakeChannel,
  startLite,
} from '../support/lite.ts';

const visitorForm = { name: 'Анна', phone: '+7 900 123-45-67', consent: '1' };
const consentLine = /^Согласие на обработку ПД: дано \d{2}\.\d{2}\.\d{4} \d{2}:\d{2}$/;

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
  telegram.answerWith(200, { ok: true, result: {} });
});

describe('a valid plain form', () => {
  it('goes to Telegram with every field and the consent line; the visitor gets 303 to the thank-you page', async () => {
    const answer = await postForm(lite.url, visitorForm);

    expect(answer.status).toBe(303);
    expect(answer.location).toBe('https://site.ru/thanks/');
    expect(telegram.calls).toHaveLength(1);
    expect(telegram.calls[0].path).toBe('/botTEST-TOKEN/sendMessage');
    expect(telegram.calls[0].body.chat_id).toBe('-100');
    const lines = String(telegram.calls[0].body.text).split('\n');
    expect(lines.slice(0, 3)).toEqual(['name: Анна', 'phone: +7 900 123-45-67', 'consent: 1']);
    expect(lines[3]).toMatch(consentLine);
    expect(lines).toHaveLength(4);
  });

  it('with __redirect on a project domain gets 303 to that URL', async () => {
    const answer = await postForm(lite.url, { ...visitorForm, __redirect: 'https://site.ru/spasibo' });

    expect(answer.status).toBe(303);
    expect(answer.location).toBe('https://site.ru/spasibo');
  });

  it('with __redirect to another domain gets 303 to the thank-you page', async () => {
    const answer = await postForm(lite.url, { ...visitorForm, __redirect: 'https://evil.ru/spasibo' });

    expect(answer.status).toBe(303);
    expect(answer.location).toBe('https://site.ru/thanks/');
  });
});

describe('a valid request that asks for JSON', () => {
  it('as a JSON body gets 200 {"ok":true}', async () => {
    const answer = await postJson(lite.url, visitorForm);

    expect(answer.status).toBe(200);
    expect(answer.body).toEqual({ ok: true });
    expect(telegram.calls).toHaveLength(1);
  });

  it('as a plain form with Accept: application/json gets 200 {"ok":true}', async () => {
    const answer = await postFormForJson(lite.url, visitorForm);

    expect(answer.status).toBe(200);
    expect(answer.body).toEqual({ ok: true });
    expect(telegram.calls).toHaveLength(1);
  });
});

describe('the only channel fails', () => {
  it('the visitor gets 500 delivery_failed and the details go only to error_log', async () => {
    telegram.answerWith(500, { ok: false, description: 'Internal Server Error' });

    const answer = await postJson(lite.url, visitorForm);

    expect(answer.status).toBe(500);
    expect(answer.body).toEqual({
      ok: false,
      code: 'delivery_failed',
      error: 'Не удалось отправить заявку. Позвоните нам или попробуйте позже.',
    });
    expect(lite.errorLog()).toContain('Internal Server Error');
  });
});

describe('Telegram without curl', () => {
  it('sends through PHP streams and the fake server gets one message', async () => {
    const withoutCurl = await startLite(projectSettings(telegram), {
      disable_functions: 'curl_init,curl_exec,curl_setopt_array',
    });
    try {
      const answer = await postJson(withoutCurl.url, visitorForm);

      expect(answer.status).toBe(200);
      expect(answer.body).toEqual({ ok: true });
      expect(telegram.calls).toHaveLength(1);
      expect(String(telegram.calls[0].body.text)).toContain('phone: +7 900 123-45-67');
    } finally {
      withoutCurl.stop();
    }
  });
});

describe('broken settings', () => {
  const serverError = { ok: false, code: 'server_error', error: 'Не удалось отправить заявку. Попробуйте позже.' };

  it('a missing settings file gives 500 server_error and the reason in error_log', async () => {
    const broken = await startLite(null);
    try {
      const answer = await postForm(broken.url, visitorForm);

      expect(answer.status).toBe(500);
      expect(answer.body).toEqual(serverError);
      expect(broken.errorLog()).toContain('formgate.php');
    } finally {
      broken.stop();
    }
  });

  it('a settings file that returns no array gives 500 server_error and the reason in error_log', async () => {
    const broken = await startLite('<?php return 42;');
    try {
      const answer = await postForm(broken.url, visitorForm);

      expect(answer.status).toBe(500);
      expect(answer.body).toEqual(serverError);
      expect(broken.errorLog()).toContain('settings');
    } finally {
      broken.stop();
    }
  });
});

describe('a stop of the harness', () => {
  // The php processes that listen on the address of the server: the master and its PHP_CLI_SERVER_WORKERS children.
  function serverProcesses(url: string) {
    const address = new URL(url).host;
    const lines = execFileSync('ps', ['-A', '-o', 'args='], { encoding: 'utf8' }).split('\n');
    return lines.filter((line) => line.includes(`-S ${address}`));
  }

  it('leaves no php process of a server with 4 workers', async () => {
    const withWorkers = await startLite(projectSettings(telegram), {}, { env: { PHP_CLI_SERVER_WORKERS: '4' } });
    await postJson(withWorkers.url, visitorForm);
    expect(serverProcesses(withWorkers.url)).toHaveLength(5);

    withWorkers.stop();

    await expect.poll(() => serverProcesses(withWorkers.url), { timeout: 3_000 }).toEqual([]);
  });
});
