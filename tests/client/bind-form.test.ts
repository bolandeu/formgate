// @vitest-environment happy-dom
// Behaviour of the npm client bindForm: request, button lock, success and error handling, idempotence.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bindForm } from '../../src/client/index.ts';
import { answer, gatewayWithoutToken, posts } from './support.ts';

const formHtml = (action: string) => `
  <form action="${action}" method="post" data-formgate>
    <input name="name">
    <input name="phone">
    <button type="submit">Send</button>
    <p data-form-status></p>
  </form>`;

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function pageWithForm() {
  document.body.innerHTML = formHtml('https://site.ru/formgate/submit.php');
  const form = document.querySelector('form')!;
  form.querySelector<HTMLInputElement>('[name=name]')!.value = 'Anna';
  form.querySelector<HTMLInputElement>('[name=phone]')!.value = '123';
  return form;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('bindForm: success', () => {
  it('posts JSON to the form action, locks the button until the answer, resets the form and fires formgate:success', async () => {
    const form = pageWithForm();
    const button = form.querySelector('button')!;
    let release!: (value: Response) => void;
    const fetchStub = vi.fn(() => new Promise<Response>((resolve) => (release = resolve)));
    const onSuccess = vi.fn();
    form.addEventListener('formgate:success', (event) => onSuccess((event as CustomEvent).detail));
    bindForm(form, { fetch: gatewayWithoutToken(fetchStub) });

    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(fetchStub).toHaveBeenCalledTimes(1);
    const [url, init] = fetchStub.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://site.ru/formgate/submit.php');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual({ name: 'Anna', phone: '123' });
    expect(button.disabled).toBe(true);

    release(answer(200, { ok: true }));
    await settle();

    expect(button.disabled).toBe(false);
    expect(form.querySelector<HTMLInputElement>('[name=name]')!.value).toBe('');
    expect(form.querySelector<HTMLElement>('[data-form-status]')!.dataset.state).toBe('success');
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith({ ok: true });
  });

  it('locks a button without a type attribute, so a double click sends one request', async () => {
    document.body.innerHTML = `<form action="https://site.ru/a" data-formgate><input name="phone"><button>Send</button></form>`;
    const form = document.querySelector('form')!;
    const fetchStub = vi.fn(() => new Promise<Response>(() => {}));
    bindForm(form, { fetch: fetchStub as unknown as typeof fetch });

    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(form.querySelector('button')!.disabled).toBe(true);
  });
});

describe('bindForm: errors', () => {
  it('marks the fields of errors, shows their texts and fires formgate:error with code, error and errors', async () => {
    const form = pageWithForm();
    const body = { ok: false, code: 'validation_failed', error: 'Проверьте поля формы.', errors: { phone: 'Неверный телефон' } };
    const onError = vi.fn();
    form.addEventListener('formgate:error', (event) => onError((event as CustomEvent).detail));
    bindForm(form, { fetch: (async () => answer(422, body)) as typeof fetch });

    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(form.querySelector('[name=phone]')!.getAttribute('aria-invalid')).toBe('true');
    expect(form.querySelector('[name=name]')!.hasAttribute('aria-invalid')).toBe(false);
    const status = form.querySelector<HTMLElement>('[data-form-status]')!;
    expect(status.textContent).toBe('Неверный телефон');
    expect(status.dataset.state).toBe('error');
    expect(onError).toHaveBeenCalledWith({ code: 'validation_failed', error: 'Проверьте поля формы.', errors: { phone: 'Неверный телефон' } });
  });

  it('shows the general error when the answer has no field errors', async () => {
    const form = pageWithForm();
    const body = { ok: false, code: 'delivery_failed', error: 'Не удалось отправить, попробуйте позже.' };
    bindForm(form, { fetch: gatewayWithoutToken(async () => answer(500, body)) });

    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(form.querySelector('[data-form-status]')!.textContent).toBe('Не удалось отправить, попробуйте позже.');
  });

  it('shows the fallback text and unlocks the button when fetch rejects and localStorage does not work', async () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } });
    const form = pageWithForm();
    bindForm(form, { fetch: gatewayWithoutToken(async () => Promise.reject(new TypeError('offline'))) });

    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(form.querySelector('[data-form-status]')!.textContent).toBe('Не удалось отправить заявку. Попробуйте позже.');
    expect(form.querySelector('button')!.disabled).toBe(false);
    vi.unstubAllGlobals();
  });

  it('clears aria-invalid of the previous attempt on the next submit', async () => {
    const form = pageWithForm();
    const answers = [answer(422, { ok: false, code: 'validation_failed', error: 'x', errors: { phone: 'bad' } }), answer(200, { ok: true })];
    bindForm(form, { fetch: (async () => answers.shift()!) as typeof fetch });

    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(form.querySelector('[aria-invalid]')).toBeNull();
  });

  it('replaces the error text of the previous attempt with the success text', async () => {
    const form = pageWithForm();
    const answers = [answer(422, { ok: false, code: 'validation_failed', error: 'x', errors: { phone: 'Неверный телефон' } }), answer(200, { ok: true })];
    bindForm(form, { fetch: (async () => answers.shift()!) as typeof fetch });

    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    const status = form.querySelector<HTMLElement>('[data-form-status]')!;
    expect(status.dataset.state).toBe('success');
    expect(status.textContent).toBe('Спасибо! Заявка отправлена.');
  });
});

describe('bindForm: binding', () => {
  it('sends one request when bindForm is called twice on one form', async () => {
    const form = pageWithForm();
    const fetchStub = vi.fn(async () => answer(200, { ok: true }));
    bindForm(form, { fetch: fetchStub as unknown as typeof fetch });
    bindForm(form, { fetch: fetchStub as unknown as typeof fetch });

    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(posts(fetchStub)).toHaveLength(1);
  });

  it('sends the request for the submitted form only, with two id-less forms on the page, one in a dialog', async () => {
    document.body.innerHTML = `${formHtml('https://site.ru/a')}<dialog>${formHtml('https://site.ru/b')}</dialog>`;
    const [page, dialog] = Array.from(document.querySelectorAll('form'));
    const fetchStub = vi.fn(async () => answer(200, { ok: true }));
    bindForm(page, { fetch: fetchStub as unknown as typeof fetch });
    bindForm(dialog, { fetch: fetchStub as unknown as typeof fetch });

    dialog.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(posts(fetchStub)).toHaveLength(1);
    expect(posts(fetchStub)[0][0]).toBe('https://site.ru/b');
    expect(page.querySelector('[data-form-status]')!.hasAttribute('data-state')).toBe(false);
  });
});

describe('bindForm: texts of the form', () => {
  const textsForm = (attributes: string) => {
    document.body.innerHTML = `<form action="https://site.ru/a" data-formgate ${attributes}><input name="phone"><button type="submit">Send</button><p data-form-status></p></form>`;
    return document.querySelector('form')!;
  };
  const status = (form: HTMLFormElement) => form.querySelector<HTMLElement>('[data-form-status]')!;

  it('shows data-formgate-success-text on success; without the attribute the current text stays', async () => {
    const custom = textsForm('data-formgate-success-text="Мы перезвоним"');
    bindForm(custom, { fetch: gatewayWithoutToken(async () => answer(200, { ok: true })) });
    custom.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    const plain = textsForm('');
    bindForm(plain, { fetch: gatewayWithoutToken(async () => answer(200, { ok: true })) });
    plain.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(status(custom).textContent).toBe('Мы перезвоним');
    expect(status(custom).dataset.state).toBe('success');
    expect(status(plain).textContent).toBe('Спасибо! Заявка отправлена.');
  });

  it('shows data-formgate-error-text after a network failure with the outbox off', async () => {
    const form = textsForm('data-formgate-error-text="Ошибка, позвоните" data-formgate-outbox="off"');
    bindForm(form, { fetch: gatewayWithoutToken(async () => Promise.reject(new TypeError('offline'))) });

    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(status(form).textContent).toBe('Ошибка, позвоните');
    expect(status(form).dataset.state).toBe('error');
  });

  it('shows data-formgate-error-text when the answer has no field errors and no error text', async () => {
    const form = textsForm('data-formgate-error-text="Ошибка, позвоните"');
    bindForm(form, { fetch: gatewayWithoutToken(async () => answer(500, { ok: false, code: 'delivery_failed' })) });

    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(status(form).textContent).toBe('Ошибка, позвоните');
  });

  it('keeps the field error text of the server and marks the field when the form has an error text', async () => {
    const form = textsForm('data-formgate-error-text="Ошибка, позвоните"');
    const body = { ok: false, code: 'validation_failed', error: 'Проверьте поля формы.', errors: { phone: 'Проверьте телефон: в номере должно быть от 10 до 15 цифр.' } };
    bindForm(form, { fetch: gatewayWithoutToken(async () => answer(422, body)) });

    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(status(form).textContent).toBe('Проверьте телефон: в номере должно быть от 10 до 15 цифр.');
    expect(form.querySelector('[name=phone]')!.getAttribute('aria-invalid')).toBe('true');
  });
});
