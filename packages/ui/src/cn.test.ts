import { describe, it, expect } from 'vitest';

import { cn } from './cn';

describe('cn', () => {
  it('joins truthy class names with a space', () => {
    expect(cn('a', 'b', 'c')).toBe('a b c');
  });

  it('drops falsy values', () => {
    expect(cn('a', false, undefined, null, 'b')).toBe('a b');
  });

  it('returns an empty string when everything is falsy', () => {
    expect(cn(false, null, undefined)).toBe('');
  });
});
