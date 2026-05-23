import { describe, it, expect, vi } from 'vitest';

// Listener imports `supabase` at module scope and starts a setInterval when
// `startFastmailListener()` is called. We only need the pure helpers, so stub
// the DB import to avoid pulling in a real client.
vi.mock('@platform/db', () => ({ supabase: {} }));

const { isExcluded, parseDisplayName } = await import('./fastmailListener.js');

describe('isExcluded', () => {
  // The caller (processEmail in fastmailListener.ts) always lowercases the
  // address before calling isExcluded, so we test the same precondition here.
  const rules = [
    { type: 'email', value: 'spam@example.com' },
    { type: 'domain', value: 'noisy.com' },
  ];

  it('matches a full email address against an email rule', () => {
    expect(isExcluded('spam@example.com', rules)).toBe(true);
  });

  it('matches by domain', () => {
    expect(isExcluded('anyone@noisy.com', rules)).toBe(true);
  });

  it('compares the rule.value lowercased against the (lowered) address', () => {
    const upperRules = [{ type: 'email', value: 'SPAM@example.com' }];
    expect(isExcluded('spam@example.com', upperRules)).toBe(true);
  });

  it('returns false for addresses that match no rule', () => {
    expect(isExcluded('alice@example.com', rules)).toBe(false);
  });

  it('returns false when the rule list is empty', () => {
    expect(isExcluded('anyone@anywhere.com', [])).toBe(false);
  });

  it('handles addresses without an @ gracefully', () => {
    expect(isExcluded('bareword', rules)).toBe(false);
  });
});

describe('parseDisplayName', () => {
  it('splits "First Last" into first/last', () => {
    expect(parseDisplayName('Alice Smith')).toEqual({ firstName: 'Alice', lastName: 'Smith' });
  });

  it('treats everything after the first space as last name', () => {
    expect(parseDisplayName('Alice Maud Smith')).toEqual({
      firstName: 'Alice',
      lastName: 'Maud Smith',
    });
  });

  it('returns just firstName when there is no space', () => {
    expect(parseDisplayName('Alice')).toEqual({ firstName: 'Alice', lastName: '' });
  });

  it('returns blanks when input is empty or whitespace', () => {
    expect(parseDisplayName('')).toEqual({ firstName: '', lastName: '' });
    expect(parseDisplayName('   ')).toEqual({ firstName: '', lastName: '' });
    expect(parseDisplayName(undefined)).toEqual({ firstName: '', lastName: '' });
  });

  it('trims surrounding whitespace', () => {
    expect(parseDisplayName('  Alice Smith  ')).toEqual({
      firstName: 'Alice',
      lastName: 'Smith',
    });
  });
});
