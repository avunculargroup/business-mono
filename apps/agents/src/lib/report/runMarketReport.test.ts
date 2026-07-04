import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabaseClient } from '../../../test/mocks/supabase.js';

const fakeSupabase: FakeSupabaseClient = createFakeSupabase();
const deliverTeamEmail = vi.fn(async () => ({ configured: true, attempted: 2, sent: 2, failed: 0 }));
const loadCompanyFooter = vi.fn(async () => ({ name: 'Bitcoin Treasury Solutions' }));

vi.mock('@platform/db', () => ({ get supabase() { return fakeSupabase; } }));
vi.mock('../sendNewsDigest.js', () => ({
  deliverTeamEmail: (...args: unknown[]) => deliverTeamEmail(...(args as [])),
  loadCompanyFooter: () => loadCompanyFooter(),
}));

const { runMarketReport } = await import('./runMarketReport.js');

const ROUTINE = {
  id: 'r1',
  name: 'Daily market report',
  action_type: 'market_report',
  action_config: {},
  frequency: 'daily',
  time_of_day: '09:00',
  timezone: 'Australia/Melbourne',
};

function setOnchain(rows: unknown[]) {
  fakeSupabase.__setResponse('v_onchain_dashboard', { data: rows, error: null });
}
function setMacro(rows: unknown[]) {
  fakeSupabase.__setResponse('v_indicator_latest', { data: rows, error: null });
}

beforeEach(() => {
  fakeSupabase.__builders.length = 0;
  fakeSupabase.__responses.clear();
  deliverTeamEmail.mockClear();
  loadCompanyFooter.mockClear();
});

describe('runMarketReport', () => {
  it('assembles ordered on-chain + macro sections and emails them', async () => {
    setOnchain([
      { key: 'mvrv', short_label: 'MVRV', metric_group: 'behaviour_valuation', unit: 'ratio', decimals: 2,
        value: 2.1, observed_at: '2026-07-03', change_since_prior: 0.05, pct_change_since_prior: 2.44, signal: null },
      { key: 'hash_ribbons', short_label: 'Hash Ribbons', metric_group: 'network_security', unit: 'signal', decimals: 2,
        value: 3.2, observed_at: '2026-07-03', change_since_prior: null, pct_change_since_prior: null, signal: 'neutral' },
    ]);
    setMacro([
      { short_label: 'US 10Y', unit: 'percent', decimals: 2, current_value: 3.85, period_date: '2026-07-02',
        change_since_prior: -0.03, pct_change_since_prior: -0.77 },
    ]);

    const out = await runMarketReport(ROUTINE, new Date('2026-07-03T22:00:00Z'));

    expect(out.status).toBe('success');
    const res = out.market_report_result!;
    expect(res.onchain_count).toBe(2);
    expect(res.macro_count).toBe(1);
    expect(res.emailed).toBe(true);
    // Network security is ordered before holder-behaviour metrics.
    const onchain = res.sections.find((s) => s.heading === 'On-chain')!;
    expect(onchain.items[0].label).toBe('Hash Ribbons');
    expect(onchain.items[0].signal).toBe('neutral');
    expect(onchain.items[1].label).toBe('MVRV');
    expect(onchain.items[1].delta).toContain('▲');
    // Macro renders with unit + a down delta.
    const macro = res.sections.find((s) => s.heading === 'Macro')!;
    expect(macro.items[0].value).toBe('3.85 %');
    expect(macro.items[0].delta).toContain('▼');
    // Delivered via the shared transport.
    expect(deliverTeamEmail).toHaveBeenCalledTimes(1);
    const [ref, message] = deliverTeamEmail.mock.calls[0] as unknown as [unknown, { subject: string }];
    expect(ref).toMatchObject({ id: 'r1' });
    expect(message.subject).toMatch(/^Market Report — /);
  });

  it('skips the email when there is no indicator data yet', async () => {
    setOnchain([]);
    setMacro([]);

    const out = await runMarketReport(ROUTINE, new Date('2026-07-03T22:00:00Z'));

    expect(out.status).toBe('success');
    expect(out.market_report_result).toMatchObject({ onchain_count: 0, macro_count: 0, emailed: false });
    expect(deliverTeamEmail).not.toHaveBeenCalled();
  });

  it('fails only when BOTH views error', async () => {
    setOnchain([]);
    fakeSupabase.__setResponse('v_onchain_dashboard', { data: null, error: { message: 'onchain down' } });
    fakeSupabase.__setResponse('v_indicator_latest', { data: null, error: { message: 'macro down' } });

    const out = await runMarketReport(ROUTINE, new Date('2026-07-03T22:00:00Z'));

    expect(out.status).toBe('failed');
    expect(out.error).toContain('onchain down');
    expect(deliverTeamEmail).not.toHaveBeenCalled();
  });

  it('emailed is false when delivery reaches nobody', async () => {
    setOnchain([
      { key: 'hash_rate', short_label: 'Hash Rate', metric_group: 'network_security', unit: 'eh_s', decimals: 2,
        value: 900, observed_at: '2026-07-03', change_since_prior: 10, pct_change_since_prior: 1.1, signal: null },
    ]);
    setMacro([]);
    deliverTeamEmail.mockResolvedValueOnce({ configured: false, attempted: 0, sent: 0, failed: 0 });

    const out = await runMarketReport(ROUTINE, new Date('2026-07-03T22:00:00Z'));

    expect(out.market_report_result?.emailed).toBe(false);
    expect(out.result?.summary).toContain('email not configured');
  });
});
