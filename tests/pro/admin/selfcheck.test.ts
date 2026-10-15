// The self-check route of the Pro admin API: the findings of the project, and a test send through each channel only
// with send true.
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { type FakeChannel, startFakeChannel } from '../../support/lite.ts';
import { callAdmin } from '../../support/pro-admin.ts';
import { createProFolders, type Pro, type ProFolders, startProAdmin } from '../../support/pro.ts';

const key = 'admin-key-1';

let telegram: FakeChannel;
let folders: ProFolders;
let admin: Pro;
let projectKey: string;

beforeAll(async () => {
  telegram = await startFakeChannel();
});

afterAll(() => telegram.stop());

beforeEach(async () => {
  folders = createProFolders();
  admin = await startProAdmin(folders, { FORMGATE_ADMIN_KEYS: key });
  const created = await callAdmin(admin, '/admin/projects', {
    method: 'POST',
    key,
    body: {
      external_id: 'site-1',
      name: 'Site 1',
      domain: 'site1.ru',
      channel: { type: 'telegram', options: { bot_token: 'SECRET-TOKEN-777', chat_id: '-100', api_url: telegram.url } },
    },
  });
  projectKey = (created.body?.project as { key: string }).key;
});

afterEach(() => {
  admin.stop();
  folders.remove();
  telegram.calls.length = 0;
});

const selfCheck = (send: boolean, target = projectKey) =>
  callAdmin(admin, `/admin/projects/${target}/selfcheck`, { method: 'POST', key, body: { send } });

it('with send true: one result per channel and one message on the fake Telegram server, no secret in the answer', async () => {
  const answer = await selfCheck(true);

  expect(answer.status).toBe(200);
  expect(answer.body?.findings).toEqual([{ level: 'ok', label: 'telegram #1', detail: 'test message sent' }]);
  expect(telegram.calls).toHaveLength(1);
  expect(JSON.stringify(answer.body)).not.toContain('SECRET-TOKEN-777');
});

it('with send false: the channel is only built, and no message goes out', async () => {
  const answer = await selfCheck(false);

  expect(answer.body?.findings).toEqual([{ level: 'ok', label: 'telegram #1', detail: 'configured' }]);
  expect(telegram.calls).toHaveLength(0);
});

it('answers 404 project_not_found to an unknown key', async () => {
  expect(await selfCheck(false, 'UnknownProject123')).toEqual({ status: 404, body: { ok: false, code: 'project_not_found' } });
});
