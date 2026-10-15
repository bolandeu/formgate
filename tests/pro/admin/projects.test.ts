// The project routes of the Pro admin API over HTTP: create is idempotent by the external id, show finds a project
// by key and by external id, secrets never come back, and a refused input is 422 invalid with nothing written.
import { readdirSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { callAdmin } from '../../support/pro-admin.ts';
import { createProject } from '../../support/pro-projects.ts';
import { createProFolders, type Pro, type ProFolders, startProAdmin } from '../../support/pro.ts';

const key = 'admin-key-1';
const site1 = {
  external_id: 'site-1',
  name: 'Site 1',
  domain: 'site1.ru',
  channel: { type: 'telegram', options: { bot_token: '123:abc', chat_id: '1' } },
};

let folders: ProFolders;
let admin: Pro;

beforeEach(async () => {
  folders = createProFolders();
  // Workers serve two calls at the same time, so the test of two creates at once is real.
  admin = await startProAdmin(folders, { FORMGATE_ADMIN_KEYS: key, PHP_CLI_SERVER_WORKERS: '4' });
});

afterEach(() => {
  admin.stop();
  folders.remove();
});

const projectFiles = () => readdirSync(folders.projects).filter((name) => name.endsWith('.php'));
const create = (body: unknown) => callAdmin(admin, '/admin/projects', { method: 'POST', key, body });

describe('POST /admin/projects', () => {
  it('makes the project once: 201 the first time, 200 with the same key after, the bot token masked', async () => {
    const first = await create(site1);
    const second = await create(site1);

    expect(first.status).toBe(201);
    const project = first.body?.project as Record<string, unknown>;
    const projectKey = project.key as string;
    expect(projectKey).toMatch(/^[A-Za-z0-9]{16}$/);
    expect(project).toEqual({
      key: projectKey,
      external_id: 'site-1',
      name: 'Site 1',
      domains: ['site1.ru'],
      channels: [{ type: 'telegram', options: { bot_token: '***', chat_id: '1' } }],
      form_path: `/f/${projectKey}`,
    });
    expect(first.body?.ok).toBe(true);
    expect(second).toEqual({ status: 200, body: first.body });
    expect(projectFiles()).toEqual([`${projectKey}.php`]);
    expect((await callAdmin(admin, '/admin/projects?external_id=site-1', { key })).body?.project).toEqual(project);
  });

  it('changes nothing for an external id that exists, even when the name and the channel differ', async () => {
    const first = await create(site1);

    const again = await create({ ...site1, name: 'Other', channel: { type: 'telegram', options: { bot_token: '9:z', chat_id: '2' } } });

    expect(again).toEqual({ status: 200, body: first.body });
    expect(projectFiles()).toHaveLength(1);
  });

  it('makes one project for two calls at once with one external id', async () => {
    const answers = await Promise.all([create(site1), create(site1)]);

    expect(answers.map((answer) => answer.status).sort()).toEqual([200, 201]);
    expect(projectFiles()).toHaveLength(1);
  });

  it.each([
    ['a domain that is not a host name', { ...site1, domain: 'not a domain' }, "project.domains: 'not a domain' is not a host name"],
    ['a channel without chat_id', { ...site1, channel: { type: 'telegram', options: { bot_token: '123:abc' } } }, 'chat_id'],
    ['an unknown channel type', { ...site1, channel: { type: 'pigeon', options: {} } }, "unknown channel type 'pigeon'"],
    ['no external id', { ...site1, external_id: '' }, 'external_id: must be a non-empty string'],
    ['no channel', { ...site1, channel: undefined }, 'channel: must be an object {type, options}'],
    ['a body that is not JSON', 'not json', 'body: must be a JSON object'],
  ])('refuses %s with 422 invalid and makes no project', async (_, body, reason) => {
    const answer = await create(body);

    expect(answer.status).toBe(422);
    expect(answer.body).toMatchObject({ ok: false, code: 'invalid' });
    expect(answer.body?.error).toContain(reason);
    expect(projectFiles()).toEqual([]);
  });
});

describe('GET /admin/projects', () => {
  it('shows a project by its key with the secrets masked; a CLI project has no external id', async () => {
    const projectKey = await createProject(folders, 'Shop', 'shop.ru');

    const answer = await callAdmin(admin, `/admin/projects/${projectKey}`, { key });

    expect(answer).toEqual({
      status: 200,
      body: {
        ok: true,
        project: {
          key: projectKey,
          external_id: null,
          name: 'Shop',
          domains: ['shop.ru'],
          channels: [{ type: 'telegram', options: { bot_token: '***', chat_id: '-100' } }],
          form_path: `/f/${projectKey}`,
        },
      },
    });
  });

  it('answers 404 project_not_found to an unknown external id', async () => {
    await create(site1);

    const answer = await callAdmin(admin, '/admin/projects?external_id=site-2', { key });

    expect(answer).toEqual({ status: 404, body: { ok: false, code: 'project_not_found' } });
  });
});
