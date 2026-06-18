import { describe, expect, it } from 'vitest';
import { balanceChip, deriveCredits } from './OpenRouterCredits';

describe('deriveCredits', () => {
  it('computes remaining and fraction from a well-formed payload', () => {
    expect(deriveCredits({ data: { total_credits: 100, total_usage: 76.5 } })).toEqual({
      remaining: 23.5,
      total: 100,
      used: 76.5,
      fractionRemaining: 0.235,
    });
  });

  it('returns null fraction when total is zero (no basis for a percentage)', () => {
    const result = deriveCredits({ data: { total_credits: 0, total_usage: 0 } });
    expect(result?.fractionRemaining).toBeNull();
    expect(result?.remaining).toBe(0);
  });

  it('returns null on missing or malformed fields', () => {
    expect(deriveCredits({})).toBeNull();
    expect(deriveCredits({ data: { total_credits: 100 } })).toBeNull();
    expect(deriveCredits({ data: { total_credits: NaN, total_usage: 0 } })).toBeNull();
  });
});

describe('balanceChip', () => {
  it('shows success above 25% remaining', () => {
    expect(balanceChip(0.5)).toEqual({ label: '50% remaining', color: 'success' });
  });

  it('shows warning between 10% and 25%', () => {
    expect(balanceChip(0.2)).toEqual({ label: '20% remaining', color: 'warning' });
  });

  it('shows destructive below 10%', () => {
    expect(balanceChip(0.05)).toEqual({ label: '5% remaining', color: 'destructive' });
  });

  it('clamps negative balances to 0% and stays destructive', () => {
    expect(balanceChip(-0.2)).toEqual({ label: '0% remaining', color: 'destructive' });
  });

  it('returns null when there is no measurable fraction', () => {
    expect(balanceChip(null)).toBeNull();
  });
});
