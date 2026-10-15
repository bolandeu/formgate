// Pro frame over HTTP: a form posted to /f/<key> is stored and answered like Lite, `worker --once` delivers it to
// the channels of the project and records each channel's result; an unknown key and a foreign domain are refused.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  type FakeChannel,
  postForm,
  postJson,
  projectOrigin,
  projectSettings,
  startFakeChannel,
} from '../support/lite.ts';
import { createProFolders, type Pro, type ProFolders, readQueue, runWorkerOnce, startPro } from '../support/pro.ts';

const visitorForm = { __form: 'callback', name: 'Анна', phone: '+7 900 123-45-67', consent: '1' };
const telegramKey = 'TelegramProject1';
const twoChannelsKey = 'TwoChannelsProj1';
const consentLine = /^Согласие на обработку ПД: дано \d{2}\.\d{2}\.\d{4} \d{2}:\d{2}$/;

let telegram: FakeChannel;
let failing: FakeChannel;
let folders: ProFolders;
let pro: Pro;

beforeAll(async () => {
  telegram = await startFakeChannel();
  failing = await startFakeChannel();
  failing.answerWith(500, { ok: false, description: 'Internal Server Error' });
  folders = createProFolders();
  folders.writeProject(telegramKey, projectSettings(telegram));
  const twoChannels = projectSettings(telegram);
  folders.writeProject(twoChannelsKey, {
    ...twoChannels,
    channels: [projectSettings(failing).channels[0], twoChannels.channels[0]],
  });
  pro = await startPro(folders);
});

afterAll(async () => {
  pro.stop();
  folders.remove();
  await telegram.stop();
  await failing.stop();
});

afterEach(async () => {
  await runWorkerOnce(folders);
  telegram.calls.length = 0;
  failing.calls.length = 0;
});

describe('a valid form posted to /f/<key>', () => {
  it('gets the Lite success answer before the worker runs; worker --once sends it to the channel once', async () => {
    const answer = await postJson(pro.formUrl(telegramKey), visitorForm);

    expect(answer.status).toBe(200);
    expect(answer.body).toEqual({ ok: true });
    expect(telegram.calls).toHaveLength(0);
    expect(readQueue(folders).map((request) => request.status)).toEqual(['queued']);

    await runWorkerOnce(folders);
    await runWorkerOnce(folders);

    expect(telegram.calls).toHaveLength(1);
    expect(telegram.calls[0].path).toBe('/botTEST-TOKEN/sendMessage');
    const lines = String(telegram.calls[0].body.text).split('\n');
    expect(lines.slice(0, 3)).toEqual(['name: Анна', 'phone: +7 900 123-45-67', 'consent: 1']);
    expect(lines[3]).toMatch(consentLine);
    expect(lines).toHaveLength(4);
    const [stored] = readQueue(folders).slice(-1);
    expect(stored).toMatchObject({
      project_key: telegramKey,
      form: 'callback',
      status: 'delivered',
      channels: { 'telegram #1': { delivered: true, reason: '' } },
    });
  });

  it('as a plain form gets 303 to the thank-you page', async () => {
    const answer = await postForm(pro.formUrl(telegramKey), visitorForm);

    expect(answer.status).toBe(303);
    expect(answer.location).toBe('https://site.ru/thanks/');
  });
});

describe('a key without a project file', () => {
  it('gets 404 project_not_found and nothing is stored', async () => {
    const empty = createProFolders();
    const proWithoutProjects = await startPro(empty);
    try {
      const answer = await postJson(proWithoutProjects.formUrl('NoSuchProject123'), visitorForm);

      expect(answer.status).toBe(404);
      expect(answer.body).toEqual({
        ok: false,
        code: 'project_not_found',
        error: 'Форма отправляет заявку по неверному адресу.',
      });
      expect(readQueue(empty)).toEqual([]);
    } finally {
      proWithoutProjects.stop();
      empty.remove();
    }
  });
});

describe('the domains of the project', () => {
  it('refuse a request from https://other.ru as Lite does', async () => {
    const answer = await postJson(pro.formUrl(telegramKey), visitorForm, { Origin: 'https://other.ru' });

    expect(answer.status).toBe(403);
    expect(answer.body).toMatchObject({ ok: false, code: 'origin_not_allowed' });
    expect(answer.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('accept a request from https://site.ru with the CORS headers', async () => {
    const answer = await postJson(pro.formUrl(telegramKey), visitorForm);

    expect(answer.status).toBe(200);
    expect(answer.headers.get('access-control-allow-origin')).toBe(projectOrigin);
    expect(answer.headers.get('vary')).toBe('Origin');
  });
});

describe('one channel answers 500 and another 200', () => {
  it('worker --once records the second channel delivered and the first failed with the reason', async () => {
    await postJson(pro.formUrl(twoChannelsKey), visitorForm);

    await runWorkerOnce(folders);

    expect(failing.calls).toHaveLength(1);
    expect(telegram.calls).toHaveLength(1);
    const [stored] = readQueue(folders).slice(-1);
    expect(stored.project_key).toBe(twoChannelsKey);
    expect(stored.status).toBe('partial');
    expect(stored.channels).toEqual({
      'telegram #1': {
        delivered: false,
        reason: 'Telegram: HTTP 500: {"ok":false,"description":"Internal Server Error"}',
      },
      'telegram #2': { delivered: true, reason: '' },
    });
  });
});
