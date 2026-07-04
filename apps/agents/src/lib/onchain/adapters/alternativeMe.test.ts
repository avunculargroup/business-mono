import { describe, it, expect } from 'vitest';
import { parseFearGreed } from './alternativeMe.js';

describe('parseFearGreed', () => {
  it('emits fear_greed with the classification carried in raw', () => {
    const res = parseFearGreed({ data: [{ value: '72', value_classification: 'Greed' }] });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.observations).toHaveLength(1);
    expect(res.observations[0]).toMatchObject({ key: 'fear_greed', value: 72 });
    expect(res.observations[0].raw).toMatchObject({ classification: 'Greed' });
    expect(res.observations[0].observedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('defaults classification to Unknown when absent', () => {
    const res = parseFearGreed({ data: [{ value: '50' }] });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.observations[0].raw).toMatchObject({ classification: 'Unknown' });
  });

  it('parse error when data[0].value is missing or non-numeric', () => {
    const res = parseFearGreed({ data: [] });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('parse');
  });
});
