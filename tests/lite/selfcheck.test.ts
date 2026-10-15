// The self-check over HTTP: a GET with the secret key shows the setup (the time token check included) and sends one
// test message per channel and per email method; a GET with a wrong or empty key gets 404 and shows nothing; a GET with no key parameter is not a
// self-check and gets 405 method_not_allowed, as any non-POST.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  type FakeChannel,
  type Lite,
  type Site,
  createSite,
  requestToken,
  startFakeChannel,
  startLite,
} from '../support/lite.ts';
import { type Backend, forceBackend, readStored } from '../support/storage.ts';
import { type SmtpSink, parseMessage, startSmtpSink } from '../support/smtp-sink.ts';

const key = 'self-check-secret';
const sendmailCapture = fileURLToPath(new URL('../support/sendmail-capture.php', import.meta.url));
const php = process.env.FORMGATE_PHP || 'php';
const phpVersion = execFileSync(php, ['-r', 'echo PHP_VERSION;'], { encoding: 'utf8' });

let telegram: FakeChannel;
let bitrix: FakeChannel;
let sink: SmtpSink;
let captureDir: string;
const running: Lite[] = [];
const sites: Site[] = [];

beforeAll(async () => {
  [telegram, bitrix] = await Promise.all([startFakeChannel(), startFakeChannel()]);
  sink = await startSmtpSink();
});

afterEach(() => {
  running.splice(0).forEach((lite) => lite.stop());
  sites.splice(0).forEach((site) => site.remove());
  for (const fake of [telegram, bitrix]) {
    fake.calls.length = 0;
    fake.answerWith(200, { ok: true, result: 1 });
  }
  sink.messages.length = 0;
  if (captureDir) rmSync(captureDir, { recursive: true, force: true });
});

afterAll(async () => {
  await Promise.all([telegram.stop(), bitrix.stop(), sink.stop()]);
});

function projectSettings() {
  return {
    project: { domains: ['site.ru'], thank_you_url: 'https://site.ru/thanks/', error_url: 'https://site.ru/error/' },
    selfcheck_key: key,
    channels: [
      { type: 'telegram', options: { bot_token: 'TEST-TOKEN', chat_id: '-100', api_url: telegram.url } },
      { type: 'bitrix24', options: { webhook_url: `${bitrix.url}/rest/1/KEY/`, map: {} } },
      {
        type: 'email',
        options: {
          to: 'sales@site.ru',
          methods: [
            { type: 'smtp', host: '127.0.0.1', port: sink.port, encryption: 'none', from: 'forms@site.ru' },
            { type: 'mail', from: 'forms@site.ru' },
          ],
        },
      },
    ],
  };
}

// Starts Lite with the settings file at the path that `where` gives for the site, and the storage backend forced.
async function startWith(settings: object, where: (site: Site) => string, backend: Backend = 'sqlite', env: Record<string, string> = {}) {
  captureDir = mkdtempSync(join(tmpdir(), 'formgate-mail-'));
  const site = createSite();
  sites.push(site);
  const json = JSON.stringify(settings);
  writeFileSync(where(site), `<?php return json_decode(<<<'JSON'\n${json}\nJSON, true, 512, JSON_THROW_ON_ERROR);\n`);
  const lite = await startLite(null, { sendmail_path: `${php} ${sendmailCapture} ${captureDir}` }, {
    site,
    env: { FORMGATE_SETTINGS: '', ...forceBackend(backend, site), ...env },
  });
  running.push(lite);
  return lite;
}

const aboveTheSite = (site: Site) => join(site.above, 'formgate.php');

interface Row {
  level: string;
  detail: string;
}

// The rows of the page, by label.
async function openSelfCheck(lite: Lite, query = `?key=${key}`) {
  const response = await fetch(lite.url + query);
  const html = await response.text();
  const window = new Window();
  window.document.body.innerHTML = html.replace(/^.*<body>|<\/body>.*$/gs, '');
  const rows = new Map<string, Row>();
  for (const row of window.document.querySelectorAll('tr')) {
    rows.set(row.querySelector('th')!.textContent, {
      level: row.querySelectorAll('td')[0].textContent,
      detail: row.querySelectorAll('td')[1].textContent,
    });
  }
  return { response, html, rows };
}

describe('with the right key', () => {
  it('shows PHP, the HTTP client, mbstring, pdo_sqlite, the settings path and the storage', async () => {
    const lite = await startWith(projectSettings(), aboveTheSite);

    const { response, rows } = await openSelfCheck(lite);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(rows.get('PHP version')).toEqual({ level: 'ok', detail: phpVersion });
    expect(rows.get('HTTP client')?.level).toBe('ok');
    expect(rows.get('HTTP client')?.detail).toMatch(/^(curl|allow_url_fopen)/);
    expect(rows.get('mbstring')).toEqual({ level: 'ok', detail: 'loaded' });
    expect(rows.get('pdo_sqlite')).toEqual({ level: 'ok', detail: 'loaded' });
    expect(rows.get('Settings file')).toEqual({ level: 'ok', detail: realpathSync(aboveTheSite(lite.site)) });
    expect(rows.get('Storage')).toEqual({ level: 'ok', detail: 'sqlite' });
  });

  it('shows the time token check on, the signing key present and the limits, and not the key', async () => {
    const settings = projectSettings();
    const lite = await startWith({ ...settings, project: { ...settings.project, require_token: true } }, aboveTheSite);
    await requestToken(lite.url);

    const { html, rows } = await openSelfCheck(lite);

    expect(rows.get('Time token')).toEqual({
      level: 'ok',
      detail: 'check on, signing key present, token age from 5 s to 7200 s',
    });
    const keyFile = readFileSync(join(lite.site.above, 'formgate-token-key.jsonl'), 'utf8');
    const secret = String(JSON.parse(keyFile).secret);
    expect(secret).not.toBe('');
    expect(html).not.toContain(secret);
  });

  it('warns when the time token check is on and no token request has made the signing key yet', async () => {
    const settings = projectSettings();
    const lite = await startWith({ ...settings, project: { ...settings.project, require_token: true } }, aboveTheSite);

    const { rows } = await openSelfCheck(lite);

    expect(rows.get('Time token')).toEqual({
      level: 'warning',
      detail: 'check on, signing key missing (the first token request makes it), token age from 5 s to 7200 s',
    });
  });

  it('warns when the settings file is inside the web root', async () => {
    const lite = await startWith(projectSettings(), (site) => join(site.liteDir, 'formgate.php'));

    const { rows } = await openSelfCheck(lite);

    expect(rows.get('Settings file')?.level).toBe('warning');
    expect(rows.get('Settings file')?.detail).toContain(join(realpathSync(lite.site.liteDir), 'formgate.php'));
  });

  it.each([
    ['sqlite', 'sqlite'],
    ['jsonl', 'jsonl'],
    ['guarded', 'guarded jsonl'],
  ] satisfies [Backend, string][])('names the %s storage', async (backend, kind) => {
    const lite = await startWith(projectSettings(), aboveTheSite, backend);

    const { rows } = await openSelfCheck(lite);

    expect(rows.get('Storage')?.detail).toBe(kind);
  });

  it('sends one test message to each channel and to each email method, and stores nothing', async () => {
    const lite = await startWith(projectSettings(), aboveTheSite);

    const { rows } = await openSelfCheck(lite);

    const smtpLabel = `email #3, SMTP 127.0.0.1:${sink.port}`;
    for (const label of ['telegram #1', 'bitrix24 #2', smtpLabel, 'email #3, mail()']) {
      expect(rows.get(label)?.level, label).toBe('ok');
    }
    expect(telegram.calls).toHaveLength(1);
    expect(String(telegram.calls[0].body.text)).toContain('This message is a test');
    expect(bitrix.calls).toHaveLength(1);
    expect((bitrix.calls[0].body.fields as Record<string, string>).TITLE).toBe('TEST: Formgate self-check');
    expect(sink.messages).toHaveLength(1);
    expect(sink.messages[0].subject).toBe('TEST: Formgate self-check');
    const letters = readdirSync(captureDir);
    expect(letters).toHaveLength(1);
    expect(parseMessage(readFileSync(join(captureDir, letters[0]), 'utf8')).subject).toBe('TEST: Formgate self-check');
    expect(readStored('sqlite', lite.site).requests).toEqual([]);
  });

  it('shows a failed channel as fail with the reason, and the page keeps the secrets out', async () => {
    telegram.answerWith(500, { ok: false });
    const lite = await startWith(projectSettings(), aboveTheSite);

    const { html, rows } = await openSelfCheck(lite);

    expect(rows.get('telegram #1')?.level).toBe('fail');
    expect(rows.get('telegram #1')?.detail).toContain('HTTP 500');
    expect(rows.get('bitrix24 #2')?.level).toBe('ok');
    expect(html).not.toContain(key);
    expect(html).not.toContain('TEST-TOKEN');
  });
});

describe('a settings file in the old shape (transport and telegram.token, no project.domains, no channels)', () => {
  it('is invalid: the reason in error_log and a POST gets server_error, nothing is sent to Telegram', async () => {
    const lite = await startWith({ transport: 'telegram', telegram: { token: 'T', chat_id: '1', api_url: telegram.url } }, aboveTheSite);

    const response = await fetch(lite.url, { method: 'POST', headers: { Accept: 'application/json' }, body: new URLSearchParams({ name: 'Анна', consent: '1' }) });

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ ok: false, code: 'server_error' });
    expect(lite.errorLog()).toMatch(/has no valid project\.domains.*channels/);
    expect(telegram.calls).toHaveLength(0);
  });
});

describe('without the right key', () => {
  it('no key parameter: 405 method_not_allowed, no setup data and no test send', async () => {
    const lite = await startWith(projectSettings(), aboveTheSite);

    const { response, html } = await openSelfCheck(lite, '');

    expect(response.status).toBe(405);
    expect(JSON.parse(html)).toEqual({
      ok: false,
      code: 'method_not_allowed',
      error: 'Заявка принимается только методом POST.',
    });
    expect(telegram.calls).toHaveLength(0);
  });

  it.each([
    ['a wrong key', '?key=wrong'],
    ['an empty key', '?key='],
    ['a list as the key', '?key[]=x'],
  ])('%s: 404 with an empty body and no test send', async (_name, query) => {
    const lite = await startWith(projectSettings(), aboveTheSite);

    const { response, html } = await openSelfCheck(lite, query);

    expect(response.status).toBe(404);
    expect(html).toBe('');
    expect(telegram.calls).toHaveLength(0);
  });

  it('a settings file without selfcheck_key turns the self-check off: even an empty key gets 404', async () => {
    const { selfcheck_key: _off, ...settings } = projectSettings();
    const lite = await startWith(settings, aboveTheSite);

    const { response, html } = await openSelfCheck(lite, '?key=');

    expect(response.status).toBe(404);
    expect(html).toBe('');
  });
});

describe('as JSON (Accept: application/json)', () => {
  const asJson = (lite: Lite, query = `?key=${key}`) =>
    fetch(lite.url + query, { headers: { Accept: 'application/json' } });

  it('gives the setup without secrets and sends no test message', async () => {
    const lite = await startWith(projectSettings(), aboveTheSite);

    const response = await asJson(lite);
    const text = await response.text();
    const body = JSON.parse(text);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(body.settings).toEqual({ found: true, where: 'above_site_root' });
    expect(body.domains).toEqual(['site.ru']);
    expect(body.channels).toEqual([
      { number: 1, type: 'telegram', name: null, configured: true },
      { number: 2, type: 'bitrix24', name: null, configured: true },
      { number: 3, type: 'email', name: null, configured: true },
    ]);
    expect(body.storage).toEqual({ backend: 'sqlite', writable: true });
    expect(body.token).toEqual({ required: false, key_present: false, min_seconds: 5, max_seconds: 7200 });
    expect(body.test_delivery).toBe(false);
    expect(body.findings).toContainEqual({ label: 'Storage', level: 'ok', detail: 'sqlite' });
    expect(text).not.toContain('TEST-TOKEN');
    expect(text).not.toContain(key);
    expect(telegram.calls).toHaveLength(0);
    expect(bitrix.calls).toHaveLength(0);
    expect(sink.messages).toHaveLength(0);
  });

  it('marks a channel without a required option as not configured', async () => {
    const settings = projectSettings();
    settings.channels[0].options.chat_id = '';
    const lite = await startWith(settings, aboveTheSite);

    const body = await (await asJson(lite)).json();

    expect(body.channels[0]).toEqual({ number: 1, type: 'telegram', name: null, configured: false });
  });

  it.each([
    ['a wrong key', '?key=wrong'],
    ['an empty key', '?key='],
  ])('%s: 404 with an empty body', async (_name, query) => {
    const lite = await startWith(projectSettings(), aboveTheSite);

    const response = await asJson(lite, query);

    expect(response.status).toBe(404);
    expect(await response.text()).toBe('');
  });

  it('without a key parameter it is still 405', async () => {
    const lite = await startWith(projectSettings(), aboveTheSite);

    expect((await asJson(lite, '')).status).toBe(405);
  });
});

describe('with test delivery on', () => {
  it('warns in the HTML page and in the JSON', async () => {
    const lite = await startWith(projectSettings(), aboveTheSite, 'sqlite', {
      FORMGATE_TEST_DELIVERY_FILE: join(tmpdir(), 'formgate-never-written.jsonl'),
    });

    const { rows } = await openSelfCheck(lite);
    const body = await (await fetch(lite.url + `?key=${key}`, { headers: { Accept: 'application/json' } })).json();

    expect(rows.get('Test delivery')?.level).toBe('warning');
    expect(body.test_delivery).toBe(true);
    expect(body.findings).toContainEqual(expect.objectContaining({ label: 'Test delivery', level: 'warning' }));
  });
});
