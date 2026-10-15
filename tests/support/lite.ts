// Test harness for Lite: copies Lite into a subfolder of a temp site, starts php -S on the site root with a given
// settings file, starts a fake HTTP channel server that records what it got, and posts requests (and asks for time
// tokens) the way a site form or the client does. The Pro harness takes the settings files, the fake channel and the
// posts from here.
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { type IncomingHttpHeaders, createServer as createHttpServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { solveChallenge } from 'altcha-lib/v1';
import { startPhpServer } from './php-server.ts';

const liteDir = fileURLToPath(new URL('../../lite/', import.meta.url));

export const projectOrigin = 'https://site.ru';

// A temp site the way an operator sets it up: <above>/<root>/formgate is the Lite folder.
export interface Site {
  above: string;
  root: string;
  liteDir: string;
  remove(): void;
}

export interface LiteOptions {
  env?: Record<string, string>;
  // A site made by createSite that outlives this Lite process; without it each start gets its own site.
  site?: Site;
}

export interface Lite {
  url: string;
  site: Site;
  errorLog(): string;
  stop(): void;
}

export interface RecordedCall {
  path: string;
  body: Record<string, unknown>;
}

export interface FakeChannel {
  url: string;
  calls: RecordedCall[];
  answerWith(status: number, body: unknown): void;
  stop(): Promise<void>;
}

export interface Answer {
  status: number;
  location: string | null;
  headers: Headers;
  body: Record<string, unknown> | null;
}

// Settings of a typical project: one domain, thank-you and error pages, one Telegram channel on the fake server.
// Tests repeat the same request many times, so the rate limit is high and the duplicate window is off;
// the spam tests set their own.
export function projectSettings(channel: FakeChannel) {
  return {
    project: {
      domains: ['site.ru'],
      thank_you_url: 'https://site.ru/thanks/',
      error_url: 'https://site.ru/error/',
      rate_limit: { requests: 1000, window_seconds: 600 },
      duplicate_window_seconds: 0,
    },
    channels: [telegramChannel(channel)],
  };
}

// A Telegram channel of the settings on the fake server, with the optional channel name that special cases can use.
export function telegramChannel(channel: FakeChannel, name?: string) {
  return {
    type: 'telegram',
    ...(name === undefined ? {} : { name }),
    options: { bot_token: 'TEST-TOKEN', chat_id: '-100', api_url: channel.url },
  };
}

// Makes a temp site with a copy of Lite: <temp>/home is above the site root, home/public_html is the site root.
export function createSite(): Site {
  const base = mkdtempSync(join(tmpdir(), 'formgate-site-'));
  const above = join(base, 'home');
  const root = join(above, 'public_html');
  const site = { above, root, liteDir: join(root, 'formgate') };
  mkdirSync(root, { recursive: true });
  cpSync(liteDir, site.liteDir, { recursive: true });
  return {
    ...site,
    remove: () => {
      chmodSync(above, 0o755);
      rmSync(base, { recursive: true, force: true });
    },
  };
}

// Writes a PHP settings file (Lite format) that returns the settings object.
export function writeSettingsFile(file: string, settings: object) {
  const json = JSON.stringify(settings);
  writeFileSync(file, `<?php return json_decode(<<<'JSON'\n${json}\nJSON, true, 512, JSON_THROW_ON_ERROR);\n`);
}

// Starts Lite. `settings` is an object written as a PHP settings file, the raw text of that file,
// or null: then FORMGATE_SETTINGS names a file that does not exist.
export async function startLite(
  settings: object | string | null,
  phpIni: Record<string, string> = {},
  options: LiteOptions = {},
): Promise<Lite> {
  const site = options.site ?? createSite();
  const dir = mkdtempSync(join(tmpdir(), 'formgate-lite-'));
  const settingsFile = join(dir, 'formgate.php');
  const errorLog = join(dir, 'error.log');
  if (typeof settings === 'string') writeFileSync(settingsFile, settings);
  else if (settings !== null) writeSettingsFile(settingsFile, settings);
  const server = await startPhpServer({
    ini: { log_errors: '1', display_errors: '0', error_log: errorLog, ...phpIni },
    serve: ['-t', site.root],
    env: { FORMGATE_SETTINGS: settingsFile, ...options.env },
    readyPath: '/formgate/submit.php',
  });
  return {
    url: `${server.origin}/formgate/submit.php`,
    site,
    errorLog: () => (existsSync(errorLog) ? readFileSync(errorLog, 'utf8') : ''),
    stop: () => {
      server.stop();
      rmSync(dir, { recursive: true, force: true });
      if (!options.site) site.remove();
    },
  };
}

// A local HTTP server in place of the Telegram Bot API: it records each JSON call and answers as told.
export async function startFakeChannel(): Promise<FakeChannel> {
  const calls: RecordedCall[] = [];
  let answer = { status: 200, body: { ok: true, result: {} } as unknown };
  const server = createHttpServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      calls.push({ path: req.url ?? '', body: JSON.parse(raw) });
      res.writeHead(answer.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(answer.body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as { port: number };
  return {
    url: `http://127.0.0.1:${port}`,
    calls,
    answerWith: (status, body) => (answer = { status, body }),
    stop: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

export interface ReceivedWebhook {
  method: string;
  path: string;
  headers: IncomingHttpHeaders;
  rawBody: string;
}

export interface WebhookReceiver {
  url: string;
  received: ReceivedWebhook[];
  // How the receiver answers next: a status, an optional Location header and an optional delay before the answer.
  answerWith(status: number, options?: { location?: string; delayMs?: number }): void;
  stop(): Promise<void>;
}

// A local HTTP server in place of a webhook receiver: it records the method, headers and raw body of each request
// and answers as told (204 until told otherwise).
export async function startWebhookReceiver(): Promise<WebhookReceiver> {
  const received: ReceivedWebhook[] = [];
  let answer: { status: number; location?: string; delayMs?: number } = { status: 204 };
  const server = createHttpServer((req, res) => {
    let rawBody = '';
    req.on('data', (chunk) => (rawBody += chunk));
    req.on('end', () => {
      received.push({ method: req.method ?? '', path: req.url ?? '', headers: req.headers, rawBody });
      setTimeout(() => {
        res.writeHead(answer.status, answer.location ? { Location: answer.location } : {});
        res.end();
      }, answer.delayMs ?? 0);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as { port: number };
  return {
    url: `http://127.0.0.1:${port}`,
    received,
    answerWith: (status, options = {}) => (answer = { status, ...options }),
    stop: () => {
      server.closeAllConnections();
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

// Sends a request to Lite without following redirects. It comes from the project domain unless the headers
// set another Origin; `withOrigin: false` sends no Origin header at all.
export async function send(url: string, init: RequestInit = {}, withOrigin = true): Promise<Answer> {
  const response = await fetch(url, {
    method: 'POST',
    redirect: 'manual',
    ...init,
    headers: { ...(withOrigin ? { Origin: projectOrigin } : {}), ...(init.headers as Record<string, string>) },
  });
  const text = await response.text();
  const isJson = response.headers.get('content-type')?.startsWith('application/json');
  return {
    status: response.status,
    location: response.headers.get('location'),
    headers: response.headers,
    body: isJson ? JSON.parse(text) : null,
  };
}

// Asks for a time token the way the client does: GET <form address>?token from the origin, the project domain unless
// another is given.
export function requestToken(url: string, origin = projectOrigin) {
  return send(`${url}?token`, { method: 'GET', headers: { Origin: origin } });
}

// The challenge object of GET ?token (the ALTCHA protocol, v1).
export interface Challenge {
  algorithm: string;
  challenge: string;
  maxnumber: number;
  salt: string;
  signature: string;
}

// The ALTCHA payload (`__pow`) of a challenge from GET ?token, solved the way the widget does.
export async function solvePow({ algorithm, challenge, maxnumber, salt, signature }: Challenge): Promise<string> {
  const solution = await solveChallenge(challenge, salt, algorithm, maxnumber).promise;
  if (!solution) throw new Error('the challenge has no solution');
  return Buffer.from(JSON.stringify({ algorithm, challenge, number: solution.number, salt, signature })).toString('base64');
}

// Posts fields as a plain HTML form (urlencoded); a field given as an array is sent as `name[]` values.
export function postForm(url: string, fields: Record<string, string | string[]>, headers: Record<string, string> = {}) {
  const body = new URLSearchParams();
  for (const [name, value] of Object.entries(fields)) {
    if (Array.isArray(value)) value.forEach((item) => body.append(`${name}[]`, item));
    else body.append(name, value);
  }
  return send(url, { body, headers });
}

// Posts fields as JSON, the way the formgate client does.
export function postJson(url: string, fields: Record<string, unknown>, headers: Record<string, string> = {}) {
  return send(url, { body: JSON.stringify(fields), headers: { 'Content-Type': 'application/json', ...headers } });
}

// Posts fields as a plain form that asks for a JSON answer (fetch with Accept: application/json).
export function postFormForJson(url: string, fields: Record<string, string | string[]>) {
  return postForm(url, fields, { Accept: 'application/json' });
}

// `count` fields named `<prefix>0`, `<prefix>1`, … with the value `x`: a form at a field count limit.
export function numberedFields(prefix: string, count: number): Record<string, string> {
  return Object.fromEntries(Array.from({ length: count }, (_, index) => [`${prefix}${index}`, 'x']));
}
