import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { formBoolean } from './formBoolean';

describe('formBoolean', () => {
  it('reads an explicit "false" as false', () => {
    // The regression this exists to prevent: z.coerce.boolean() is
    // Boolean(input), so Boolean('false') === true and the box never turns off.
    expect(z.coerce.boolean().parse('false')).toBe(true);
    expect(formBoolean(true).parse('false')).toBe(false);
    expect(formBoolean(false).parse('false')).toBe(false);
  });

  it('reads an explicit "true" as true', () => {
    expect(formBoolean(false).parse('true')).toBe(true);
    expect(formBoolean(true).parse('true')).toBe(true);
  });

  it('falls back when the field is omitted entirely', () => {
    expect(formBoolean(true).parse(undefined)).toBe(true);
    expect(formBoolean(false).parse(undefined)).toBe(false);
  });

  it('rejects anything that is not the two expected strings', () => {
    expect(formBoolean(false).safeParse('yes').success).toBe(false);
    expect(formBoolean(false).safeParse('').success).toBe(false);
    expect(formBoolean(false).safeParse('1').success).toBe(false);
  });
});
