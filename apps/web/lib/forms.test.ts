import { describe, it, expect } from 'vitest';
import { z } from 'zod';

import { parseForm, buildUpdate } from './forms';

function formDataFrom(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.append(k, v);
  return fd;
}

describe('parseForm', () => {
  const schema = z.object({
    name: z.string().min(1, 'Name is required'),
    email: z.string().email('Invalid email').optional().or(z.literal('')),
  });

  it('returns parsed data on a valid submission', () => {
    const result = parseForm(schema, formDataFrom({ name: 'Satoshi', email: '' }));
    expect(result).toEqual({ ok: true, data: { name: 'Satoshi', email: '' } });
  });

  it('returns the first Zod issue message on an invalid submission', () => {
    const result = parseForm(schema, formDataFrom({ name: '' }));
    expect(result).toEqual({ ok: false, error: 'Name is required' });
  });

  it('falls back to a generic message when an issue carries none', () => {
    const bare = z.object({ n: z.number() }); // coercion-less: string is not a number
    const result = parseForm(bare, formDataFrom({ n: 'abc' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(typeof result.error).toBe('string');
  });
});

describe('buildUpdate', () => {
  it('includes only defined, non-empty fields', () => {
    expect(buildUpdate({ a: 'x', b: '', c: undefined, d: 0, e: false })).toEqual({
      a: 'x',
      d: 0,
      e: false,
    });
  });

  it('returns an empty object when nothing was submitted', () => {
    expect(buildUpdate({ a: undefined, b: '' })).toEqual({});
  });

  it('keeps falsy-but-meaningful values (0, false)', () => {
    expect(buildUpdate({ score: 0, active: false })).toEqual({ score: 0, active: false });
  });
});
