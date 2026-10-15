// @vitest-environment happy-dom
// The time token in bindForm: fetch at bind, wait for the lower limit, a new token after every send, retries, old gateways.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bindForm } from '../../src/client/index.ts';
import { answer, postedFields, posts } from './support.ts';

const action = 'https://site.ru/formgate/submit.php';

function pageWithForm() {
  document.body.innerHTML = `<form action="${action}" data-formgate><input name="phone"><button type="submit">Send</button><p data-form-status></p></form>`;
  const form = document.querySelector('form')!;
  form.querySelector<HTMLInputElement>('[name=phone]')!.value = '123';
  return form;
}

const tokenRequests = (fetchStub: ReturnType<typeof vi.fn>) =>
  fetchStub.mock.calls.filter(([url]) => String(url).endsWith('?token')).length;

// `tokens` answers the token requests in turn; the last answer repeats. The POST answers ok.
function gateway(tokens: (() => Response | Promise<Response>)[]) {
  let next = 0;
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') return answer(200, { ok: true });
    return tokens[Math.min(next++, tokens.length - 1)]();
  });
}

const submit = (form: HTMLFormElement) => form.dispatchEvent(new Event('submit', { cancelable: true }));

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('time token', () => {
  it('holds the post until min_seconds have passed since the token was taken, then sends __token', async () => {
    const form = pageWithForm();
    const fetchStub = gateway([() => answer(200, { token: 'T', min_seconds: 5 })]);
    bindForm(form, { fetch: fetchStub as unknown as typeof fetch });
    await vi.advanceTimersByTimeAsync(2000);

    submit(form);
    await vi.advanceTimersByTimeAsync(2900);
    expect(posts(fetchStub)).toHaveLength(0);
    expect(form.querySelector('button')!.disabled).toBe(true);

    await vi.advanceTimersByTimeAsync(200);
    expect(posts(fetchStub)).toHaveLength(1);
    expect(postedFields(posts(fetchStub)[0])).toEqual({ phone: '123', __token: 'T' });
  });

  it('takes a new token after a send, and the second post carries it', async () => {
    const form = pageWithForm();
    const fetchStub = gateway([() => answer(200, { token: 'T1', min_seconds: 0 }), () => answer(200, { token: 'T2', min_seconds: 0 })]);
    bindForm(form, { fetch: fetchStub as unknown as typeof fetch });
    await vi.advanceTimersByTimeAsync(10);

    submit(form);
    await vi.advanceTimersByTimeAsync(10);
    form.querySelector<HTMLInputElement>('[name=phone]')!.value = '456';
    submit(form);
    await vi.advanceTimersByTimeAsync(10);

    expect(posts(fetchStub).map((call) => postedFields(call).__token)).toEqual(['T1', 'T2']);
  });

  it('takes a new token after a send that failed with an error answer', async () => {
    const form = pageWithForm();
    const fetchStub = vi.fn(async (url: string, init?: RequestInit) =>
      init?.method === 'POST' ? answer(422, { ok: false, code: 'validation_failed', error: 'x' }) : answer(200, { token: 'T', min_seconds: 0 }));
    bindForm(form, { fetch: fetchStub as unknown as typeof fetch });
    await vi.advanceTimersByTimeAsync(10);

    submit(form);
    await vi.advanceTimersByTimeAsync(10);

    expect(tokenRequests(fetchStub)).toBe(2);
  });

  it('takes a new token before the post when the token is older than 1 h', async () => {
    const form = pageWithForm();
    const fetchStub = gateway([() => answer(200, { token: 'OLD', min_seconds: 0 }), () => answer(200, { token: 'NEW', min_seconds: 0 })]);
    bindForm(form, { fetch: fetchStub as unknown as typeof fetch });
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000 + 1000);

    submit(form);
    await vi.advanceTimersByTimeAsync(10);

    expect(postedFields(posts(fetchStub)[0]).__token).toBe('NEW');
  });

  it('takes a new token when the page comes back from the back-forward cache', async () => {
    const form = pageWithForm();
    const fetchStub = gateway([() => answer(200, { token: 'OLD', min_seconds: 0 }), () => answer(200, { token: 'NEW', min_seconds: 0 })]);
    bindForm(form, { fetch: fetchStub as unknown as typeof fetch });
    await vi.advanceTimersByTimeAsync(10);

    window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
    await vi.advanceTimersByTimeAsync(10);
    submit(form);
    await vi.advanceTimersByTimeAsync(10);

    expect(postedFields(posts(fetchStub)[0]).__token).toBe('NEW');
  });

  it('retries a failing token request for about 10 s, then posts with __token_unavailable and no __token', async () => {
    const form = pageWithForm();
    const fetchStub = gateway([() => Promise.reject(new TypeError('down'))]);
    bindForm(form, { fetch: fetchStub as unknown as typeof fetch });

    submit(form);
    await vi.advanceTimersByTimeAsync(5000);
    expect(posts(fetchStub)).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(6000);
    expect(posts(fetchStub)).toHaveLength(1);
    expect(postedFields(posts(fetchStub)[0])).toEqual({ phone: '123', __token_unavailable: '1' });
    expect(tokenRequests(fetchStub)).toBeGreaterThan(5);
  });

  it.each([
    ['404', () => answer(404, { ok: false })],
    ['a non-JSON answer', () => new Response('<html>', { status: 200 })],
  ])('posts at once without __token and without the marker when the token request gives %s', async (_name, tokenAnswer) => {
    const form = pageWithForm();
    const fetchStub = gateway([tokenAnswer]);
    bindForm(form, { fetch: fetchStub as unknown as typeof fetch });

    submit(form);
    await vi.advanceTimersByTimeAsync(10);

    expect(postedFields(posts(fetchStub)[0])).toEqual({ phone: '123' });
  });
});
