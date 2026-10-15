// The exported field rules and checks give the same results as the server for the shared examples.
import { describe, expect, it } from 'vitest';
import { checkEmail, checkPhone, rules } from '../../src/client/index.ts';
import examples from '../fixtures/rules/field-examples.json' with { type: 'json' };

describe('rules', () => {
  it('exports the default limits and the phone digit range', () => {
    expect(rules).toEqual({
      phoneDigitsMin: 10,
      phoneDigitsMax: 15,
      maxValueLength: 10000,
      maxFields: 100,
      maxMetaFields: 50,
      maxMetaValueLength: 2000,
      maxBodyBytes: 102400,
    });
  });

  it.each(examples)('$rule "$value" is valid: $valid', ({ value, rule, valid }) => {
    const check = rule === 'phone' ? checkPhone : checkEmail;

    expect(check(value)).toBe(valid);
  });
});
