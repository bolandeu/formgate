// The Formgate client: binds a site form to the gateway. It posts the form as JSON, locks the submit button
// while sending and shows the answer by the response contract of docs/integration.md section 8.
import { enqueue, startOutbox } from './outbox.ts';
import { createTokenSource } from './token.ts';
import { postJson } from './transport.ts';

const successText = 'Спасибо! Заявка отправлена.';
const fallbackText = 'Не удалось отправить заявку. Попробуйте позже.';
const queuedText = 'Нет связи. Заявка сохранена и будет отправлена повторно, когда связь появится.';
// A <button> without a type attribute submits the form too.
const submitButtons = 'button:not([type]), [type="submit"]';

export interface BindOptions {
  fetch?: typeof fetch;
}

interface GatewayAnswer {
  ok?: boolean;
  code?: string;
  error?: string;
  errors?: Record<string, string>;
}

const bound = new WeakSet<HTMLFormElement>();

// A field with many values (interests[]) goes as one comma-joined value, as the gateway expects.
function formFields(form: HTMLFormElement) {
  const fields: Record<string, string> = {};
  for (const [name, value] of new FormData(form)) {
    if (typeof value !== 'string') continue;
    fields[name] = name in fields ? `${fields[name]},${value}` : value;
  }
  return fields;
}

function markInvalid(form: HTMLFormElement, names: string[]) {
  for (const field of Array.from(form.elements)) {
    if (names.includes((field as HTMLInputElement).name)) field.setAttribute('aria-invalid', 'true');
  }
}

function showState(form: HTMLFormElement, state: 'success' | 'error', text: string) {
  const status = form.querySelector<HTMLElement>('[data-form-status]');
  if (!status) return;
  status.dataset.state = state;
  status.textContent = text;
}

function lockSubmit(form: HTMLFormElement, locked: boolean) {
  for (const button of Array.from(form.querySelectorAll<HTMLButtonElement | HTMLInputElement>(submitButtons))) {
    button.disabled = locked;
  }
}

function handleAnswer(form: HTMLFormElement, answer: GatewayAnswer) {
  if (answer.ok) {
    form.reset();
    showState(form, 'success', successText);
    form.dispatchEvent(new CustomEvent('formgate:success', { bubbles: true, detail: answer }));
    return;
  }
  const errors = answer.errors ?? {};
  markInvalid(form, Object.keys(errors));
  const text = Object.values(errors).join(' ') || answer.error || fallbackText;
  showState(form, 'error', text);
  const detail = { code: answer.code, error: answer.error, errors };
  form.dispatchEvent(new CustomEvent('formgate:error', { bubbles: true, detail }));
}

async function readAnswer(response: Response): Promise<GatewayAnswer> {
  try {
    return (await response.json()) as GatewayAnswer;
  } catch {
    return { ok: false, code: 'network_error', error: fallbackText };
  }
}

// The request did not reach the gateway: keep it for later, or report a plain network error.
function handleNoAnswer(form: HTMLFormElement, fields: Record<string, string>) {
  if (enqueue(form.action, fields)) {
    handleAnswer(form, { ok: false, code: 'queued_offline', error: queuedText });
  } else {
    handleAnswer(form, { ok: false, code: 'network_error', error: fallbackText });
  }
}

async function send(form: HTMLFormElement, source: ReturnType<typeof createTokenSource>, request: typeof fetch) {
  for (const field of Array.from(form.querySelectorAll('[aria-invalid]'))) field.removeAttribute('aria-invalid');
  lockSubmit(form, true);
  try {
    const fields = formFields(form);
    const response = await postJson(form.action, { ...fields, ...(await source.stamp()) }, request);
    if (response) handleAnswer(form, await readAnswer(response));
    else handleNoAnswer(form, fields);
  } finally {
    void source.refresh();
    lockSubmit(form, false);
  }
}

export function bindForm(form: HTMLFormElement, options: BindOptions = {}) {
  if (bound.has(form)) return;
  bound.add(form);
  const request: typeof fetch = (input, init) => (options.fetch ?? fetch)(input, init);
  const source = createTokenSource(form.action, request);
  void source.refresh();
  // A page restored from the back-forward cache holds an old token.
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) void source.refresh();
  });
  startOutbox(request);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void send(form, source, request);
  });
}

export function bindForms(root: ParentNode = document, options: BindOptions = {}) {
  for (const form of Array.from(root.querySelectorAll<HTMLFormElement>('form[data-formgate]'))) {
    bindForm(form, options);
  }
}
