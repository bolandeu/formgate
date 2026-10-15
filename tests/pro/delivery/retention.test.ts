// Retention of Pro: the worker deletes the requests and the spam log entries older than 30 days and keeps the
// younger ones, at most once an hour.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type FakeChannel, postJson, projectSettings, startFakeChannel } from '../../support/lite.ts';
import { at, createDeliveryFolders, projectKey, seedEntries, storedTimes } from '../../support/pro-delivery.ts';
import { type Pro, type ProFolders, runWorkerOnce, startPro } from '../../support/pro.ts';

const visitorForm = { __form: 'callback', name: 'Анна', phone: '+7 900 123-45-67', consent: '1' };
const older = '2026-09-13T12:00:00Z'; // 31 days before the start
const younger = '2026-09-15T12:00:00Z'; // 29 days before the start

let channel: FakeChannel;
let folders: ProFolders;
let pro: Pro;

beforeEach(async () => {
  channel = await startFakeChannel();
  folders = createDeliveryFolders('1');
  folders.writeProject(projectKey, projectSettings(channel));
  pro = await startPro(folders, { FORMGATE_TEST_NOW: at(0) });
  await postJson(pro.formUrl(projectKey), visitorForm); // makes the tables
});

afterEach(async () => {
  pro.stop();
  folders.remove();
  await channel.stop();
});

describe('the worker run', () => {
  it('deletes the requests and the spam log entries of 31 days and keeps those of 29 days', async () => {
    seedEntries(folders, older);
    seedEntries(folders, younger);

    await runWorkerOnce(folders, at(0));

    expect(storedTimes(folders)).toEqual({ requests: [younger, at(0)], spam: [younger] });
  });

  it('deletes the old entries at most once an hour', async () => {
    await runWorkerOnce(folders, at(0));
    seedEntries(folders, older);

    await runWorkerOnce(folders, at(30 * 60));
    expect(storedTimes(folders).requests).toEqual([older, at(0)]);

    await runWorkerOnce(folders, at(61 * 60));
    expect(storedTimes(folders)).toEqual({ requests: [at(0)], spam: [] });
  });
});
