// The webhook channel in the Pro worker: each repeat of one request sends the same webhook-id (the request_id) with a
// fresh valid signature, and the private-address guard fails a delivery to a host that resolves to a loopback
// address without a connection, unless FORMGATE_WEBHOOK_ALLOW_PRIVATE is on.
import { Webhook } from 'standardwebhooks';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { postJson, projectSettings, startFakeChannel, startWebhookReceiver, type WebhookReceiver } from '../../support/lite.ts';
import { at, createDeliveryFolders, projectKey } from '../../support/pro-delivery.ts';
import { type Pro, type ProFolders, readQueue, runWorkerOnce, startPro } from '../../support/pro.ts';

const secret = `whsec_${Buffer.from('0123456789abcdef0123456789abcdef').toString('base64')}`;
const visitorForm = { __form: 'callback', name: 'Анна', phone: '+7 900 123-45-67', consent: '1' };

let receiver: WebhookReceiver;
let folders: ProFolders;
let pro: Pro;
const fakeTelegram = await startFakeChannel();

beforeAll(async () => {
  receiver = await startWebhookReceiver();
});

afterAll(async () => {
  await Promise.all([receiver.stop(), fakeTelegram.stop()]);
});

afterEach(() => {
  pro.stop();
  folders.remove();
  receiver.received.length = 0;
  receiver.answerWith(204);
});

// Stores one posted request of a project whose only channel is a webhook channel on the url; `allowPrivate` sets
// FORMGATE_WEBHOOK_ALLOW_PRIVATE for the worker.
async function storeRequest(url: string, allowPrivate: boolean) {
  folders = createDeliveryFolders('1,2');
  if (allowPrivate) folders.env.FORMGATE_WEBHOOK_ALLOW_PRIVATE = '1';
  folders.writeProject(projectKey, {
    ...projectSettings(fakeTelegram),
    channels: [{ type: 'webhook', options: { url, secret, allow_http: true } }],
  });
  pro = await startPro(folders, { FORMGATE_TEST_NOW: at(0) });
  await postJson(pro.formUrl(projectKey), visitorForm);
}

describe('a repeat of a webhook delivery with FORMGATE_WEBHOOK_ALLOW_PRIVATE on', () => {
  it('sends the same webhook-id, the request_id, with a valid signature each time, and delivers the request', async () => {
    await storeRequest(`${receiver.url}/hook`, true);
    receiver.answerWith(500);

    await runWorkerOnce(folders, at(0));
    receiver.answerWith(204);
    await runWorkerOnce(folders, at(1));

    const [stored] = readQueue(folders);
    expect(receiver.received).toHaveLength(2);
    expect(stored.request_id).not.toBe('');
    expect(receiver.received.map((call) => call.headers['webhook-id'])).toEqual([stored.request_id, stored.request_id]);
    for (const call of receiver.received) {
      expect(new Webhook(secret).verify(call.rawBody, call.headers as Record<string, string>)).toMatchObject({
        request_id: stored.request_id,
      });
    }
    expect(stored.status).toBe('delivered');
  });
});

describe('a webhook delivery to a host that resolves to 127.0.0.1 with FORMGATE_WEBHOOK_ALLOW_PRIVATE off', () => {
  it('sends nothing to the receiver and fails the channel attempt with a reason naming the host', async () => {
    const port = new URL(receiver.url).port;
    await storeRequest(`http://localhost:${port}/hook`, false);

    await runWorkerOnce(folders, at(0));

    expect(receiver.received).toHaveLength(0);
    const [stored] = readQueue(folders);
    expect(stored.channels['webhook #1'].delivered).toBe(false);
    expect(stored.channels['webhook #1'].reason).toMatch(/^Webhook: .*host localhost resolves to 127\.0\.0\.1/);
  });
});
