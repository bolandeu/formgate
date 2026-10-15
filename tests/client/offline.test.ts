// @vitest-environment happy-dom
// The offline outbox: a request that cannot reach the gateway is kept in localStorage and sent once, later.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { answer, postedFields, posts } from './support.ts';

const action = 'https://site.ru/formgate/submit.php';
const outboxKey = 'formgate:outbox';
const day = 24 * 60 * 60 * 1000;

let online = false;
const fetchStub = vi.fn(async (url: string, init?: RequestInit) => {
  if (init?.method !== 'POST') return answer(404, {});
  if (!online) throw new TypeError('offline');
  return answer(200, { ok: true });
});

function pageWithForm() {
  document.body.innerHTML = `<form action="${action}" data-formgate><input name="phone"><button type="submit">Send</button><p data-form-status></p></form>`;
  const form = document.querySelector('form')!;
  form.querySelector<HTMLInputElement>('[name=phone]')!.value = '123';
  return form;
}

const keptRequests = () => JSON.parse(localStorage.getItem(outboxKey) ?? '[]') as { action: string; fields: Record<string, string>; at: number }[];

// A fresh load of the client: the module state (the outbox started once per page) is new.
async function loadClient() {
  vi.resetModules();
  return import('../../src/client/index.ts');
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', fetchStub);
  localStorage.clear();
  fetchStub.mockClear();
  online = false;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('offline outbox', () => {
  it('keeps a request after a network error, fires queued_offline, and posts it once on the online event', async () => {
    const { bindForm } = await loadClient();
    const form = pageWithForm();
    const onError = vi.fn();
    form.addEventListener('formgate:error', (event) => onError((event as CustomEvent).detail));
    bindForm(form);

    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.advanceTimersByTimeAsync(10);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].code).toBe('queued_offline');
    expect(onError.mock.calls[0][0].error).toMatch(/отправлена повторно/);
    expect(keptRequests()).toMatchObject([{ action, fields: { phone: '123' } }]);

    online = true;
    window.dispatchEvent(new Event('online'));
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(10);

    const sent = posts(fetchStub).filter((call) => postedFields(call).phone === '123');
    expect(sent).toHaveLength(2); // the failed first try and the one resend
    expect(keptRequests()).toEqual([]);
  });

  it('posts a request kept from an earlier visit once on page load, not again on the next load', async () => {
    online = true;
    localStorage.setItem(outboxKey, JSON.stringify([{ id: 'a', action, fields: { phone: '777' }, at: Date.now() - 1000 }]));

    for (let load = 0; load < 2; load++) {
      const { bindForm } = await loadClient();
      bindForm(pageWithForm());
      await vi.advanceTimersByTimeAsync(10);
    }

    expect(posts(fetchStub)).toHaveLength(1);
    expect(postedFields(posts(fetchStub)[0])).toEqual({ phone: '777' });
    expect(keptRequests()).toEqual([]);
  });

  it('drops a kept request older than 7 days without sending it', async () => {
    online = true;
    localStorage.setItem(outboxKey, JSON.stringify([{ id: 'a', action, fields: { phone: '777' }, at: Date.now() - 8 * day }]));

    const { bindForm } = await loadClient();
    bindForm(pageWithForm());
    await vi.advanceTimersByTimeAsync(10);

    expect(posts(fetchStub)).toHaveLength(0);
    expect(keptRequests()).toEqual([]);
  });

  it('fires network_error as before when localStorage does not work', async () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => { throw new Error('denied'); } });
    const { bindForm } = await loadClient();
    const form = pageWithForm();
    const onError = vi.fn();
    form.addEventListener('formgate:error', (event) => onError((event as CustomEvent).detail));
    bindForm(form);

    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.advanceTimersByTimeAsync(10);

    expect(onError.mock.calls[0][0].code).toBe('network_error');
  });
});
