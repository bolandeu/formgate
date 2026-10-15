// The Pro project CLI over the registry: create, add and remove a domain, add a channel, show, delete. The effect is
// checked with posts to /f/<key> on the Pro entry and with the project file.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { numberedFields, postJson, requestToken } from '../../support/lite.ts';
import { createProFolders, type Pro, type ProFolders, startPro } from '../../support/pro.ts';
import { createProject, printedKey, projectFile, runProject, telegramChannel } from '../../support/pro-projects.ts';

const visitorForm = { __form: 'callback', name: 'Анна', phone: '+7 900 123-45-67', consent: '1' };
const fromOrigin = (origin: string) => ({ Origin: origin });

let folders: ProFolders;
let pro: Pro;

beforeEach(async () => {
  folders = createProFolders();
  folders.env.FORMGATE_TOKEN_SECRET = 'test-token-secret-of-pro';
  pro = await startPro(folders);
});

afterEach(() => {
  pro.stop();
  folders.remove();
});

describe('project:create', () => {
  it('prints a 16-character key without the name, and a form from the domain is accepted', async () => {
    const run = await runProject(folders, 'create', ['Acme', 'site.ru', ...telegramChannel]);

    expect(run.status).toBe(0);
    const key = printedKey(run);
    expect(key).toMatch(/^[A-Za-z0-9]{16}$/);
    expect(key.toLowerCase()).not.toContain('acme');
    expect(run.stdout).toContain(`/f/${key}`);
    const answer = await postJson(pro.formUrl(key), visitorForm, fromOrigin('https://site.ru'));
    expect(answer.status).toBe(200);
    expect(answer.body).toEqual({ ok: true });
  });

  it('writes the first channel with its options', async () => {
    const key = await createProject(folders, 'Acme', 'site.ru', ['telegram', '-o', 'bot_token=123:ABC', '-o', 'chat_id=-100']);

    const shown = JSON.parse((await runProject(folders, 'show', [key])).stdout);

    expect(shown.channels).toEqual([{ type: 'telegram', options: { bot_token: '***', chat_id: '-100' } }]);
  });

  it('refuses a first telegram channel without a chat id, names the field and writes no project', async () => {
    const run = await runProject(folders, 'create', ['Acme', 'site.ru', 'telegram', '-o', 'bot_token=123:ABC']);

    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain('chat_id');
    expect(readdirSync(folders.projects).filter((name) => name.endsWith('.php'))).toEqual([]);
    expect(readdirTemp(folders)).toEqual([]);
  });
});

describe('project:create without a channel', () => {
  it('exits non-zero naming the missing channel and writes no file', async () => {
    const run = await runProject(folders, 'create', ['Acme', 'site.ru']);

    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain('first channel');
    expect(readdirSync(folders.projects)).toEqual([]);
    expect(readdirTemp(folders)).toEqual([]);
  });
});

describe('project:domain', () => {
  it('add other.ru then remove site.ru: other.ru is accepted, site.ru is refused', async () => {
    const key = await createProject(folders, 'Acme', 'site.ru');

    expect((await runProject(folders, 'domain:add', [key, 'other.ru'])).status).toBe(0);
    expect((await runProject(folders, 'domain:remove', [key, 'site.ru'])).status).toBe(0);

    const accepted = await postJson(pro.formUrl(key), visitorForm, fromOrigin('https://other.ru'));
    const refused = await postJson(pro.formUrl(key), visitorForm, fromOrigin('https://site.ru'));
    expect(accepted.status).toBe(200);
    expect(refused.status).toBe(403);
  });

  it('refuses to remove the last domain with the field and the reason, and leaves the file as it was', async () => {
    const key = await createProject(folders, 'Acme', 'site.ru');
    const before = projectFile(folders, key);

    const run = await runProject(folders, 'domain:remove', [key, 'site.ru']);

    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain('project.domains');
    expect(run.stderr).toContain('at least one domain');
    expect(run.stderr).not.toContain('.tmp');
    expect(projectFile(folders, key)).toBe(before);
  });
});

describe('project:channel:add', () => {
  it('refuses a telegram channel without a chat id, names the field and leaves the file as it was', async () => {
    const key = await createProject(folders, 'Acme', 'site.ru');
    const before = projectFile(folders, key);

    const run = await runProject(folders, 'channel:add', [key, 'telegram', '--option', 'bot_token=123:ABC']);

    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain('chat_id');
    expect(run.stderr).toContain('telegram');
    expect(projectFile(folders, key)).toBe(before);
    expect(readdirTemp(folders)).toEqual([]);
  });

  it('adds a telegram channel with a bot token and a chat id', async () => {
    const key = await createProject(folders, 'Acme', 'site.ru');

    const run = await runProject(folders, 'channel:add', [key, 'telegram', '-o', 'bot_token=123:ABC', '-o', 'chat_id=-200']);

    expect(run.status).toBe(0);
    expect(run.stdout.trim()).toBe('Channel 2 added.');
    const shown = JSON.parse((await runProject(folders, 'show', [key])).stdout);
    expect(shown.channels[1]).toEqual({ type: 'telegram', options: { bot_token: '***', chat_id: '-200' } });
  });
});

describe('project:show', () => {
  it('masks the bot token', async () => {
    const key = await createProject(folders, 'Acme', 'site.ru', ['telegram', '-o', 'bot_token=123:SECRETVALUE', '-o', 'chat_id=-100']);

    const run = await runProject(folders, 'show', [key]);

    expect(run.status).toBe(0);
    expect(run.stdout).not.toContain('SECRETVALUE');
    const shown = JSON.parse(run.stdout);
    expect(shown.channels[0].options).toEqual({ bot_token: '***', chat_id: '-100' });
    expect(shown.project.domains).toEqual(['site.ru']);
  });

  it('lists every project with its name and domains', async () => {
    const first = await createProject(folders, 'Acme', 'site.ru');
    const second = await createProject(folders, 'Beta', 'beta.ru');

    const run = await runProject(folders, 'show');

    expect(run.stdout.trim().split('\n').sort()).toEqual([`${first}  Acme  site.ru`, `${second}  Beta  beta.ru`].sort());
  });
});

describe('project:set', () => {
  it('changes a limit, and refuses a wrong value with the field', async () => {
    const key = await createProject(folders, 'Acme', 'site.ru');

    expect((await runProject(folders, 'set', [key, 'limits.max_fields', '20'])).status).toBe(0);
    const shown = JSON.parse((await runProject(folders, 'show', [key])).stdout);
    expect(shown.limits).toEqual({ max_fields: 20 });

    const before = projectFile(folders, key);
    const refused = await runProject(folders, 'set', [key, 'limits.max_fields', 'soon']);
    expect(refused.status).not.toBe(0);
    expect(refused.stderr).toContain('limits.max_fields');
    expect(projectFile(folders, key)).toBe(before);
  });

  it('refuses project.retention_days: retention is global in Pro', async () => {
    const key = await createProject(folders, 'Acme', 'site.ru');
    const before = projectFile(folders, key);

    const run = await runProject(folders, 'set', [key, 'project.retention_days', '30']);

    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain('project.retention_days');
    expect(projectFile(folders, key)).toBe(before);
  });

  it('a change the Lite validator refuses names the project and the field, not the temporary file', async () => {
    const key = await createProject(folders, 'Acme', 'site.ru');
    const before = projectFile(folders, key);

    const run = await runProject(folders, 'set', [key, 'project.thank_you_url', '']);

    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain(`project ${key}`);
    expect(run.stderr).toContain('project.thank_you_url');
    expect(run.stderr).not.toContain('.tmp');
    expect(projectFile(folders, key)).toBe(before);
  });
});

describe('project:set for the meta_ limits', () => {
  it('limits.max_meta_fields 30: 30 meta_ fields pass and 31 get 413', async () => {
    const key = await createProject(folders, 'Acme', 'site.ru');
    expect((await runProject(folders, 'set', [key, 'limits.max_meta_fields', '30'])).status).toBe(0);

    const within = await postJson(pro.formUrl(key), { ...visitorForm, ...numberedFields('meta_f', 30) }, fromOrigin('https://site.ru'));
    const over = await postJson(pro.formUrl(key), { ...visitorForm, ...numberedFields('meta_f', 31) }, fromOrigin('https://site.ru'));

    expect(within.status).toBe(200);
    expect(over.status).toBe(413);
  });
});

describe('project:set for the time token', () => {
  const spamReasons = () => {
    const db = new DatabaseSync(join(folders.data, 'formgate.sqlite'), { readOnly: true });
    try {
      return db.prepare('SELECT reason FROM spam_log ORDER BY id').all().map((row) => String(row.reason));
    } finally {
      db.close();
    }
  };

  it('turns the check on: project:show shows it and a post without __token goes to the spam log as token_missing', async () => {
    const key = await createProject(folders, 'Acme', 'site.ru');

    expect((await runProject(folders, 'set', [key, 'project.require_token', 'true'])).status).toBe(0);

    expect(JSON.parse((await runProject(folders, 'show', [key])).stdout).project.require_token).toBe(true);
    await postJson(pro.formUrl(key), visitorForm, fromOrigin('https://site.ru'));
    expect(spamReasons()).toEqual(['token_missing']);
  });

  it.each([['on', true], ['1', true], ['off', false], ['0', false], ['false', false]])('takes %s as %s', async (word, expected) => {
    const key = await createProject(folders, 'Acme', 'site.ru');

    expect((await runProject(folders, 'set', [key, 'project.require_token', word])).status).toBe(0);

    expect(JSON.parse((await runProject(folders, 'show', [key])).stdout).project.require_token).toBe(expected);
  });

  it('refuses maybe naming true/false and leaves the file unchanged', async () => {
    const key = await createProject(folders, 'Acme', 'site.ru');
    const before = projectFile(folders, key);

    const run = await runProject(folders, 'set', [key, 'project.require_token', 'maybe']);

    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain('project.require_token');
    expect(run.stderr).toContain('true');
    expect(run.stderr).toContain('false');
    expect(projectFile(folders, key)).toBe(before);
  });

  it('sets the limits: the token request answers min_seconds 10; a min above the max is refused and the file stays', async () => {
    const key = await createProject(folders, 'Acme', 'site.ru');
    await runProject(folders, 'set', [key, 'project.require_token', 'true']);

    expect((await runProject(folders, 'set', [key, 'project.token_min_seconds', '10'])).status).toBe(0);
    expect((await runProject(folders, 'set', [key, 'project.token_max_seconds', '3600'])).status).toBe(0);

    const shown = JSON.parse((await runProject(folders, 'show', [key])).stdout);
    expect([shown.project.token_min_seconds, shown.project.token_max_seconds]).toEqual([10, 3600]);
    expect((await requestToken(pro.formUrl(key), 'https://site.ru')).body?.min_seconds).toBe(10);

    const before = projectFile(folders, key);
    const refused = await runProject(folders, 'set', [key, 'project.token_min_seconds', '4000']);
    expect(refused.status).not.toBe(0);
    expect(refused.stderr).toContain('token_min_seconds');
    expect(projectFile(folders, key)).toBe(before);
  });
});

describe('project:delete', () => {
  it('keeps the project when the answer is no; with --yes the project is gone and /f/<key> answers 404', async () => {
    const key = await createProject(folders, 'Acme', 'site.ru');

    const declined = await runProject(folders, 'delete', [key], 'no\n');
    expect(declined.status).toBe(0);
    expect(existsSync(join(folders.projects, `${key}.php`))).toBe(true);
    expect((await postJson(pro.formUrl(key), visitorForm)).status).toBe(200);

    const deleted = await runProject(folders, 'delete', [key, '--yes']);
    expect(deleted.status).toBe(0);
    expect(existsSync(join(folders.projects, `${key}.php`))).toBe(false);
    const answer = await postJson(pro.formUrl(key), visitorForm);
    expect(answer.status).toBe(404);
    expect(answer.body).toMatchObject({ ok: false, code: 'project_not_found' });
  });

  it('deletes when the answer is yes', async () => {
    const key = await createProject(folders, 'Acme', 'site.ru');

    await runProject(folders, 'delete', [key], 'y\n');

    expect(existsSync(join(folders.projects, `${key}.php`))).toBe(false);
  });
});

// The temporary files of the registry in the projects folder: a refused write leaves none.
function readdirTemp(folders: ProFolders): string[] {
  return readdirSync(folders.projects).filter((name) => name.endsWith('.tmp'));
}
