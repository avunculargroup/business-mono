import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabaseClient } from '../../../test/mocks/supabase.js';
import type { AdapterResult } from '../onchain/types.js';

const fakeSupabase: FakeSupabaseClient = createFakeSupabase();
const deliverTeamEmail = vi.fn(async () => ({ configured: true, attempted: 2, sent: 2, failed: 0 }));
const loadCompanyFooter = vi.fn(async () => ({ name: 'Bitcoin Treasury Solutions' }));
type FindingsNarrationResult = {
  narration: string | null;
  status: 'published' | 'held' | 'error' | null;
  reportId: string | null;
  reportMode: 'normal' | 'quiet' | null;
  findingsTotal: number;
  findingsSelected: number;
  staleMetrics: string[];
};
const PUBLISHED_NARRATION: FindingsNarrationResult = {
  narration: 'Momentum is building across the network.',
  status: 'published',
  reportId: 'mr-1',
  reportMode: 'normal',
  findingsTotal: 5,
  findingsSelected: 2,
  staleMetrics: [],
};
const generateFindingsNarration = vi.fn(async (): Promise<FindingsNarrationResult> => PUBLISHED_NARRATION);
const markReportEmailed = vi.fn(async () => {});
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
vi.mock('../findings/index.js', () => ({
  generateFindingsNarration: (...args: unknown[]) => generateFindingsNarration(...(args as [])),
  markReportEmailed: (...args: unknown[]) => markReportEmailed(...(args as [])),
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
  generateFindingsNarration.mockClear();
  generateFindingsNarration.mockResolvedValue(PUBLISHED_NARRATION);
  markReportEmailed.mockClear();
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
    const [ref, message] = deliverTeamEmail.mock.calls[0] as unknown as [unknown, { subject: string; text: string }];
    expect(ref).toMatchObject({ id: 'r1' });
    expect(message.subject).toMatch(/^Market Report — /);
    // The findings narration is threaded into both the result and the email,
    // the disclaimer always renders, and the published report is flagged emailed.
    expect(generateFindingsNarration).toHaveBeenCalledWith(expect.any(Date));
    expect(res.narration).toBe('Momentum is building across the network.');
    expect(res.narration_status).toBe('published');
    expect(res.report_id).toBe('mr-1');
    expect(message.text).toContain('Momentum is building across the network.');
    expect(message.text).toContain('not financial advice');
    expect(markReportEmailed).toHaveBeenCalledWith('mr-1');
  });

  it('splits trend_valuation rows into their own ordered section with a neutral cross label', async () => {
    setOnchain([
      { key: 'mvrv', short_label: 'MVRV', metric_group: 'behaviour_valuation', unit: 'ratio', decimals: 2,
        value: 2.1, observed_at: '2026-07-03', change_since_prior: null, pct_change_since_prior: null, signal: null },
      // Deliberately out of display order — buildTrendItems re-sorts by TREND_ORDER.
      { key: 'mayer_multiple', short_label: 'Mayer Multiple', metric_group: 'trend_valuation', unit: 'ratio', decimals: 2,
        value: 1.15, observed_at: '2026-07-03', change_since_prior: 0.02, pct_change_since_prior: 1.77, signal: null },
      { key: 'ma_200d', short_label: '200-Day MA', metric_group: 'trend_valuation', unit: 'usd', decimals: 0,
        value: 92000, observed_at: '2026-07-03', change_since_prior: 300, pct_change_since_prior: 0.33, signal: null },
      { key: 'ma_cross', short_label: '50d vs 200d', metric_group: 'trend_valuation', unit: 'signal', decimals: 2,
        value: 4.2, observed_at: '2026-07-03', change_since_prior: null, pct_change_since_prior: null, signal: 'cross_up' },
    ]);
    setMacro([]);

    const out = await runMarketReport(ROUTINE, new Date('2026-07-03T22:00:00Z'));

    expect(out.status).toBe('success');
    const res = out.market_report_result!;
    expect(res.trend_count).toBe(3);
    expect(res.onchain_count).toBe(1); // MVRV only — trend rows excluded from On-chain

    // Trend section renders between Bitcoin and On-chain, in TREND_ORDER.
    const headings = res.sections.map((s) => s.heading);
    expect(headings).toEqual(['Trend & Valuation', 'On-chain']);
    const trend = res.sections.find((s) => s.heading === 'Trend & Valuation')!;
    expect(trend.items.map((i) => i.label)).toEqual(['200-Day MA', 'Mayer Multiple', '50d vs 200d']);
    // The cross signal token is humanised to a neutral, action-free phrase.
    expect(trend.items[2].signal).toBe('50d crossed above 200d');
    // On-chain no longer carries the trend rows.
    const onchain = res.sections.find((s) => s.heading === 'On-chain')!;
    expect(onchain.items.map((i) => i.label)).toEqual(['MVRV']);
  });

  it('still sends (without a narration, disclaimer intact) when the narration is held', async () => {
    setOnchain([
      { key: 'hash_rate', short_label: 'Hash Rate', metric_group: 'network_security', unit: 'eh_s', decimals: 2,
        value: 900, observed_at: '2026-07-03', change_since_prior: 10, pct_change_since_prior: 1.1, signal: null },
    ]);
    setMacro([]);
    generateFindingsNarration.mockResolvedValueOnce({
      ...PUBLISHED_NARRATION,
      narration: null,
      status: 'held',
    });

    const out = await runMarketReport(ROUTINE, new Date('2026-07-03T22:00:00Z'));

    expect(out.status).toBe('success');
    expect(out.market_report_result?.narration).toBeNull();
    expect(out.market_report_result?.narration_status).toBe('held');
    expect(deliverTeamEmail).toHaveBeenCalledTimes(1);
    const [, message] = deliverTeamEmail.mock.calls[0] as unknown as [unknown, { text: string }];
    expect(message.text).not.toContain('Momentum is building');
    expect(message.text).toContain('not financial advice');
    // A held report is never flagged as emailed — its narration wasn't sent.
    expect(markReportEmailed).not.toHaveBeenCalled();
    expect(out.result?.summary).toContain('narration withheld');
  });

  it('surfaces stale feeds in the outcome summary', async () => {
    setOnchain([
      { key: 'hash_rate', short_label: 'Hash Rate', metric_group: 'network_security', unit: 'eh_s', decimals: 2,
        value: 900, observed_at: '2026-07-03', change_since_prior: 10, pct_change_since_prior: 1.1, signal: null },
    ]);
    setMacro([]);
    generateFindingsNarration.mockResolvedValueOnce({
      ...PUBLISHED_NARRATION,
      staleMetrics: ['mvrv', 'macro:gold'],
    });

    const out = await runMarketReport(ROUTINE, new Date('2026-07-03T22:00:00Z'));

    expect(out.result?.summary).toContain('2 stale feeds: mvrv, macro:gold');
    expect(out.market_report_result?.stale_metrics).toEqual(['mvrv', 'macro:gold']);
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

    it('renders BTC/USD live, directly below BTC/AUD, from the same adapter', async () => {
      setOnchain([]);
      setMacro([]);
      setBitcoinIndicators([
        { id: 'ind-aud', key: 'btc_price_aud', short_label: 'BTC/AUD', unit: 'aud', decimals: 2 },
        { id: 'ind-usd', key: 'btc_price_usd', short_label: 'BTC/USD', unit: 'usd', decimals: 0 },
      ]);
      setBitcoinObservations([
        { indicator_id: 'ind-aud', observed_at: '2026-07-03', value: 140000 },
        { indicator_id: 'ind-usd', observed_at: '2026-07-03', value: 92000 },
      ]);
      // The snapshot keys are mapped in array order (AUD then USD), so the two
      // coingecko calls resolve in that order.
      coingeckoFetchLatest
        .mockResolvedValueOnce({
          ok: true, observations: [{ observedAt: '2026-07-04', key: 'btc_price_aud', value: 142350, raw: {} }],
        })
        .mockResolvedValueOnce({
          ok: true, observations: [{ observedAt: '2026-07-04', key: 'btc_price_usd', value: 94000, raw: {} }],
        });

      const out = await runMarketReport(ROUTINE, new Date('2026-07-04T11:00:00Z'));

      expect(out.status).toBe('success');
      const res = out.market_report_result!;
      expect(res.bitcoin_count).toBe(2);
      const bitcoin = res.sections.find((s) => s.heading === 'Bitcoin')!;
      expect(bitcoin.items.map((i) => i.label)).toEqual(['BTC/AUD', 'BTC/USD']);
      expect(bitcoin.items[1]).toMatchObject({ label: 'BTC/USD', value: '94,000 USD', as_of: '2026-07-04' });
      expect(bitcoin.items[1].delta).toContain('▲'); // 94,000 vs stored 92,000
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
