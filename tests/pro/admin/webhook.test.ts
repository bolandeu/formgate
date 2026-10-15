// The webhook channel in the Pro project edits: the private-address guard refuses a receiver URL whose host is not a
// public address (admin API and CLI) unless FORMGATE_WEBHOOK_ALLOW_PRIVATE is on, and the url, the secret and every
// header value of a webhook channel are masked in the answers while the header names stay visible.
import { readdirSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { callAdmin } from '../../support/pro-admin.ts';
import { createProject, projectFile, runProject } from '../../support/pro-projects.ts';
import { createProFolders, type Pro, type ProFolders, startProAdmin } from '../../support/pro.ts';

const adminKey = 'admin-key-1';
const secret = 'webhook-secret-1';
const webhook = (url: string) => ({ type: 'webhook', options: { url, secret, timeout_seconds: 5 } });
const site1 = {
  external_id: 'site-1',
  name: 'Site 1',
  domain: 'site1.ru',
  channel: { type: 'telegram', options: { bot_token: '123:abc', chat_id: '1' } },
};

let folders: ProFolders;
let admin: Pro;

// Starts the admin API on new folders; `env` adds variables, for example FORMGATE_WEBHOOK_ALLOW_PRIVATE.
async function startAdmin(env: Record<string, string> = {}) {
  folders = createProFolders();
  admin = await startProAdmin(folders, { FORMGATE_ADMIN_KEYS: adminKey, ...env });
}

afterEach(() => {
  admin.stop();
  folders.remove();
});

const createSite = async (body: object = site1) => {
  const answer = await callAdmin(admin, '/admin/projects', { method: 'POST', key: adminKey, body });
  return { answer, key: (answer.body?.project as { key?: string } | undefined)?.key ?? '' };
};
const addChannel = (key: string, body: object) => callAdmin(admin, `/admin/projects/${key}/channels`, { method: 'POST', key: adminKey, body });

describe('the private-address guard with FORMGATE_WEBHOOK_ALLOW_PRIVATE off', () => {
  beforeEach(() => startAdmin());

  it.each([
    ['https://127.0.0.1:9/hook', '127.0.0.1'],
    ['https://10.0.0.5/hook', '10.0.0.5'],
    ['https://[fd00::1]/hook', 'fd00::1'],
  ])('refuses the admin API to add a webhook channel on %s with 422 invalid naming the host', async (url, host) => {
    const { key } = await createSite();
    const before = projectFile(folders, key);

    const answer = await addChannel(key, webhook(url));

    expect(answer.status).toBe(422);
    expect(answer.body).toMatchObject({ ok: false, code: 'invalid' });
    expect(answer.body?.error).toContain(`host ${host}`);
    expect(projectFile(folders, key)).toBe(before);
  });

  it('refuses the admin API to create a project with a webhook channel on a private host and makes no project', async () => {
    const { answer } = await createSite({ ...site1, channel: webhook('https://192.168.1.10/hook') });

    expect(answer.status).toBe(422);
    expect(answer.body?.error).toContain('host 192.168.1.10');
    expect(readdirSync(folders.projects).filter((name) => name.endsWith('.php'))).toEqual([]);
  });

  it('refuses the admin API to change a webhook channel to a loopback host', async () => {
    const { key } = await createSite({ ...site1, channel: webhook('https://1.1.1.1/hook') });
    const before = projectFile(folders, key);

    const answer = await callAdmin(admin, `/admin/projects/${key}/channels/1`, {
      method: 'PATCH',
      key: adminKey,
      body: { options: { url: 'https://localhost/hook' } },
    });

    expect(answer.status).toBe(422);
    expect(answer.body?.error).toContain('host localhost');
    expect(projectFile(folders, key)).toBe(before);
  });

  it('refuses project:channel:add of a webhook channel on 127.0.0.1 with a non-zero exit and the host named', async () => {
    const key = await createProject(folders, 'Site 1', 'site1.ru');
    const before = projectFile(folders, key);

    const run = await runProject(folders, 'channel:add', [key, 'webhook', '-o', 'url=https://127.0.0.1:9/hook', '-o', `secret=${secret}`]);

    expect(run.status).not.toBe(0);
    expect(run.stdout + run.stderr).toContain('host 127.0.0.1');
    expect(projectFile(folders, key)).toBe(before);
  });

  it('refuses project:create with a webhook channel on 10.0.0.5', async () => {
    const run = await runProject(folders, 'create', ['Site 1', 'site1.ru', 'webhook', '-o', 'url=https://10.0.0.5/hook', '-o', `secret=${secret}`]);

    expect(run.status).not.toBe(0);
    expect(run.stdout + run.stderr).toContain('host 10.0.0.5');
    expect(readdirSync(folders.projects).filter((name) => name.endsWith('.php'))).toEqual([]);
  });

  it('accepts a webhook channel on a public address', async () => {
    const { key } = await createSite();

    const answer = await addChannel(key, webhook('https://1.1.1.1/hook'));

    expect(answer.status).toBe(200);
  });
});

describe('the private-address guard with FORMGATE_WEBHOOK_ALLOW_PRIVATE on', () => {
  beforeEach(() => startAdmin({ FORMGATE_WEBHOOK_ALLOW_PRIVATE: '1' }));

  it('accepts a webhook channel on 10.0.0.5', async () => {
    const { key } = await createSite();

    const answer = await addChannel(key, webhook('https://10.0.0.5/hook'));

    expect(answer.status).toBe(200);
  });
});

describe('the masked webhook channel', () => {
  beforeEach(() => startAdmin());

  const options = { url: 'https://1.1.1.1/hook', secret, headers: { Authorization: 'Bearer abc', 'X-Site': 'site-1' }, timeout_seconds: 5 };

  it('shows url, secret and each header value as *** in GET /admin/projects/<key>, with the header names', async () => {
    const { key } = await createSite({ ...site1, channel: { type: 'webhook', options } });

    const answer = await callAdmin(admin, `/admin/projects/${key}`, { key: adminKey });

    const project = answer.body?.project as { channels: unknown[] };
    expect(project.channels).toEqual([
      { type: 'webhook', options: { url: '***', secret: '***', headers: { Authorization: '***', 'X-Site': '***' }, timeout_seconds: 5 } },
    ]);
    const text = JSON.stringify(answer.body);
    expect(text).not.toContain(secret);
    expect(text).not.toContain('abc');
    expect(text).not.toContain('1.1.1.1');
  });

  it('masks them in project:show too', async () => {
    const { key } = await createSite({ ...site1, channel: { type: 'webhook', options } });

    const run = await runProject(folders, 'show', [key]);

    expect(JSON.parse(run.stdout).channels[0].options).toEqual({
      url: '***',
      secret: '***',
      headers: { Authorization: '***', 'X-Site': '***' },
      timeout_seconds: 5,
    });
  });
});
