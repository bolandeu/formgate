// Operator alerts of Pro through one Telegram bot: one alert for a request that is not delivered after the last
// repeat, one alert when a channel goes down (3 failures in a row) and one when it comes up; without a bot the worker
// only logs.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type FakeChannel, postJson, projectSettings, startFakeChannel } from '../../support/lite.ts';
import { at, createDeliveryFolders, projectKey, twoChannelSettings } from '../../support/pro-delivery.ts';
import { type Pro, type ProFolders, readQueue, runWorkerOnce, startPro } from '../../support/pro.ts';

const visitorForm = { __form: 'callback', name: 'Анна', phone: '+7 900 123-45-67', consent: '1' };

let operatorBot: FakeChannel;
let channel: FakeChannel;
let other: FakeChannel;
let folders: ProFolders;
let pro: Pro | undefined;

beforeEach(async () => {
  operatorBot = await startFakeChannel();
  channel = await startFakeChannel();
  other = await startFakeChannel();
  channel.answerWith(500, { ok: false, description: 'Internal Server Error' });
});

afterEach(async () => {
  pro?.stop();
  pro = undefined;
  folders.remove();
  await operatorBot.stop();
  await channel.stop();
  await other.stop();
});

async function startWith(schedule: string, bot: FakeChannel | undefined, settings: object): Promise<Pro> {
  folders = createDeliveryFolders(schedule, bot);
  folders.writeProject(projectKey, settings);
  pro = await startPro(folders, { FORMGATE_TEST_NOW: at(0) });
  return pro;
}

function alertTexts(): string[] {
  return operatorBot.calls.map((call) => String(call.body.text));
}

describe('a request that is not delivered after the last repeat', () => {
  it('gives the operator bot one alert naming the project and the channel', async () => {
    const started = await startWith('1', operatorBot, twoChannelSettings(other, channel));
    await postJson(started.formUrl(projectKey), visitorForm);

    await runWorkerOnce(folders, at(0));
    await runWorkerOnce(folders, at(1));
    await runWorkerOnce(folders, at(100));

    expect(operatorBot.calls.map((call) => call.path)).toEqual(['/botOPERATOR-TOKEN/sendMessage']);
    expect(operatorBot.calls[0].body.chat_id).toBe('-200');
    expect(alertTexts()).toEqual([
      `Formgate, project ${projectKey}: request 1 is not delivered after the last repeat\n` +
        'channel telegram #2 failed: Telegram: HTTP 500: {"ok":false,"description":"Internal Server Error"}',
    ]);
    expect(readQueue(folders).map((request) => request.status)).toEqual(['not_delivered']);
  });
});

describe('a channel that fails on 5 requests in a row and then delivers one', () => {
  it('gives exactly one down alert after the 3rd failure and one up alert', async () => {
    const started = await startWith('60', operatorBot, projectSettings(channel));
    for (let sent = 0; sent < 5; sent++) await postJson(started.formUrl(projectKey), visitorForm);

    await runWorkerOnce(folders, at(0));

    expect(channel.calls).toHaveLength(5);
    expect(alertTexts()).toEqual([
      `Formgate, project ${projectKey}: channel telegram #1 is down after 3 failures in a row: ` +
        'Telegram: HTTP 500: {"ok":false,"description":"Internal Server Error"}',
    ]);

    channel.answerWith(200, { ok: true, result: {} });
    await runWorkerOnce(folders, at(60));

    expect(alertTexts()).toHaveLength(2);
    expect(alertTexts()[1]).toBe(`Formgate, project ${projectKey}: channel telegram #1 is up again`);
    expect(readQueue(folders).map((request) => request.status)).toEqual(Array(5).fill('delivered'));
  });
});

describe('no operator bot is set', () => {
  it('logs that the channel is down, and the worker does not fail', async () => {
    const started = await startWith('60', undefined, projectSettings(channel));
    for (let sent = 0; sent < 3; sent++) await postJson(started.formUrl(projectKey), visitorForm);

    const run = await runWorkerOnce(folders, at(0));

    expect(run.status).toBe(0);
    expect(run.stderr).toContain(`project ${projectKey}: channel telegram #1 is down after 3 failures in a row`);
    expect(operatorBot.calls).toHaveLength(0);
  });
});
