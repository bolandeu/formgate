// Required fields from the settings over HTTP: the fields of the project and of the matched special case are always
// checked, and the __required of the form can only add to them.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  type FakeChannel,
  type Lite,
  postFormForJson,
  projectSettings,
  startFakeChannel,
  startLite,
} from '../../support/lite.ts';

let telegram: FakeChannel;
let lite: Lite;

beforeAll(async () => {
  telegram = await startFakeChannel();
  const settings = projectSettings(telegram);
  lite = await startLite({
    ...settings,
    project: { ...settings.project, required: ['phone'] },
    cases: [{ when: { form: 'vacancy' }, channels: [1], required: ['email'] }],
  });
});

afterAll(async () => {
  lite.stop();
  await telegram.stop();
});

afterEach(() => {
  telegram.calls.length = 0;
});

// The names of the fields that the answer says are wrong; none when the request is accepted.
function wrongFields(answer: Awaited<ReturnType<typeof postFormForJson>>) {
  return Object.keys((answer.body?.errors as Record<string, string> | undefined) ?? {});
}

describe('required fields from the settings', () => {
  it('checks the fields of the case even when the form names others in __required', async () => {
    const answer = await postFormForJson(lite.url, {
      __form: 'vacancy',
      __required: 'name',
      name: 'Анна',
      phone: '+7 900 123-45-67',
      consent: '1',
    });

    expect(answer.status).toBe(422);
    expect(answer.body).toMatchObject({ ok: false, code: 'validation_failed' });
    expect(wrongFields(answer)).toEqual(['email']);
    expect(telegram.calls).toHaveLength(0);
  });

  it('checks the fields of the project for a request of the default route', async () => {
    const answer = await postFormForJson(lite.url, { __form: 'callback', name: 'Анна', consent: '1' });

    expect(answer.status).toBe(422);
    expect(wrongFields(answer)).toEqual(['phone']);
  });

  it('adds the fields of __required to those of the settings', async () => {
    const answer = await postFormForJson(lite.url, {
      __form: 'callback',
      __required: 'name',
      phone: '+7 900 123-45-67',
      consent: '1',
    });

    expect(wrongFields(answer)).toEqual(['name']);
  });

  it('accepts a request that has every required field', async () => {
    const answer = await postFormForJson(lite.url, {
      __form: 'vacancy',
      name: 'Анна',
      phone: '+7 900 123-45-67',
      email: 'anna@site.ru',
      consent: '1',
    });

    expect(answer.body).toEqual({ ok: true });
    expect(telegram.calls).toHaveLength(1);
  });
});
