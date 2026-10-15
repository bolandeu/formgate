// The Pro CLI for special cases: add, list, move and remove a case, the guard that keeps a channel used by a case, and
// the route in `failed` and `spam:list`. The effect is checked with posts to /f/<key>, `worker --once` and fake channels.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type FakeChannel, postJson, startFakeChannel } from '../../support/lite.ts';
import { at, createDeliveryFolders, runCommand } from '../../support/pro-delivery.ts';
import { createProject, projectFile, runProject } from '../../support/pro-projects.ts';
import { type Pro, type ProFolders, runWorkerOnce, startPro } from '../../support/pro.ts';

const fromSite = { Origin: 'https://site.ru' };
const vacancyForm = { __form: 'vacancy', name: 'Анна', email: 'anna@site.ru', consent: '1' };
const callbackForm = { __form: 'callback', name: 'Борис', phone: '+7 900 123-45-67', consent: '1' };

let first: FakeChannel;
let second: FakeChannel;
let folders: ProFolders;
let pro: Pro;
let key: string;

const namesSentTo = (channel: FakeChannel) => channel.calls.map((call) => String(call.body.text).split('\n')[0]);
const caseList = async () => (await runProject(folders, 'case:list', [key])).stdout.split('\n').filter(Boolean);

const telegramOn = (channel: FakeChannel) => ['telegram', '-o', 'bot_token=123:ABC', '-o', 'chat_id=-100', '-o', `api_url=${channel.url}`];

beforeEach(async () => {
  first = await startFakeChannel();
  second = await startFakeChannel();
  folders = createDeliveryFolders('1');
  folders.env.FORMGATE_TOKEN_SECRET = 'test-token-secret-of-pro';
  pro = await startPro(folders, { FORMGATE_TEST_NOW: at(0) });
  key = await createProject(folders, 'Acme', 'site.ru', telegramOn(first));
  await runProject(folders, 'channel:add', [key, ...telegramOn(second)]);
});

afterEach(async () => {
  pro.stop();
  folders.remove();
  await first.stop();
  await second.stop();
});

describe('project:case:add and project:case:list', () => {
  it('lists the case, and a posted vacancy goes only to channel 2', async () => {
    const add = await runProject(folders, 'case:add', [key, '--name', 'vacancies', '--form', 'vacancy', '--channel', '2']);
    const list = await runProject(folders, 'case:list', [key]);
    await postJson(pro.formUrl(key), vacancyForm, fromSite);
    await postJson(pro.formUrl(key), callbackForm, fromSite);
    await runWorkerOnce(folders, at(0));

    expect(add.status).toBe(0);
    expect(list.stdout.trim()).toBe('#1 vacancies | form=vacancy | channels 2 | required -');
    expect(namesSentTo(first)).toEqual(['name: Борис']);
    expect(namesSentTo(second)).toEqual(['name: Анна', 'name: Борис']);
  });

  it('shows a field condition, a channel name and the required fields', async () => {
    await runProject(folders, 'case:add', [key, '--field', 'topic', '--equals', 'job', '--channel', '1', '--required', 'email', '--required', 'phone']);

    const list = await runProject(folders, 'case:list', [key]);

    expect(list.stdout.trim()).toBe('#1 | field topic=job | channels 1 | required email, phone');
  });

  it('refuses channel 7 of 2 channels naming it, and leaves the file byte for byte', async () => {
    const before = projectFile(folders, key);

    const run = await runProject(folders, 'case:add', [key, '--name', 'vacancies', '--form', 'vacancy', '--channel', '7']);

    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain('channel 7');
    expect(projectFile(folders, key)).toBe(before);
  });

  it('refuses a case with no condition and leaves the file as it was', async () => {
    const before = projectFile(folders, key);

    const run = await runProject(folders, 'case:add', [key, '--channel', '1']);

    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain('when');
    expect(projectFile(folders, key)).toBe(before);
  });

  it('says there is no case for a project without cases', async () => {
    const list = await runProject(folders, 'case:list', [key]);

    expect(list.status).toBe(0);
    expect(list.stdout.trim()).toBe('The project has no special case.');
  });
});

describe('project:case:move and project:case:remove', () => {
  beforeEach(async () => {
    await runProject(folders, 'case:add', [key, '--name', 'A', '--form', 'vacancy', '--channel', '1']);
    await runProject(folders, 'case:add', [key, '--name', 'B', '--form', 'vacancy', '--channel', '2']);
  });

  it('moves B to place 1, and a request that matches both takes B', async () => {
    const move = await runProject(folders, 'case:move', [key, '2', '1']);
    await postJson(pro.formUrl(key), vacancyForm, fromSite);
    await runWorkerOnce(folders, at(0));

    expect(move.status).toBe(0);
    expect(await caseList()).toEqual(['#1 B | form=vacancy | channels 2 | required -', '#2 A | form=vacancy | channels 1 | required -']);
    expect(namesSentTo(first)).toEqual([]);
    expect(namesSentTo(second)).toEqual(['name: Анна']);
  });

  it('refuses a place outside the list and leaves the file as it was', async () => {
    const before = projectFile(folders, key);

    const run = await runProject(folders, 'case:move', [key, '1', '3']);

    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain('place 3');
    expect(projectFile(folders, key)).toBe(before);
  });

  it('removes a case, and the next case takes its number', async () => {
    const run = await runProject(folders, 'case:remove', [key, '1']);

    expect(run.status).toBe(0);
    expect(await caseList()).toEqual(['#1 B | form=vacancy | channels 2 | required -']);
  });

  it('refuses a number that is no case and leaves the file as it was', async () => {
    const before = projectFile(folders, key);

    const run = await runProject(folders, 'case:remove', [key, '5']);

    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain('no case number 5');
    expect(projectFile(folders, key)).toBe(before);
  });
});

describe('project:channel:remove with a case', () => {
  it('refuses to remove channel 2 used by the case, naming the case, and changes nothing', async () => {
    await runProject(folders, 'case:add', [key, '--name', 'vacancies', '--form', 'vacancy', '--channel', '2']);
    const before = projectFile(folders, key);

    const run = await runProject(folders, 'channel:remove', [key, '2']);

    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain('case #1 vacancies');
    expect(projectFile(folders, key)).toBe(before);
  });

  it('refuses to remove channel 1 while a case names channel 2 of 3 by number, naming the case, and changes nothing', async () => {
    await runProject(folders, 'channel:add', [key, ...telegramOn(first)]);
    await runProject(folders, 'case:add', [key, '--name', 'vacancies', '--form', 'vacancy', '--channel', '2']);
    const before = projectFile(folders, key);

    const run = await runProject(folders, 'channel:remove', [key, '1']);

    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain('case #1 vacancies');
    expect(projectFile(folders, key)).toBe(before);
  });

  it('removes a channel that no case uses', async () => {
    await runProject(folders, 'case:add', [key, '--name', 'vacancies', '--form', 'vacancy', '--channel', '1']);

    const run = await runProject(folders, 'channel:remove', [key, '2']);

    expect(run.status).toBe(0);
  });
});

describe('project:set project.required', () => {
  it('takes a comma list, and a request without the field gets a validation error', async () => {
    const set = await runProject(folders, 'set', [key, 'project.required', 'email, phone']);
    const answer = await postJson(pro.formUrl(key), { __form: 'callback', name: 'Борис', consent: '1' }, fromSite);

    expect(set.status).toBe(0);
    expect(answer.status).toBe(422);
  });
});

describe('the route in failed and spam:list', () => {
  it('shows case #1 vacancies in failed for a request routed by the case', async () => {
    second.answerWith(500, { ok: false, description: 'Internal Server Error' });
    await runProject(folders, 'case:add', [key, '--name', 'vacancies', '--form', 'vacancy', '--channel', '2']);
    await postJson(pro.formUrl(key), vacancyForm, fromSite);
    await postJson(pro.formUrl(key), callbackForm, fromSite);
    await runWorkerOnce(folders, at(0));
    await runWorkerOnce(folders, at(1));

    const list = await runCommand(folders, ['failed'], at(2));

    expect(list.stdout.split('\n').filter(Boolean)[0]).toBe(`#1 project ${key} received ${at(0)} route case #1 vacancies`);
  });

  it('shows the route of a default request in failed', async () => {
    second.answerWith(500, { ok: false, description: 'Internal Server Error' });
    await postJson(pro.formUrl(key), callbackForm, fromSite);
    await runWorkerOnce(folders, at(0));
    await runWorkerOnce(folders, at(1));

    const list = await runCommand(folders, ['failed'], at(2));

    expect(list.stdout.split('\n').filter(Boolean)[0]).toBe(`#1 project ${key} received ${at(0)} route default`);
  });

  it('shows the route a spam log entry takes by the settings now', async () => {
    await runProject(folders, 'set', [key, 'project.require_token', 'true']);
    await runProject(folders, 'case:add', [key, '--name', 'vacancies', '--form', 'vacancy', '--channel', '2']);
    await postJson(pro.formUrl(key), vacancyForm, fromSite);

    const list = await runCommand(folders, ['spam:list'], at(1));

    expect(list.stdout.split('\n')[0]).toBe(`#1 project ${key} received ${at(0)} reason token_missing route case #1 vacancies`);
  });

  it('shows route unknown for an entry of a project whose file does not load, and lists the other entries', async () => {
    await runProject(folders, 'set', [key, 'project.require_token', 'true']);
    const other = await createProject(folders, 'Beta', 'beta.ru', telegramOn(first));
    await runProject(folders, 'set', [other, 'project.require_token', 'true']);
    await postJson(pro.formUrl(key), vacancyForm, fromSite);
    await postJson(pro.formUrl(other), vacancyForm, { Origin: 'https://beta.ru' });
    writeFileSync(join(folders.projects, `${key}.php`), '<?php return 1;');

    const list = await runCommand(folders, ['spam:list'], at(1));

    expect(list.status).toBe(0);
    expect(list.stdout.split('\n').filter((line) => line.startsWith('#'))).toEqual([
      `#1 project ${key} received ${at(0)} reason token_missing route unknown`,
      `#2 project ${other} received ${at(0)} reason token_missing route default`,
    ]);
  });
});
