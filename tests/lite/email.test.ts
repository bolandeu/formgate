// The email channel over HTTP: SMTP to a local sink, Reply-To from __replyto, and the method chain
// (a failed SMTP, then mail() through a sendmail capture script, then a second SMTP that must stay untried).
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { type FakeChannel, type Lite, postForm, projectSettings, startFakeChannel, startLite } from '../support/lite.ts';
import { type SmtpSink, parseMessage, startSmtpSink } from '../support/smtp-sink.ts';

const visitorForm = { name: 'Анна', phone: '+7 900 123-45-67', email: 'a@site.ru', consent: '1' };
const consentLine = /^Согласие на обработку ПД: дано \d{2}\.\d{2}\.\d{4} \d{2}:\d{2}$/;
const sendmailCapture = fileURLToPath(new URL('../support/sendmail-capture.php', import.meta.url));
const php = process.env.FORMGATE_PHP || 'php';

const smtpMethod = (port: number) => ({
  type: 'smtp',
  host: '127.0.0.1',
  port,
  encryption: 'none',
  login: 'robot',
  password: 'secret',
  from: 'forms@site.ru',
});

let sink: SmtpSink;
let spareSink: SmtpSink;
let closedPort: number;
let telegram: FakeChannel;
const running: Lite[] = [];
let captureDir: string;

async function liteWithEmail(methods: object[]) {
  captureDir = mkdtempSync(join(tmpdir(), 'formgate-mail-'));
  const settings = projectSettings(telegram);
  const lite = await startLite(
    { ...settings, channels: [{ type: 'email', options: { to: 'sales@site.ru', methods } }] },
    { sendmail_path: `${php} ${sendmailCapture} ${captureDir}` },
  );
  running.push(lite);
  return lite;
}

beforeAll(async () => {
  telegram = await startFakeChannel();
  sink = await startSmtpSink();
  spareSink = await startSmtpSink();
  const closed = await startSmtpSink();
  closedPort = closed.port;
  await closed.stop();
});

afterEach(() => {
  sink.messages.length = 0;
  spareSink.messages.length = 0;
  rmSync(captureDir, { recursive: true, force: true });
});

afterAll(async () => {
  running.forEach((lite) => lite.stop());
  await Promise.all([sink.stop(), spareSink.stop(), telegram.stop()]);
});

describe('email over SMTP', () => {
  it('delivers one message with the subject, Reply-To, every field and the consent line', async () => {
    const lite = await liteWithEmail([smtpMethod(sink.port)]);

    const answer = await postForm(lite.url, { ...visitorForm, __subject: 'Заявка с лендинга' });

    expect(answer.status).toBe(303);
    expect(sink.messages).toHaveLength(1);
    const message = sink.messages[0];
    expect(message.subject).toBe('Заявка с лендинга');
    expect(message.replyTo).toBe('a@site.ru');
    const lines = message.body.split('\n');
    expect(lines.slice(0, 4)).toEqual(['name: Анна', 'phone: +7 900 123-45-67', 'email: a@site.ru', 'consent: 1']);
    expect(lines[4]).toMatch(consentLine);
    expect(lines).toHaveLength(5);
  });

  it('takes Reply-To from the field named by __replyto', async () => {
    const lite = await liteWithEmail([smtpMethod(sink.port)]);

    await postForm(lite.url, { ...visitorForm, __replyto: 'contact_email', contact_email: 'b@site.ru' });

    expect(sink.messages).toHaveLength(1);
    expect(sink.messages[0].replyTo).toBe('b@site.ru');
  });

  it('marks the letter with the header X-Tags: formgate', async () => {
    const lite = await liteWithEmail([smtpMethod(sink.port)]);

    await postForm(lite.url, visitorForm);

    expect(sink.messages).toHaveLength(1);
    expect(sink.messages[0].headers['x-tags']).toBe('formgate');
  });
});

describe('the method chain', () => {
  it('goes on to mail() after a failed SMTP, and stops there when mail() accepts', async () => {
    const lite = await liteWithEmail([
      smtpMethod(closedPort),
      { type: 'mail', from: 'forms@site.ru' },
      smtpMethod(spareSink.port),
    ]);

    const answer = await postForm(lite.url, { ...visitorForm, __subject: 'Через mail()' });

    expect(answer.status).toBe(303);
    expect(answer.location).toBe('https://site.ru/thanks/');
    const files = readdirSync(captureDir);
    expect(files).toHaveLength(1);
    const letter = parseMessage(readFileSync(join(captureDir, files[0]), 'utf8'));
    expect(letter.body).toContain('name: Анна');
    expect(letter.headers['x-tags']).toBe('formgate');
    expect(spareSink.messages).toHaveLength(0);
  });
});
