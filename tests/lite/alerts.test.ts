// Operator alerts over HTTP: a failed channel sends one Telegram message from the alert bot, naming the project
// and the channel; the visitor answer does not depend on the alert.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  type FakeChannel,
  type Lite,
  postFormForJson,
  postJson,
  projectSettings,
  startFakeChannel,
  startLite,
} from '../support/lite.ts';

const visitorForm = { name: 'Анна', phone: '+7 900 123-45-67', consent: '1' };

let telegram: FakeChannel;
let bitrix: FakeChannel;
let alertBot: FakeChannel;
let lite: Lite;

beforeAll(async () => {
  [telegram, bitrix, alertBot] = await Promise.all([startFakeChannel(), startFakeChannel(), startFakeChannel()]);
  const settings = projectSettings(telegram);
  lite = await startLite({
    ...settings,
    project: { ...settings.project, name: 'Лендинг Ромашка' },
    channels: [
      ...settings.channels,
      { type: 'bitrix24', options: { webhook_url: `${bitrix.url}/rest/1/KEY/`, map: {} } },
    ],
    alert: { bot_token: 'ALERT-TOKEN', chat_id: '-200', api_url: alertBot.url },
  });
});

afterAll(async () => {
  lite.stop();
  await Promise.all([telegram.stop(), bitrix.stop(), alertBot.stop()]);
});

afterEach(() => {
  for (const fake of [telegram, bitrix, alertBot]) {
    fake.calls.length = 0;
    fake.answerWith(200, { ok: true, result: 1 });
  }
});

describe('one channel fails', () => {
  it('gives the visitor success and sends one alert with the project and the channel', async () => {
    bitrix.answerWith(500, { error: 'INTERNAL' });

    const answer = await postFormForJson(lite.url, visitorForm);

    expect(answer.status).toBe(200);
    expect(answer.body).toEqual({ ok: true });
    expect(alertBot.calls).toHaveLength(1);
    expect(alertBot.calls[0].path).toBe('/botALERT-TOKEN/sendMessage');
    expect(alertBot.calls[0].body.chat_id).toBe('-200');
    const lines = String(alertBot.calls[0].body.text).split('\n');
    expect(lines[0]).toBe(
      'Formgate, project Лендинг Ромашка: channel bitrix24 #2 failed, the request is delivered by telegram #1',
    );
    expect(lines[1]).toMatch(/^channel bitrix24 #2 failed: Bitrix24: HTTP 500/);
    expect(lines).toHaveLength(2);
  });
});

describe('all channels fail', () => {
  it('gives the visitor delivery_failed, sends one alert and tries each channel once', async () => {
    telegram.answerWith(500, { ok: false });
    bitrix.answerWith(500, { error: 'INTERNAL' });

    const answer = await postFormForJson(lite.url, visitorForm);

    expect(answer.status).toBe(500);
    expect(answer.body?.code).toBe('delivery_failed');
    expect(alertBot.calls).toHaveLength(1);
    expect(String(alertBot.calls[0].body.text).split('\n')[0]).toBe(
      'Formgate, project Лендинг Ромашка: no channel delivered the request',
    );
    expect(telegram.calls).toHaveLength(1);
    expect(bitrix.calls).toHaveLength(1);
  });
});

describe('the alert bot fails too', () => {
  it('leaves the visitor answer as it is and writes the failure to error_log', async () => {
    bitrix.answerWith(500, { error: 'INTERNAL' });
    alertBot.answerWith(500, { ok: false });

    const answer = await postFormForJson(lite.url, visitorForm);

    expect(answer.status).toBe(200);
    expect(answer.body).toEqual({ ok: true });
    expect(lite.errorLog()).toContain('formgate: alert failed: HTTP 500');
  });
});

describe('broken alert settings', () => {
  const serverError = { ok: false, code: 'server_error', error: 'Не удалось отправить заявку. Попробуйте позже.' };

  async function answerWithAlert(alert: object, name?: string) {
    const settings = projectSettings(telegram);
    const broken = await startLite({ ...settings, project: { ...settings.project, name }, alert });
    try {
      return { answer: await postJson(broken.url, visitorForm), errorLog: broken.errorLog() };
    } finally {
      broken.stop();
    }
  }

  it('an alert bot without chat_id gives 500 server_error and names the alert in error_log', async () => {
    const { answer, errorLog } = await answerWithAlert({ bot_token: 'ALERT-TOKEN' }, 'Лендинг Ромашка');

    expect(answer.status).toBe(500);
    expect(answer.body).toEqual(serverError);
    expect(errorLog).toContain('has no valid alert');
    expect(telegram.calls).toHaveLength(0);
  });

  it('an alert bot without project.name gives 500 server_error and names project.name in error_log', async () => {
    const { answer, errorLog } = await answerWithAlert({ bot_token: 'ALERT-TOKEN', chat_id: '-200' });

    expect(answer.status).toBe(500);
    expect(answer.body).toEqual(serverError);
    expect(errorLog).toContain('has no valid project.name');
  });
});
