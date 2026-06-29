import { describe, it, expect } from 'vitest';
import { humanizeError, actionError } from './errors';

describe('humanizeError', () => {
  it('maps unique violations', () => {
    expect(humanizeError({ code: '23505', message: 'duplicate key value violates unique constraint' })).toMatch(
      /already exists/i,
    );
  });

  it('maps foreign-key violations to a remove-links message', () => {
    expect(humanizeError({ code: '23503', message: 'violates foreign key constraint' })).toMatch(/still linked/i);
  });

  it('maps not-null violations', () => {
    expect(humanizeError({ code: '23502', message: 'null value in column' })).toMatch(/required field/i);
  });

  it('maps RLS / privilege errors to a permission message', () => {
    expect(humanizeError({ code: '42501', message: 'permission denied' })).toMatch(/permission/i);
    expect(humanizeError({ message: 'new row violates row-level security policy' })).toMatch(/permission/i);
  });

  it('maps no-rows (PGRST116) to a not-found message', () => {
    expect(humanizeError({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' })).toMatch(
      /couldn't find/i,
    );
  });

  it('recognises connectivity failures regardless of shape', () => {
    expect(humanizeError(new TypeError('fetch failed'))).toMatch(/couldn't reach the server/i);
    expect(humanizeError({ code: 'ECONNREFUSED', message: 'connect ECONNREFUSED' })).toMatch(/couldn't reach the server/i);
  });

  it('maps invalid login credentials', () => {
    expect(humanizeError({ message: 'Invalid login credentials' })).toMatch(/doesn't match/i);
  });

  it('never leaks the raw message for unrecognised errors', () => {
    const raw = 'duplicate key value violates unique constraint "companies_pkey"';
    const out = humanizeError({ message: raw });
    expect(out).not.toContain('constraint');
    expect(out).toMatch(/something went wrong/i);
  });

  it('honours a custom fallback for unrecognised errors', () => {
    expect(humanizeError({ message: 'weird internal thing' }, 'Could not save the deck.')).toBe(
      'Could not save the deck.',
    );
  });

  it('accepts plain strings', () => {
    expect(humanizeError('Username and token are required')).toBe(
      "Something went wrong on our end and the change didn't go through. Please try again.",
    );
  });
});

describe('actionError', () => {
  it('wraps a humane message in the action error shape', () => {
    expect(actionError({ code: '23505', message: 'dupe' })).toEqual({
      error: 'Something with these details already exists. Try a different value.',
    });
  });
});
