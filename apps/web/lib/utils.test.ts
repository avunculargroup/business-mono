import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

import { cn, getInitials, formatDate, formatRelativeDate } from './utils';

describe('getInitials', () => {
  it('takes the first letter of the first two words, uppercased', () => {
    expect(getInitials('Satoshi Nakamoto')).toBe('SN');
  });

  it('returns a single initial for a one-word name', () => {
    expect(getInitials('Hal')).toBe('H');
  });

  it('caps at two initials for longer names', () => {
    expect(getInitials('Adam Back Finney')).toBe('AB');
  });

  it('ignores extra whitespace between words', () => {
    expect(getInitials('Nick  Szabo')).toBe('NS');
  });

  it('returns an empty string for an empty name', () => {
    expect(getInitials('')).toBe('');
  });
});

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

describe('formatDate', () => {
  it('formats an ISO date in the Melbourne timezone', () => {
    // 2026-01-15T00:00:00Z is still Jan 15 in Melbourne (UTC+11 in summer).
    expect(formatDate('2026-01-15T00:00:00Z')).toBe('15 Jan 2026');
  });

  it('respects an explicit timezone', () => {
    // Just before UTC midnight is still the 14th in New York.
    expect(formatDate('2026-01-15T03:00:00Z', 'America/New_York')).toBe('14 Jan 2026');
  });
});

describe('formatRelativeDate', () => {
  // Pin "now" so calendar-day math is deterministic. Melbourne is UTC+11 in
  // mid-June... no: June is winter (UTC+10). Pick a clear mid-day instant.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-16T02:00:00Z')); // noon Melbourne (UTC+10)
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('labels the same calendar day as Today', () => {
    expect(formatRelativeDate('2026-06-16T08:00:00Z')).toBe('Today');
  });

  it('labels the previous calendar day as Yesterday', () => {
    expect(formatRelativeDate('2026-06-15T02:00:00Z')).toBe('Yesterday');
  });

  it('labels the next calendar day as Tomorrow', () => {
    expect(formatRelativeDate('2026-06-17T02:00:00Z')).toBe('Tomorrow');
  });

  it('uses Nd ago within the past week', () => {
    expect(formatRelativeDate('2026-06-13T02:00:00Z')).toBe('3d ago');
  });

  it('uses In Nd within the coming week', () => {
    expect(formatRelativeDate('2026-06-19T02:00:00Z')).toBe('In 3d');
  });

  it('uses weeks for older-than-a-week dates', () => {
    expect(formatRelativeDate('2026-06-01T02:00:00Z')).toBe('2w ago');
  });
});
