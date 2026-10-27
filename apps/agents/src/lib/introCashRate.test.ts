import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createFakeSupabase, type FakeSupabaseClient } from '../../test/mocks/supabase.js';

const fakeSupabase: FakeSupabaseClient = createFakeSupabase();
vi.mock('@platform/db', () => ({ get supabase() { return fakeSupabase; } }));

const { checkIntroCashRate, extractCashRateFigures, loadStoredCashRate } = await import('./introCashRate.js');

describe('extractCashRateFigures', () => {
  it.each([
    ['The RBA raised the cash rate to 4.60% and US yields rose.', [4.6]],
    ['The cash rate of 4.35 per cent held.', [4.35]],
    ['Markets now price a 4.85% cash rate by March.', [4.85]],
    ['The RBA lifted the cash-rate target to 4.6%.', [4.6]],
  ])('reads %j', (text, expected) => {
    expect(extractCashRateFigures(text)).toEqual(expected);
  });

  it('ignores percentages that are not the cash rate', () => {
    expect(extractCashRateFigures('Sydney clearance fell to 24.6% while CPI ran at 3.2%.')).toEqual([]);
    expect(extractCashRateFigures('The cash rate held. Inflation hit 3.8%.')).toEqual([]);
  });
});

describe('checkIntroCashRate', () => {
  it('passes a figure that matches the stored rate', () => {
    expect(checkIntroCashRate('The cash rate sits at 4.60%.', 4.6)).toEqual({ status: 'ok' });
  });

  it('flags a figure that disagrees with the stored rate', () => {
    expect(checkIntroCashRate('The RBA raised the cash rate to 4.85%.', 4.6)).toEqual({
      status: 'mismatch',
      stated: [4.85],
      stored: 4.6,
    });
  });

  it('is a no-op when the intro states no cash rate', () => {
    expect(checkIntroCashRate('Strive bought 6,182 bitcoin.', 4.6)).toEqual({ status: 'no_figure' });
  });

  it('does not block when no stored value exists', () => {
    expect(checkIntroCashRate('The cash rate is 4.60%.', null)).toEqual({ status: 'no_stored_value' });
  });
});

describe('loadStoredCashRate', () => {
  beforeEach(() => fakeSupabase.__responses.clear());

  it('reads the AU policy rate from v_indicator_latest', async () => {
    fakeSupabase.__setResponse('v_indicator_latest', { data: { current_value: '4.6000' }, error: null });
    expect(await loadStoredCashRate()).toBe(4.6);
    expect(fakeSupabase.from).toHaveBeenCalledWith('v_indicator_latest');
  });

  it('returns null when the series is missing or errors', async () => {
    fakeSupabase.__setResponse('v_indicator_latest', { data: null, error: null });
    expect(await loadStoredCashRate()).toBeNull();
    fakeSupabase.__setResponse('v_indicator_latest', { data: null, error: { message: 'boom' } });
    expect(await loadStoredCashRate()).toBeNull();
  });
});
