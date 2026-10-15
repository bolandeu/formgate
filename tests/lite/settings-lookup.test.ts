// Where Lite looks for the settings file: the order of the places, the site root counted from the site and not
// from the Lite folder, and what happens when no usable file is found.
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  type FakeChannel,
  type Lite,
  type Site,
  createSite,
  postForm,
  postFormForJson,
  startFakeChannel,
  startLite,
} from '../support/lite.ts';
import { readStored } from '../support/storage.ts';

const visitorForm = { name: 'Анна', phone: '+7 900 123-45-67', consent: '1' };
const noEnvironmentFile = { FORMGATE_SETTINGS: '' };

const retiredTool = ['site', 'gen'].join('');
// The names of an earlier settings adapter of another tool, which Lite no longer reads.
const retiredFile = [retiredTool, 'form.php'].join('-');
const retiredVariable = [retiredTool.toUpperCase(), 'FORM', 'SETTINGS'].join('_');

const running: Lite[] = [];
const sites: Site[] = [];
let telegram: FakeChannel;

beforeAll(async () => {
  telegram = await startFakeChannel();
});

afterAll(() => telegram.stop());

afterEach(() => {
  running.splice(0).forEach((lite) => lite.stop());
  sites.splice(0).forEach((site) => site.remove());
});

// A valid settings file whose thank-you page tells which file Lite took.
function settingsText(marker: string) {
  const settings = {
    project: { domains: ['site.ru'], thank_you_url: `https://site.ru/${marker}/`, error_url: 'https://site.ru/error/' },
    channels: [{ type: 'telegram', options: { bot_token: 'T', chat_id: '1', api_url: telegram.url } }],
  };
  return `<?php return json_decode(<<<'JSON'\n${JSON.stringify(settings)}\nJSON, true, 512, JSON_THROW_ON_ERROR);\n`;
}

function place(file: string, marker: string) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, settingsText(marker));
}

// The site lives in <home>/releases/r1, a deploy layout with a releases folder.
function createReleaseSite(): Site {
  const original = createSite();
  const releases = join(original.above, 'releases');
  const root = join(releases, 'r1');
  mkdirSync(releases);
  renameSync(original.root, root);
  return { above: releases, root, liteDir: join(root, 'formgate'), remove: original.remove };
}

// Starts Lite with no settings variable and tells which file it took by the thank-you page of a plain form.
async function takenFile(site: Site, env: Record<string, string> = {}) {
  sites.push(site);
  const lite = await startLite(null, {}, { site, env: { ...noEnvironmentFile, ...env } });
  running.push(lite);
  const answer = await postForm(lite.url, visitorForm);
  expect(answer.status).toBe(303);
  return answer.location;
}

// A step of the order: where its file goes (the later steps keep their files) and the marker it must win with.
type Step = { name: string; put: (site: Site, marker: string) => void };

const environmentStep = (variable: string): Step => ({
  name: variable,
  put: (site, marker) => place(join(site.above, `${variable}.php`), marker),
});

// `variables` are the environment variables of the steps; a variable is set only while its step is in play.
function runOrder(steps: Step[], createTestSite: () => Site, variables: string[] = []) {
  it.each(steps.map((step, index) => ({ ...step, index })))('takes $name when the earlier places are empty', async (step) => {
    const site = createTestSite();
    steps.slice(step.index).forEach((later, offset) => later.put(site, `step${step.index + offset}`));
    const env = Object.fromEntries(
      variables.filter((variable) => steps.findIndex((s) => s.name === variable) >= step.index)
        .map((variable) => [variable, join(site.above, `${variable}.php`)]),
    );

    expect(await takenFile(site, env)).toBe(`https://site.ru/step${step.index}/`);
  });
}

describe('the order of the places', () => {
  const steps: Step[] = [
    environmentStep('FORMGATE_SETTINGS'),
    { name: '<site root>/../formgate.php', put: (site, marker) => place(join(site.above, 'formgate.php'), marker) },
    { name: '<Lite folder>/formgate.php', put: (site, marker) => place(join(site.liteDir, 'formgate.php'), marker) },
  ];
  runOrder(steps, createSite, ['FORMGATE_SETTINGS']);
});

describe('the order of the places for a site in releases/<id>', () => {
  const steps: Step[] = [
    { name: 'releases/formgate.php', put: (site, marker) => place(join(site.above, 'formgate.php'), marker) },
    { name: '<home>/formgate.php', put: (site, marker) => place(join(dirname(site.above), 'formgate.php'), marker) },
    { name: '<Lite folder>/formgate.php', put: (site, marker) => place(join(site.liteDir, 'formgate.php'), marker) },
  ];
  runOrder(steps, createReleaseSite);
});

describe('the settings of the earlier adapter', () => {
  async function failedPost(site: Site, env: Record<string, string> = {}) {
    sites.push(site);
    const lite = await startLite(null, {}, { site, env: { ...noEnvironmentFile, ...env } });
    running.push(lite);
    return { answer: await postFormForJson(lite.url, visitorForm), lite };
  }

  it('a file in the old name above the site root is not found: server_error', async () => {
    const site = createSite();
    place(join(site.above, retiredFile), 'retired');

    const { answer, lite } = await failedPost(site);

    expect(answer.status).toBe(500);
    expect(answer.body).toMatchObject({ ok: false, code: 'server_error' });
    expect(lite.errorLog()).toContain('no settings file found');
  });

  it('the old variable is ignored: server_error when formgate.php is missing', async () => {
    const site = createSite();
    const file = join(site.above, 'valid.php');
    place(file, 'retired');

    const { answer } = await failedPost(site, { [retiredVariable]: file });

    expect(answer.status).toBe(500);
    expect(answer.body).toMatchObject({ ok: false, code: 'server_error' });
  });

  it('the old variable is ignored: formgate.php above the site root is taken', async () => {
    const site = createSite();
    const file = join(site.above, 'valid.php');
    place(file, 'retired');
    place(join(site.above, 'formgate.php'), 'above-the-site');

    expect(await takenFile(site, { [retiredVariable]: file })).toBe('https://site.ru/above-the-site/');
  });
});

describe('the site root', () => {
  it('counts above the site root, not above the Lite folder', async () => {
    const site = createSite();
    place(join(site.root, 'formgate.php'), 'above-the-lite-folder');
    place(join(site.above, 'formgate.php'), 'above-the-site');

    expect(await takenFile(site)).toBe('https://site.ru/above-the-site/');
  });
});

describe('no usable settings file', () => {
  async function failedRequest(prepare: (site: Site) => void) {
    const site = createSite();
    sites.push(site);
    prepare(site);
    const lite = await startLite(null, {}, { site, env: noEnvironmentFile });
    running.push(lite);
    const answer = await postFormForJson(lite.url, visitorForm);
    return { answer, lite, site };
  }

  it.each([
    ['is missing', () => {}, 'no settings file found'],
    [
      'has no domains',
      (site: Site) => writeFileSync(join(site.above, 'formgate.php'), '<?php return ["channels" => []];'),
      'has no valid project.domains',
    ],
    [
      'is not PHP code that runs',
      (site: Site) => writeFileSync(join(site.above, 'formgate.php'), '<?php return [;'),
      'syntax error',
    ],
  ])('a file that %s: server_error, the reason in error_log, the fields stored as failed', async (_name, prepare, reason) => {
    const { answer, lite, site } = await failedRequest(prepare);

    expect(answer.status).toBe(500);
    expect(answer.body).toMatchObject({ ok: false, code: 'server_error' });
    expect(lite.errorLog()).toContain(reason);
    const stored = readStored('sqlite', site).requests;
    expect(stored).toHaveLength(1);
    expect(stored[0].status).toBe('failed');
    expect(stored[0].fields).toEqual(visitorForm);
  });
});
