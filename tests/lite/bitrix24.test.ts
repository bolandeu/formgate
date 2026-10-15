// The Bitrix24 channel over HTTP: one crm.lead.add per request on the fake webhook server; mapped fields go
// to lead fields, the rest and the consent line go into COMMENTS.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { type FakeChannel, type Lite, postForm, projectSettings, startFakeChannel, startLite } from '../support/lite.ts';

const consentLine = /^Согласие на обработку ПД: дано \d{2}\.\d{2}\.\d{4} \d{2}:\d{2}$/;

let bitrix: FakeChannel;
let lite: Lite;

beforeAll(async () => {
  bitrix = await startFakeChannel();
  const settings = projectSettings(bitrix);
  lite = await startLite({
    ...settings,
    channels: [
      {
        type: 'bitrix24',
        options: { webhook_url: `${bitrix.url}/rest/1/WEBHOOK-KEY/`, map: { name: 'NAME', phone: 'PHONE' } },
      },
    ],
  });
});

afterAll(async () => {
  lite.stop();
  await bitrix.stop();
});

afterEach(() => {
  bitrix.calls.length = 0;
  bitrix.answerWith(200, { result: 1 });
});

describe('a valid request', () => {
  it('creates one lead: mapped fields in their lead fields, the rest and the consent line in COMMENTS', async () => {
    const answer = await postForm(lite.url, {
      name: 'Анна',
      phone: '+7 900 123-45-67',
      city: 'Казань',
      consent: '1',
      __subject: 'Заявка с лендинга',
    });

    expect(answer.status).toBe(303);
    expect(bitrix.calls).toHaveLength(1);
    expect(bitrix.calls[0].path).toBe('/rest/1/WEBHOOK-KEY/crm.lead.add.json');
    const fields = bitrix.calls[0].body.fields as Record<string, unknown>;
    expect(fields.TITLE).toBe('Заявка с лендинга');
    expect(fields.NAME).toBe('Анна');
    expect(fields.PHONE).toEqual([{ VALUE: '+7 900 123-45-67', VALUE_TYPE: 'WORK' }]);
    const comments = String(fields.COMMENTS).split('\n');
    expect(comments.slice(0, 2)).toEqual(['city: Казань', 'consent: 1']);
    expect(comments[2]).toMatch(consentLine);
    expect(comments).toHaveLength(3);
  });

  it('fails the channel when the webhook answers with an error', async () => {
    bitrix.answerWith(500, { error: 'INTERNAL' });

    const answer = await postForm(lite.url, { name: 'Анна', phone: '+7 900 123-45-67', consent: '1' });

    expect(answer.status).toBe(303);
    expect(answer.location).toBe('https://site.ru/error/?formgate_error=delivery_failed');
    expect(lite.errorLog()).toContain('channel bitrix24 #1 failed: Bitrix24: HTTP 500');
  });
});
