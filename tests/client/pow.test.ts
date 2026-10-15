// @vitest-environment happy-dom
// The ALTCHA proof-of-work in bindForm: invisible solving of the token challenge, waiting for it, and the widget mode.
import { verifySolution, createChallenge } from 'altcha-lib/v1';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bindForm } from '../../src/client/index.ts';
import { answer, postedFields, posts } from './support.ts';

const action = 'https://site.ru/formgate/submit.php';
const hmacKey = 'fake-gateway-key';

function pageWithForm(attributes = '') {
  document.body.innerHTML = `<form action="${action}" data-formgate ${attributes}><input name="phone"><button type="submit">Send</button><p data-form-status></p></form>`;
  const form = document.querySelector('form')!;
  form.querySelector<HTMLInputElement>('[name=phone]')!.value = '123';
  return form;
}

// A fake gateway: the token answer carries an ALTCHA challenge signed with `hmacKey`; the POST answers ok.
function gateway(options: { challenge: boolean; maxnumber?: number }) {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') return answer(200, { ok: true });
    const challenge = options.challenge ? await createChallenge({ hmacKey, maxnumber: options.maxnumber ?? 500 }) : undefined;
    return answer(200, { token: 'T', min_seconds: 0, challenge });
  });
}

const submit = (form: HTMLFormElement) => form.dispatchEvent(new Event('submit', { cancelable: true }));
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

describe('invisible proof-of-work', () => {
  it('sends __token and a __pow payload that the ALTCHA verifier accepts', async () => {
    const form = pageWithForm();
    const fetchStub = gateway({ challenge: true });
    bindForm(form, { fetch: fetchStub as unknown as typeof fetch });
    await settle();

    submit(form);
    await settle();

    const fields = postedFields(posts(fetchStub)[0]);
    expect(fields.__token).toBe('T');
    expect(Object.keys(JSON.parse(atob(fields.__pow))).sort()).toEqual(['algorithm', 'challenge', 'number', 'salt', 'signature']);
    expect(await verifySolution(fields.__pow, hmacKey)).toBe(true);
  });

  it('waits for the solution when the visitor sends before it is ready, and posts once', async () => {
    const form = pageWithForm();
    const fetchStub = gateway({ challenge: true, maxnumber: 300_000 });
    bindForm(form, { fetch: fetchStub as unknown as typeof fetch });

    submit(form);
    await vi.waitFor(() => expect(posts(fetchStub)).toHaveLength(1), { timeout: 20_000 });

    expect(await verifySolution(postedFields(posts(fetchStub)[0]).__pow, hmacKey)).toBe(true);
  });

  it('sends without __pow when the challenge cannot be solved', async () => {
    const form = pageWithForm();
    const fetchStub = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === 'POST'
        ? answer(200, { ok: true })
        : answer(200, { token: 'T', min_seconds: 0, challenge: { algorithm: 'SHA-256', challenge: 'x', salt: 's', signature: 'g', maxnumber: 10 } }));
    bindForm(form, { fetch: fetchStub as unknown as typeof fetch });
    await settle();

    submit(form);
    await settle();

    expect(postedFields(posts(fetchStub)[0])).toEqual({ phone: '123', __token: 'T' });
  });

  it('gets a new solution with every new token', async () => {
    const form = pageWithForm();
    const fetchStub = gateway({ challenge: true });
    bindForm(form, { fetch: fetchStub as unknown as typeof fetch });
    await settle();
    submit(form);
    await settle();
    submit(form);
    await settle();

    const payloads = posts(fetchStub).map((call) => postedFields(call).__pow);
    expect(payloads).toHaveLength(2);
    expect(payloads[0]).not.toBe(payloads[1]);
    expect(await verifySolution(payloads[1], hmacKey)).toBe(true);
  });
});

// A Web Worker for the DOM of the tests, which has none: it runs the worker script of the widget in this thread. The
// widget gives the script as a data: URL when its first URL (a blob: URL) fails.
class ScriptWorker extends EventTarget {
  private readonly scope: { onmessage?: (message: { data: unknown }) => void; postMessage(data: unknown): void };

  constructor(url: string) {
    super();
    const prefix = 'data:text/javascript;charset=utf-8,';
    if (!url.startsWith(prefix)) throw new Error('Only data: URL scripts');
    this.scope = { postMessage: (data) => this.dispatchEvent(Object.assign(new Event('message'), { data })) };
    new Function('self', decodeURIComponent(url.slice(prefix.length)))(this.scope);
  }

  postMessage(data: unknown) {
    setTimeout(() => this.scope.onmessage?.({ data }), 0);
  }

  terminate() {
    this.postMessage({ type: 'abort' });
  }
}

describe('ALTCHA widget', () => {
  const loadPowWidget = () => import('../../src/client/pow-widget.ts');

  beforeEach(() => {
    vi.useRealTimers();
    // The widget proves only in a secure context, with Web Workers.
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('Worker', ScriptWorker);
  });
  afterEach(() => vi.unstubAllGlobals());

  const buttons = {
    'a submit button in the form': '<button type="submit">Send</button>',
    'a submit button in a wrapper element': '<div class="actions"><button type="submit">Send</button></div>',
  };

  it.each(Object.entries(buttons))(
    'shows the widget before %s and sends its solution of the token challenge as __pow, with no tick',
    async (_, button) => {
      document.body.innerHTML = `<form action="${action}" data-formgate data-formgate-pow="widget"><input name="phone" value="123">${button}</form>`;
      const form = document.querySelector('form')!;
      const fetchStub = gateway({ challenge: true });
      bindForm(form, { fetch: fetchStub as unknown as typeof fetch });
      await vi.waitFor(() => expect(form.querySelector('altcha-widget')).not.toBeNull());

      expect(form.querySelector('altcha-widget')!.nextElementSibling).toBe(form.querySelector('button'));
      submit(form);
      await vi.waitFor(() => expect(posts(fetchStub)).toHaveLength(1), { timeout: 5000 });

      const fields = postedFields(posts(fetchStub)[0]);
      expect(fields.__token).toBe('T');
      expect(await verifySolution(fields.__pow, hmacKey)).toBe(true);
    },
  );

  it('adds no widget to a form without the attribute, and does not load the widget module', async () => {
    const form = pageWithForm();
    const loader = vi.fn(loadPowWidget);
    bindForm(form, { fetch: gateway({ challenge: true }) as unknown as typeof fetch, loadPowWidget: loader });
    await settle();

    expect(form.querySelector('altcha-widget')).toBeNull();
    expect(loader).not.toHaveBeenCalled();
  });

  it('sends as before, with no unhandled rejection, when the widget module fails to load and the token has no challenge', async () => {
    const rejections = vi.fn();
    process.on('unhandledRejection', rejections);
    const form = pageWithForm('data-formgate-pow="widget"');
    const fetchStub = gateway({ challenge: false });
    bindForm(form, { fetch: fetchStub as unknown as typeof fetch, loadPowWidget: () => Promise.reject(new Error('404')) });
    await settle();
    submit(form);
    await settle();
    process.off('unhandledRejection', rejections);

    expect(postedFields(posts(fetchStub)[0])).toEqual({ phone: '123', __token: 'T' });
    expect(rejections).not.toHaveBeenCalled();
  });
});
