// The failed list and the retry command of the Pro CLI: the list shows the requests not delivered with the failed
// channels and reasons; the retry sends only to the channels that did not accept the request, and a wrong id changes
// nothing.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type FakeChannel, postJson, startFakeChannel } from '../../support/lite.ts';
import { at, createDeliveryFolders, projectKey, runCommand, twoChannelSettings } from '../../support/pro-delivery.ts';
import { type Pro, type ProFolders, readQueue, runWorkerOnce, startPro } from '../../support/pro.ts';

const visitorForm = { __form: 'callback', name: 'Анна', phone: '+7 900 123-45-67', consent: '1' };
const reason = 'Telegram: HTTP 500: {"ok":false,"description":"Internal Server Error"}';

let accepting: FakeChannel;
let failing: FakeChannel;
let folders: ProFolders;
let pro: Pro;

beforeEach(async () => {
  accepting = await startFakeChannel();
  failing = await startFakeChannel();
  failing.answerWith(500, { ok: false, description: 'Internal Server Error' });
  folders = createDeliveryFolders('1');
  folders.writeProject(projectKey, twoChannelSettings(accepting, failing));
  pro = await startPro(folders, { FORMGATE_TEST_NOW: at(0) });
  await postJson(pro.formUrl(projectKey), visitorForm);
  await runWorkerOnce(folders, at(0));
  await runWorkerOnce(folders, at(1));
});

afterEach(async () => {
  pro.stop();
  folders.remove();
  await accepting.stop();
  await failing.stop();
});

describe('failed', () => {
  it('lists the request not delivered with its project, time and failed channel with the reason', async () => {
    const list = await runCommand(folders, ['failed'], at(2));

    expect(list.status).toBe(0);
    expect(list.stdout.split('\n').filter(Boolean)).toEqual([
      `#1 project ${projectKey} received ${at(0)} route default`,
      `  telegram #2: ${reason}`,
    ]);
  });
});

describe('failed:retry', () => {
  it('delivers the request to the failed channel only, and the list is empty', async () => {
    failing.answerWith(200, { ok: true, result: {} });
    accepting.calls.length = 0;
    failing.calls.length = 0;

    const retry = await runCommand(folders, ['failed:retry', '1'], at(2));

    expect(retry.status).toBe(0);
    expect(failing.calls).toHaveLength(1);
    expect(accepting.calls).toHaveLength(0);
    expect(readQueue(folders).map((request) => request.status)).toEqual(['delivered']);
    expect((await runCommand(folders, ['failed'], at(3))).stdout.trim()).toBe('No request is not delivered.');
  });

  it('with --project repeats all the requests of the project', async () => {
    failing.answerWith(200, { ok: true, result: {} });

    const retry = await runCommand(folders, ['failed:retry', `--project=${projectKey}`], at(2));

    expect(retry.status).toBe(0);
    expect(readQueue(folders).map((request) => request.status)).toEqual(['delivered']);
  });

  it('with a wrong request id exits non-zero with "request not found" and changes nothing', async () => {
    failing.answerWith(200, { ok: true, result: {} });
    failing.calls.length = 0;
    const before = readQueue(folders);

    const retry = await runCommand(folders, ['failed:retry', '999'], at(2));

    expect(retry.status).not.toBe(0);
    expect(retry.stdout + retry.stderr).toContain('request not found');
    expect(failing.calls).toHaveLength(0);
    expect(readQueue(folders)).toEqual(before);
  });
});
