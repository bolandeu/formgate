// @vitest-environment happy-dom
// The built formgate.js, loaded into a page, behaves like the npm client: it binds forms with data-formgate.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { answer, postedFields, posts } from './support.ts';

const script = resolve(process.cwd(), 'scripts/build-client.mjs');
const tmp = mkdtempSync(join(tmpdir(), 'formgate-standalone-'));
let code = '';

beforeAll(() => {
  const outfile = join(tmp, 'formgate.js');
  execFileSync('node', [script, outfile]);
  code = readFileSync(outfile, 'utf8');
});
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

it('formgate.js binds a form with data-formgate on DOMContentLoaded: one JSON POST, formgate:success', async () => {
  document.body.innerHTML = `
    <form action="https://site.ru/formgate/submit.php" method="post" data-formgate>
      <input name="phone"><button type="submit">Send</button><p data-form-status></p>
    </form>
    <form action="https://site.ru/other"><input name="x"></form>`;
  const [form, plain] = Array.from(document.querySelectorAll('form'));
  form.querySelector<HTMLInputElement>('[name=phone]')!.value = '+7 900 111-22-33';
  const fetchStub = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
  vi.stubGlobal('fetch', fetchStub);
  const onSuccess = vi.fn();
  form.addEventListener('formgate:success', onSuccess);

  Object.defineProperty(document, 'readyState', { value: 'loading', configurable: true });
  (0, eval)(code);
  document.dispatchEvent(new Event('DOMContentLoaded'));
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  plain.dispatchEvent(new Event('submit', { cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(posts(fetchStub)).toHaveLength(1);
  const [url, init] = posts(fetchStub)[0] as [string, RequestInit];
  expect(url).toBe('https://site.ru/formgate/submit.php');
  expect(JSON.parse(init.body as string)).toEqual({ phone: '+7 900 111-22-33' });
  expect(onSuccess).toHaveBeenCalledTimes(1);
  vi.unstubAllGlobals();
});

it('formgate.js holds the post until min_seconds of the time token have passed, as bindForm does', async () => {
  vi.useFakeTimers();
  document.body.innerHTML = `<form action="https://site.ru/formgate/submit.php" data-formgate><input name="phone"><button type="submit">Send</button></form>`;
  const form = document.querySelector('form')!;
  form.querySelector<HTMLInputElement>('[name=phone]')!.value = '123';
  const fetchStub = vi.fn(async (_url: string, init?: RequestInit) =>
    init?.method === 'POST' ? answer(200, { ok: true }) : answer(200, { token: 'T', min_seconds: 5 }));
  vi.stubGlobal('fetch', fetchStub);

  Object.defineProperty(document, 'readyState', { value: 'complete', configurable: true });
  (0, eval)(code);
  await vi.advanceTimersByTimeAsync(2000);
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.advanceTimersByTimeAsync(2900);
  expect(posts(fetchStub)).toHaveLength(0);

  await vi.advanceTimersByTimeAsync(200);
  expect(posts(fetchStub)).toHaveLength(1);
  expect(postedFields(posts(fetchStub)[0])).toEqual({ phone: '123', __token: 'T' });
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
