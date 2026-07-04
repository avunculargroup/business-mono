import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabaseClient } from '../../../test/mocks/supabase.js';
import type { AdapterResult } from '../onchain/types.js';

const fakeSupabase: FakeSupabaseClient = createFakeSupabase();
const deliverTeamEmail = vi.fn(async () => ({ configured: true, attempted: 2, sent: 2, failed: 0 }));
const loadCompanyFooter = vi.fn(async () => ({ name: 'Bitcoin Treasury Solutions' }));
const notFound: AdapterResult = { ok: false, error: { kind: 'not_found', message: 'unmocked' } };
const mempoolFetchLatest = vi.fn(async (): Promise<AdapterResult> => notFound);
const coingeckoFetchLatest = vi.fn(async (): Promise<AdapterResult> => notFound);
const alternativeMeFetchLatest = vi.fn(async (): Promise<AdapterResult> => notFound);

vi.mock('@platform/db', () => ({ get supabase() { return fakeSupabase; } }));
vi.mock('../sendNewsDigest.js', () => ({
  deliverTeamEmail: (...args: unknown[]) => deliverTeamEmail(...(args as [])),
  loadCompanyFooter: () => loadCompanyFooter(),
}));
vi.mock('../onchain/adapters/mempool.js', () => ({
  mempoolAdapter: { provider: 'mempool', fetchLatest: (...args: unknown[]) => mempoolFetchLatest(...(args as [])) },
}));
vi.mock('../onchain/adapters/coingecko.js', () => ({
  coingeckoAdapter: { provider: 'coingecko', fetchLatest: (...args: unknown[]) => coingeckoFetchLatest(...(args as [])) },
}));
vi.mock('../onchain/adapters/alternativeMe.js', () => ({
  alternativeMeAdapter: { provider: 'alternative_me', fetchLatest: (...args: unknown[]) => alternativeMeFetchLatest(...(args as [])) },
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
function setBitcoinIndicators(rows: unknown[]) {
  fakeSupabase.__setResponse('onchain_indicators', { data: rows, error: null });
}
function setBitcoinObservations(rows: unknown[]) {
  fakeSupabase.__setResponse('onchain_observations', { data: rows, error: null });
}

beforeEach(() => {
  fakeSupabase.__builders.length = 0;
  fakeSupabase.__responses.clear();
  deliverTeamEmail.mockClear();
  loadCompanyFooter.mockClear();
  mempoolFetchLatest.mockClear();
  coingeckoFetchLatest.mockClear();
  alternativeMeFetchLatest.mockClear();
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
    expect(res.bitcoin_count).toBe(0);
    expect(res.sections.find((s) => s.heading === 'Bitcoin')).toBeUndefined();
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

  describe('Bitcoin snapshot (live fetch)', () => {
    const BITCOIN_INDICATORS = [
      { id: 'ind-price', key: 'btc_price_aud', short_label: 'BTC/AUD', unit: 'aud', decimals: 2 },
      { id: 'ind-height', key: 'block_height', short_label: 'Block Height', unit: 'count', decimals: 0 },
      { id: 'ind-fng', key: 'fear_greed', short_label: 'Fear & Greed', unit: 'index', decimals: 0 },
    ];

    it('renders the live value with a delta against the last stored observation', async () => {
      setOnchain([]);
      setMacro([]);
      setBitcoinIndicators(BITCOIN_INDICATORS);
      setBitcoinObservations([
        { indicator_id: 'ind-price', observed_at: '2026-07-03', value: 140000 },
        { indicator_id: 'ind-height', observed_at: '2026-07-03', value: 912000 },
        { indicator_id: 'ind-fng', observed_at: '2026-07-03', value: 60 },
      ]);
      coingeckoFetchLatest.mockResolvedValueOnce({
        ok: true, observations: [{ observedAt: '2026-07-04', key: 'btc_price_aud', value: 142350, raw: {} }],
      });
      mempoolFetchLatest.mockResolvedValueOnce({
        ok: true, observations: [{ observedAt: '2026-07-04', key: 'block_height', value: 912144, raw: {} }],
      });
      alternativeMeFetchLatest.mockResolvedValueOnce({
        ok: true,
        observations: [{ observedAt: '2026-07-04', key: 'fear_greed', value: 72, raw: { classification: 'Greed' } }],
      });

      const out = await runMarketReport(ROUTINE, new Date('2026-07-04T11:00:00Z'));

      expect(out.status).toBe('success');
      const res = out.market_report_result!;
      expect(res.bitcoin_count).toBe(3);
      const bitcoin = res.sections.find((s) => s.heading === 'Bitcoin')!;
      expect(bitcoin.items[0]).toMatchObject({ label: 'BTC/AUD', value: '142,350.00 AUD', as_of: '2026-07-04' });
      expect(bitcoin.items[0].delta).toContain('▲');
      const height = bitcoin.items.find((i) => i.label === 'Block Height')!;
      expect(height.value).toBe('912,144');
      expect(height.delta).toContain('▲');
      const fng = bitcoin.items.find((i) => i.label === 'Fear & Greed')!;
      expect(fng.value).toBe('72');
      expect(fng.signal).toBe('Greed');
      expect(fng.delta).toContain('▲');
    });

    it('shows the live value with no delta on day one (no stored history yet)', async () => {
      setOnchain([]);
      setMacro([]);
      setBitcoinIndicators(BITCOIN_INDICATORS);
      setBitcoinObservations([]);
      coingeckoFetchLatest.mockResolvedValueOnce({
        ok: true, observations: [{ observedAt: '2026-07-04', key: 'btc_price_aud', value: 142350, raw: {} }],
      });
      mempoolFetchLatest.mockResolvedValueOnce({ ok: false, error: { kind: 'transport', message: 'boom' } });
      alternativeMeFetchLatest.mockResolvedValueOnce({ ok: false, error: { kind: 'transport', message: 'boom' } });

      const out = await runMarketReport(ROUTINE, new Date('2026-07-04T11:00:00Z'));

      const res = out.market_report_result!;
      // Block height + Fear & Greed have no live value AND no stored fallback yet.
      expect(res.bitcoin_count).toBe(1);
      const bitcoin = res.sections.find((s) => s.heading === 'Bitcoin')!;
      expect(bitcoin.items).toHaveLength(1);
      expect(bitcoin.items[0]).toMatchObject({ label: 'BTC/AUD', delta: null });
    });

    it('falls back to the last two stored observations when the live fetch fails', async () => {
      setOnchain([]);
      setMacro([]);
      setBitcoinIndicators([BITCOIN_INDICATORS[1]]); // block_height only
      setBitcoinObservations([
        { indicator_id: 'ind-height', observed_at: '2026-07-04', value: 912144 },
        { indicator_id: 'ind-height', observed_at: '2026-07-03', value: 912000 },
      ]);
      mempoolFetchLatest.mockResolvedValueOnce({ ok: false, error: { kind: 'transport', message: 'mempool down' } });

      const out = await runMarketReport(ROUTINE, new Date('2026-07-04T11:00:00Z'));

      const bitcoin = out.market_report_result!.sections.find((s) => s.heading === 'Bitcoin')!;
      expect(bitcoin.items[0]).toMatchObject({ value: '912,144', as_of: '2026-07-04' });
      expect(bitcoin.items[0].delta).toContain('▲');
    });
  });
});
