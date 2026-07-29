import { describe, it, expect } from 'vitest';
import { parseGoldApiResponse } from './goldApi.js';

describe('parseGoldApiResponse', () => {
  it('parses a numeric price field, stamping periodDate to the fetch day', () => {
    const now = new Date('2026-07-29T08:00:00Z');
    const res = parseGoldApiResponse('{"price": 3382.25, "currency": "USD"}', now);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.observations).toHaveLength(1);
    const [obs] = res.observations;
    expect(obs.value).toBe(3382.25);
    expect(obs.periodDate).toBe('2026-07-29');
    expect(obs.releasedAt).toBeNull();
    expect(obs.raw).toMatchObject({ price: 3382.25 });
  });

  it('fails (not a silent no-op) on non-JSON body, e.g. a bot-check HTML page', () => {
    const res = parseGoldApiResponse('<!DOCTYPE html><html>verify your browser</html>');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('parse');
    expect(res.error.message).toContain('non-JSON response');
  });

  it('fails when the response has no price field', () => {
    const res = parseGoldApiResponse('{"metal": "XAU", "currency": "USD"}');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('parse');
    expect(res.error.message).toContain('unexpected response shape');
  });

  it('fails on a non-numeric price rather than emitting NaN', () => {
    const res = parseGoldApiResponse('{"price": "n/a"}');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('parse');
    expect(res.error.message).toContain('non-numeric price');
  });
});
