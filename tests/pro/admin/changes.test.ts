// The change routes of the Pro admin API over HTTP: domains, channels, delete; a refused change is 422 invalid and
// writes nothing, an unknown key is 404, and two changes at once keep both.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { callAdmin } from '../../support/pro-admin.ts';
import { createProFolders, type Pro, type ProFolders, startProAdmin } from '../../support/pro.ts';
import { runProject } from '../../support/pro-projects.ts';

const key = 'admin-key-1';
const site1 = {
  external_id: 'site-1',
  name: 'Site 1',
  domain: 'site1.ru',
  channel: { type: 'telegram', options: { bot_token: '123:abc', chat_id: '1' } },
};
const email = {
  type: 'email',
  options: {
    to: 'a@site1.ru',
    methods: [{ type: 'smtp', host: 'localhost', port: 25, encryption: 'none', from: 'noreply@site1.ru', username: 'u', password: 'SMTP-SECRET' }],
  },
};

let folders: ProFolders;
let admin: Pro;
let projectKey: string;

beforeEach(async () => {
  folders = createProFolders();
  admin = await startProAdmin(folders, { FORMGATE_ADMIN_KEYS: key, PHP_CLI_SERVER_WORKERS: '4' });
  const created = await call('/admin/projects', 'POST', site1);
  projectKey = (created.body?.project as { key: string }).key;
});

afterEach(() => {
  admin.stop();
  folders.remove();
});

const call = (path: string, method: string, body?: unknown) => callAdmin(admin, path, { method, key, body });
const project = (answer: { body: Record<string, unknown> | null }) => answer.body?.project as Record<string, unknown>;

describe('domains', () => {
  it('adds www.site1.ru, removes site1.ru, and refuses to remove the last domain', async () => {
    const added = await call(`/admin/projects/${projectKey}/domains`, 'POST', { domain: 'www.site1.ru' });
    const removed = await call(`/admin/projects/${projectKey}/domains/site1.ru`, 'DELETE');
    const last = await call(`/admin/projects/${projectKey}/domains/www.site1.ru`, 'DELETE');

    expect(project(added).domains).toEqual(['site1.ru', 'www.site1.ru']);
    expect(removed.status).toBe(200);
    expect(project(removed).domains).toEqual(['www.site1.ru']);
    expect(last).toMatchObject({
      status: 422,
      body: { ok: false, code: 'invalid', error: 'project.domains: cannot remove www.site1.ru, a project needs at least one domain' },
    });
    expect(project(await call(`/admin/projects/${projectKey}`, 'GET')).domains).toEqual(['www.site1.ru']);
  });

  it('refuses a domain that is not a host name with 422 and changes nothing', async () => {
    const answer = await call(`/admin/projects/${projectKey}/domains`, 'POST', { domain: 'not a domain' });

    expect(answer).toMatchObject({ status: 422, body: { code: 'invalid' } });
    expect(project(await call(`/admin/projects/${projectKey}`, 'GET')).domains).toEqual(['site1.ru']);
  });
});

describe('channels', () => {
  it('adds an email channel, changes its options, and removes channels but not the last', async () => {
    const added = await call(`/admin/projects/${projectKey}/channels`, 'POST', email);
    const changed = await call(`/admin/projects/${projectKey}/channels/2`, 'PATCH', { options: { to: 'b@site1.ru' } });
    const first = await call(`/admin/projects/${projectKey}/channels/1`, 'DELETE');
    const last = await call(`/admin/projects/${projectKey}/channels/1`, 'DELETE');

    expect(project(added).channels).toHaveLength(2);
    const channels = project(changed).channels as { type: string; options: Record<string, unknown> }[];
    expect(channels.map((channel) => channel.type)).toEqual(['telegram', 'email']);
    expect(channels[1].options).toMatchObject({ to: 'b@site1.ru', methods: [{ host: 'localhost', password: '***' }] });
    expect(JSON.stringify(changed.body)).not.toContain('SMTP-SECRET');
    expect(first.status).toBe(200);
    expect((project(first).channels as { type: string }[]).map((channel) => channel.type)).toEqual(['email']);
    expect(last).toMatchObject({
      status: 422,
      body: { code: 'invalid', error: 'channels: cannot remove the only channel, a project needs at least one channel' },
    });
  });

  it('refuses to remove a channel that a routing case uses', async () => {
    await call(`/admin/projects/${projectKey}/channels`, 'POST', email);
    await runProject(folders, 'case:add', [projectKey, '--name', 'vacancies', '--form', 'vacancy', '--channel', '2']);

    const answer = await call(`/admin/projects/${projectKey}/channels/2`, 'DELETE');

    expect(answer).toMatchObject({ status: 422, body: { code: 'invalid', error: 'channels: cannot remove channel 2, it is used by case #1 vacancies' } });
    expect(project(await call(`/admin/projects/${projectKey}`, 'GET')).channels).toHaveLength(2);
  });

  it('keeps the optional channel name', async () => {
    const answer = await call(`/admin/projects/${projectKey}/channels`, 'POST', { ...email, name: 'office' });

    expect((project(answer).channels as { name?: string }[])[1].name).toBe('office');
  });

  it('refuses a channel with a missing option and a number that does not exist, and changes nothing', async () => {
    const missing = await call(`/admin/projects/${projectKey}/channels`, 'POST', { type: 'telegram', options: { bot_token: '1:a' } });
    const patch = await call(`/admin/projects/${projectKey}/channels/5`, 'PATCH', { options: { to: 'x@site1.ru' } });

    expect(missing).toMatchObject({ status: 422, body: { code: 'invalid' } });
    expect(patch).toMatchObject({ status: 422, body: { code: 'invalid' } });
    expect(project(await call(`/admin/projects/${projectKey}`, 'GET')).channels).toHaveLength(1);
  });
});

describe('delete', () => {
  it('asks for confirm=true, then deletes the project', async () => {
    const without = await call(`/admin/projects/${projectKey}`, 'DELETE');
    const stillThere = await call(`/admin/projects/${projectKey}`, 'GET');
    const deleted = await call(`/admin/projects/${projectKey}?confirm=true`, 'DELETE');
    const gone = await call(`/admin/projects/${projectKey}`, 'GET');

    expect(without).toEqual({ status: 400, body: { ok: false, code: 'confirm_required' } });
    expect(stillThere.status).toBe(200);
    expect(deleted.status).toBe(200);
    expect(gone).toEqual({ status: 404, body: { ok: false, code: 'project_not_found' } });
  });
});

describe('an unknown key', () => {
  it.each([
    ['POST', '/domains', { domain: 'a.ru' }],
    ['DELETE', '/domains/a.ru', undefined],
    ['POST', '/channels', email],
    ['PATCH', '/channels/1', { options: {} }],
    ['DELETE', '/channels/1', undefined],
    ['POST', '/selfcheck', { send: false }],
    ['DELETE', '?confirm=true', undefined],
  ])('answers %s %s with 404 project_not_found', async (method, tail, body) => {
    const answer = await call(`/admin/projects/UnknownProject123${tail}`, method, body);

    expect(answer).toEqual({ status: 404, body: { ok: false, code: 'project_not_found' } });
  });
});

describe('two changes at once', () => {
  it('keeps both of two PATCH calls with different options', async () => {
    await call(`/admin/projects/${projectKey}/channels`, 'POST', email);

    const changes = [{ to: 'b@site1.ru' }, { subject: 'Other' }];
    const answers = await Promise.all(changes.map((options) => call(`/admin/projects/${projectKey}/channels/2`, 'PATCH', { options })));

    const options = ((project(await call(`/admin/projects/${projectKey}`, 'GET')).channels as { options: Record<string, unknown> }[])[1]).options;
    answers.forEach((answer, index) => {
      if (answer.status === 409) {
        expect(answer.body).toEqual({ ok: false, code: 'busy' });
      } else {
        expect(answer.status).toBe(200);
        expect(options).toMatchObject(changes[index]);
      }
    });
  });
});
