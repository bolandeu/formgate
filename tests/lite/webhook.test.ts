// The webhook channel over HTTP: one signed JSON POST per request on a fake receiver. The signature is checked with
// the Webhook class of the npm package standardwebhooks. A non-2xx answer, a redirect (not followed) and a timeout
// fail the channel.
import { Webhook } from 'standardwebhooks';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  type Lite,
  type WebhookReceiver,
  postForm,
  postJson,
  projectSettings,
  startFakeChannel,
  startLite,
  startWebhookReceiver,
} from '../support/lite.ts';

const secret = `whsec_${Buffer.from('0123456789abcdef0123456789abcdef').toString('base64')}`;
const visitorForm = { name: 'Анна', phone: '+7 900 123-45-67', consent: '1', meta_utm_source: 'yandex' };

let receiver: WebhookReceiver;
let other: WebhookReceiver;
let lite: Lite;
const fakeTelegram = await startFakeChannel();

const webhookSettings = (options: Record<string, unknown>) => ({
  ...projectSettings(fakeTelegram),
  channels: [{ type: 'webhook', options: { url: `${receiver.url}/hook`, secret, allow_http: true, ...options } }],
});

// Starts Lite with a webhook channel with the given options, runs the test with it and stops it.
async function withWebhook(options: Record<string, unknown>, run: (lite: Lite) => Promise<void>) {
  const started = await startLite(webhookSettings(options));
  try {
    await run(started);
  } finally {
    started.stop();
  }
}

// The headers of a received request as the plain object that the Webhook class takes.
const headersOf = (index = 0) => receiver.received[index].headers as Record<string, string>;

beforeAll(async () => {
  [receiver, other] = await Promise.all([startWebhookReceiver(), startWebhookReceiver()]);
  lite = await startLite(webhookSettings({}));
});

afterAll(async () => {
  lite.stop();
  await Promise.all([receiver.stop(), other.stop(), fakeTelegram.stop()]);
});

afterEach(() => {
  receiver.received.length = 0;
  other.received.length = 0;
  receiver.answerWith(204);
});

describe('a valid request', () => {
  it('posts one JSON body of version 1 with the request id as webhook-id', async () => {
    const answer = await postJson(lite.url, { ...visitorForm, __form: 'lead', __subject: 'Заявка', __replyto: 'mail' }, {
      'User-Agent': 'TestAgent/1',
    });

    expect(answer.status).toBe(200);
    expect(receiver.received).toHaveLength(1);
    const call = receiver.received[0];
    expect(call.method).toBe('POST');
    expect(call.path).toBe('/hook');
    expect(call.headers['content-type']).toBe('application/json');
    const body = JSON.parse(call.rawBody);
    expect(body.version).toBe(1);
    expect(body.test).toBe(false);
    expect(body.request_id).not.toBe('');
    expect(body.request_id).toBe(call.headers['webhook-id']);
    expect(body.received_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
    expect(body.form).toBe('lead');
    expect(body.fields).toEqual({ name: 'Анна', phone: '+7 900 123-45-67', consent: '1' });
    expect(body.meta).toEqual({ meta_utm_source: 'yandex' });
    expect(body.service).toEqual({ subject: 'Заявка', reply_to: 'mail' });
    expect(body.consent).toMatch(/^Согласие на обработку ПД: дано \d{2}\.\d{2}\.\d{4} \d{2}:\d{2}$/);
    expect(body.ip).toBe('127.0.0.1');
    expect(body.user_agent).toBe('TestAgent/1');
    expect(body.origin_host).toBe('site.ru');
  });

  it('sends empty fields and meta as JSON objects', async () => {
    await postForm(lite.url, { consent: '1' });

    const body = JSON.parse(receiver.received[0].rawBody);
    expect(body.fields).toEqual({ consent: '1' });
    expect(body.meta).toEqual({});
  });

  it('signs the exact body: the Webhook class verifies it, and fails for one changed byte', async () => {
    await postForm(lite.url, visitorForm);

    const call = receiver.received[0];
    const webhook = new Webhook(secret);
    expect(webhook.verify(call.rawBody, headersOf())).toMatchObject({ version: 1 });
    expect(() => webhook.verify(call.rawBody.replace('Анна', 'Анва'), headersOf())).toThrow();
  });

  it('uses a secret without whsec_ as raw bytes', async () => {
    await withWebhook({ secret: 'plain-secret' }, async (plain) => {
      await postForm(plain.url, visitorForm);
    });

    const call = receiver.received[0];
    // The library takes only a base64 key after whsec_: the same bytes as the raw secret.
    const raw = new Webhook(`whsec_${Buffer.from('plain-secret').toString('base64')}`);
    expect(() => raw.verify(call.rawBody, headersOf())).not.toThrow();
  });

  it('sends the headers option with the request', async () => {
    await withWebhook({ headers: { Authorization: 'Bearer abc' } }, async (withHeaders) => {
      await postForm(withHeaders.url, visitorForm);
    });

    expect(receiver.received[0].headers.authorization).toBe('Bearer abc');
  });

  it('gives the visitor success when the receiver answers 204', async () => {
    const answer = await postForm(lite.url, visitorForm);

    expect(answer.status).toBe(303);
    expect(answer.location).toBe('https://site.ru/thanks/');
  });
});

describe('a failed delivery', () => {
  const failed = async (options: Record<string, unknown> = {}) => {
    let result: { location: string | null; errorLog: string } | undefined;
    await withWebhook(options, async (failing) => {
      const answer = await postForm(failing.url, visitorForm);
      result = { location: answer.location, errorLog: failing.errorLog() };
    });
    return result!;
  };

  it('fails on 500 and names the status, not the secret or a header value', async () => {
    receiver.answerWith(500);

    const { location, errorLog } = await failed({ headers: { Authorization: 'Bearer abc' } });

    expect(location).toBe('https://site.ru/error/?formgate_error=delivery_failed');
    expect(errorLog).toContain('channel webhook #1 failed: Webhook: HTTP 500');
    expect(errorLog).not.toContain(secret);
    expect(errorLog).not.toContain('Bearer abc');
  });

  it('does not follow a 302 and fails with its status', async () => {
    receiver.answerWith(302, { location: `${other.url}/elsewhere` });

    const { location, errorLog } = await failed();

    expect(location).toBe('https://site.ru/error/?formgate_error=delivery_failed');
    expect(errorLog).toContain('Webhook: HTTP 302');
    expect(other.received).toHaveLength(0);
  });

  it('fails when the receiver is silent past timeout_seconds', async () => {
    receiver.answerWith(204, { delayMs: 3000 });

    const { location, errorLog } = await failed({ timeout_seconds: 1 });

    expect(location).toBe('https://site.ru/error/?formgate_error=delivery_failed');
    expect(errorLog).toMatch(/channel webhook #1 failed: Webhook: .*timed out/i);
    expect(errorLog).not.toContain(secret);
  });
});

describe('the settings', () => {
  it('refuse an http url without allow_http and name the webhook channel and the url', async () => {
    const url = `${receiver.url}/hook`;
    const refused = await startLite(webhookSettings({ allow_http: undefined }));
    try {
      const answer = await postJson(refused.url, visitorForm);

      expect(answer.status).toBe(500);
      expect(refused.errorLog()).toContain(`settings: the webhook channel url ${url} is not https`);
      expect(receiver.received).toHaveLength(0);
    } finally {
      refused.stop();
    }
  });

  it('refuse a whsec_ secret that is not base64', async () => {
    await withWebhook({ secret: 'whsec_***' }, async (broken) => {
      await postForm(broken.url, visitorForm);

      expect(broken.errorLog()).toContain('the webhook channel secret starts with whsec_ but is not base64');
    });
  });

  it('refuse a webhook channel without a secret', async () => {
    await withWebhook({ secret: '' }, async (broken) => {
      await postForm(broken.url, visitorForm);

      expect(broken.errorLog()).toContain('settings: the webhook channel has no secret');
    });
  });
});
