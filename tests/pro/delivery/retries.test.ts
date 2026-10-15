// Per-channel repeats of Pro on the repeat schedule: a channel that accepted the request never gets it again, a
// channel that failed gets it at each step of the schedule, and after the last step the request is not delivered.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type FakeChannel, postJson, startFakeChannel } from '../../support/lite.ts';
import { at, createDeliveryFolders, projectKey, twoChannelSettings } from '../../support/pro-delivery.ts';
import { type Pro, type ProFolders, readQueue, runWorkerOnce, startPro } from '../../support/pro.ts';

const visitorForm = { __form: 'callback', name: 'Анна', phone: '+7 900 123-45-67', consent: '1' };

let accepting: FakeChannel;
let failing: FakeChannel;
let folders: ProFolders;
let pro: Pro;

beforeAll(async () => {
  accepting = await startFakeChannel();
  failing = await startFakeChannel();
});

afterAll(async () => {
  await accepting.stop();
  await failing.stop();
});

beforeEach(async () => {
  failing.answerWith(500, { ok: false, description: 'Internal Server Error' });
  folders = createDeliveryFolders('1,2');
  folders.writeProject(projectKey, twoChannelSettings(accepting, failing));
  pro = await startPro(folders, { FORMGATE_TEST_NOW: at(0) });
  await postJson(pro.formUrl(projectKey), visitorForm);
});

afterEach(() => {
  pro.stop();
  folders.remove();
  accepting.calls.length = 0;
  failing.calls.length = 0;
});

describe('a channel that answers 500 on the schedule 1s, 2s', () => {
  it('gets the request 3 times, the accepting channel once, and the request is not delivered', async () => {
    await runWorkerOnce(folders, at(0));
    await runWorkerOnce(folders, at(1));
    await runWorkerOnce(folders, at(3));
    await runWorkerOnce(folders, at(100));

    expect(accepting.calls).toHaveLength(1);
    expect(failing.calls).toHaveLength(3);
    expect(readQueue(folders).map((request) => request.status)).toEqual(['not_delivered']);
  });

  it('is not sent again before the pause of the schedule has passed', async () => {
    await runWorkerOnce(folders, at(0));
    await runWorkerOnce(folders, at(0));

    expect(failing.calls).toHaveLength(1);
    expect(readQueue(folders).map((request) => request.status)).toEqual(['partial']);
  });
});

describe('a channel that fails first and answers 200 on the second attempt', () => {
  it('delivers the request, and the channel got it exactly twice', async () => {
    await runWorkerOnce(folders, at(0));
    failing.answerWith(200, { ok: true, result: {} });
    await runWorkerOnce(folders, at(1));
    await runWorkerOnce(folders, at(3));
    await runWorkerOnce(folders, at(100));

    expect(failing.calls).toHaveLength(2);
    expect(accepting.calls).toHaveLength(1);
    const [stored] = readQueue(folders);
    expect(stored.status).toBe('delivered');
    expect(stored.channels).toEqual({
      'telegram #1': { delivered: true, reason: '' },
      'telegram #2': { delivered: true, reason: '' },
    });
  });
});
