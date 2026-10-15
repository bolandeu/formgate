// The project self-check: each channel ok or fail with the reason, no secret in the output, and a test send only
// when --send asks for it.
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { type FakeChannel, projectSettings, startFakeChannel } from '../../support/lite.ts';
import { createProFolders, type ProFolders } from '../../support/pro.ts';
import { runProject } from '../../support/pro-projects.ts';

const key = 'SelfCheckProject';

let working: FakeChannel;
let failing: FakeChannel;
let folders: ProFolders;

beforeAll(async () => {
  working = await startFakeChannel();
  failing = await startFakeChannel();
  failing.answerWith(500, { ok: false, description: 'Internal Server Error' });
});

afterAll(async () => {
  await working.stop();
  await failing.stop();
});

beforeEach(() => {
  folders = createProFolders();
  const settings = projectSettings(working);
  const secretChannel = { type: 'telegram', options: { ...failingOptions(), bot_token: 'SECRET-TOKEN-777' } };
  folders.writeProject(key, { ...settings, channels: [settings.channels[0], secretChannel] });
});

afterEach(() => {
  folders.remove();
  working.calls.length = 0;
  failing.calls.length = 0;
});

function failingOptions() {
  return { chat_id: '-100', api_url: failing.url };
}

it('with --send: the channel answering 200 is ok, the one answering 500 fails with the reason, no secret is printed', async () => {
  const run = await runProject(folders, 'self-check', [key, '--send']);

  const lines = run.stdout.trim().split('\n');
  expect(lines).toHaveLength(2);
  expect(lines[0]).toMatch(/^ok\s+telegram #1: test message sent$/);
  expect(lines[1]).toMatch(/^fail\s+telegram #2: .*HTTP 500/);
  expect(run.status).not.toBe(0);
  expect(run.stdout + run.stderr).not.toContain('SECRET-TOKEN-777');
  expect(run.stdout + run.stderr).not.toContain('TEST-TOKEN');
  expect(working.calls).toHaveLength(1);
  expect(failing.calls).toHaveLength(1);
});

it('without --send: no test message goes out, and a channel with a missing option fails with the field', async () => {
  folders.writeProject(key, {
    ...projectSettings(working),
    channels: [{ type: 'telegram', options: { bot_token: 'SECRET-TOKEN-777' } }],
  });

  const run = await runProject(folders, 'self-check', [key]);

  expect(run.stdout.trim()).toMatch(/^fail\s+telegram #1: .*chat_id/);
  expect(run.status).not.toBe(0);
  expect(run.stdout + run.stderr).not.toContain('SECRET-TOKEN-777');
  expect(working.calls).toHaveLength(0);
});
