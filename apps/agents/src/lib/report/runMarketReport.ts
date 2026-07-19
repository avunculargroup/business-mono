/**
 * market_report routine handler — the daily market snapshot email.
 *
 * Read-only (plus three live fetches — see below): it mostly consumes data the
 * on-chain and macro polls have ALREADY stored (v_onchain_dashboard +
 * v_indicator_latest), assembles neutral sections (current value,
 * day-over-day/period change, and any signal chip), and emails them to the team
 * via the shared deliverTeamEmail transport. It writes nothing beyond the
 * routine's audit row.
 *
 * The lead commentary comes from the findings engine (lib/findings/): findings
 * are computed deterministically, scored for materiality, narrated by the
 * internal marketAnalyst agent, mechanically linted, and Lex-reviewed when a
 * valuation-sensitive finding is in play. Best-effort — a held/errored
 * narration just drops the commentary (the persisted market_reports row keeps
 * it for review at /market-reports), the report still sends. Everything else
 * stays deterministic.
 *
 * The "Bitcoin" section (block height, BTC/AUD price, Fear & Greed) is the
 * exception: those three are fetched LIVE at send time via the same adapters
 * onchain_poll uses (see buildBitcoinSnapshotItems below), not read from last
 * night's stored value — they move faster than the once-daily poll cadence.
 * History still accumulates in onchain_observations via the normal poll, which
 * is what the section's delta is computed against.
 *
 * On-chain valuation metrics (MVRV, Hash Ribbons) are compliance-sensitive, so
 * every line states the figure and its direction only — never a buy/sell framing.
 */

import { supabase } from '@platform/db';
import {
  RoutineActionType,
  type MarketReportItem,
  type MarketReportResult,
  type MarketReportSection,
  type RoutineFrequency,
} from '@platform/shared';
import { deliverTeamEmail, loadCompanyFooter } from '../sendNewsDigest.js';
import { renderMarketReportEmail } from '../marketReportEmail.js';
import { generateFindingsNarration, markReportEmailed } from '../findings/index.js';
import { mempoolAdapter } from '../onchain/adapters/mempool.js';
import { coingeckoAdapter } from '../onchain/adapters/coingecko.js';
import { alternativeMeAdapter } from '../onchain/adapters/alternativeMe.js';
import { utcDate, type OnchainIndicatorConfig } from '../onchain/types.js';
// Type-only import — erased at compile time, so no runtime import cycle with the
// workflow (which imports this handler's value).
import type { RoutineOutcome } from '../../workflows/executeRoutineWorkflow.js';

interface RoutineInput {
  id: string;
  name: string;
  action_type: string;
  action_config: Record<string, unknown>;
  frequency: string;
  time_of_day: string;
  timezone: string;
}

// Compact unit suffixes (mirror the web format layers; the report is agents-side
// and can't import them). Empty string = a bare number reads best.
const ONCHAIN_UNITS: Record<string, string> = {
  eh_s: 'EH/s', ratio: '', usd: 'USD', percent: '%', count: '', signal: '', btc: 'BTC',
  aud: 'AUD', index: '',
};
const MACRO_UNITS: Record<string, string> = {
  percent: '%', usd_billion: 'USD bn', aud_billion: 'AUD bn', index: '', usd: 'USD',
};

type OnchainRow = {
  key: string | null;
  short_label: string | null;
  metric_group: string | null;
  unit: string | null;
  decimals: number | null;
  value: number | null;
  observed_at: string | null;
  change_since_prior: number | null;
  pct_change_since_prior: number | null;
  signal: string | null;
};

type MacroRow = {
  short_label: string | null;
  unit: string | null;
  decimals: number | null;
  current_value: number | null;
  period_date: string | null;
  change_since_prior: number | null;
  pct_change_since_prior: number | null;
};

export async function runMarketReport(
  routine: RoutineInput,
  now: Date = new Date(),
): Promise<RoutineOutcome> {
  const result: MarketReportResult = {
    sections: [],
    onchain_count: 0,
    macro_count: 0,
    bitcoin_count: 0,
    trend_count: 0,
    emailed: false,
    narration: null,
  };

  const [onchainRes, macroRes, bitcoinItems] = await Promise.all([
    supabase.from('v_onchain_dashboard').select('*'),
    supabase.from('v_indicator_latest').select('*'),
    buildBitcoinSnapshotItems(now),
  ]);

  if (onchainRes.error && macroRes.error) {
    return outcome(
      routine,
      'failed',
      null,
      `Failed to read market views: onchain=${onchainRes.error.message}; macro=${macroRes.error.message}`,
      result,
    );
  }

  // market_snapshot rows (block height, BTC/AUD price, Fear & Greed) get their own
  // "Bitcoin" section built from a live fetch above — exclude them here so they
  // don't also render as stale On-chain rows from last night's poll. trend_valuation
  // rows (price MAs, Mayer, cross, RSI, vol, drawdown) get their own section too.
  // btc_price_usd is a trend_valuation row but is surfaced in the Bitcoin snapshot
  // section (below BTC/AUD, live-fetched) instead — drop it here so it renders once.
  const allOnchain = (onchainRes.data ?? []) as unknown as OnchainRow[];
  const onchainRows = allOnchain.filter(
    (r) => r.metric_group !== 'market_snapshot' && r.metric_group !== 'trend_valuation',
  );
  const trendRows = allOnchain.filter(
    (r) => r.metric_group === 'trend_valuation' && r.key !== 'btc_price_usd',
  );
  const macroRows = ((macroRes.data ?? []) as unknown as MacroRow[]);

  const onchainItems = buildOnchainItems(onchainRows);
  const trendItems = buildTrendItems(trendRows);
  const macroItems = buildMacroItems(macroRows);
  result.onchain_count = onchainItems.length;
  result.macro_count = macroItems.length;
  result.bitcoin_count = bitcoinItems.length;
  result.trend_count = trendItems.length;

  const sections: MarketReportSection[] = [];
  if (bitcoinItems.length) sections.push({ heading: 'Bitcoin', items: bitcoinItems });
  if (trendItems.length) sections.push({ heading: 'Trend & Valuation', items: trendItems });
  if (onchainItems.length) sections.push({ heading: 'On-chain', items: onchainItems });
  if (macroItems.length) sections.push({ heading: 'Macro', items: macroItems });
  result.sections = sections;

  // Nothing to report yet (e.g. before the first polls have run) — succeed quietly
  // without an empty email.
  if (sections.length === 0) {
    return outcome(
      routine,
      'success',
      { summary: 'Market report: no indicator data available yet — email skipped.', sources: [] },
      null,
      result,
    );
  }

  // Best-effort lead commentary from the findings engine. A held/errored
  // narration returns null and the email sends without it.
  const findingsResult = await generateFindingsNarration(now);
  result.narration = findingsResult.narration;
  result.report_id = findingsResult.reportId;
  result.report_mode = findingsResult.reportMode;
  result.narration_status = findingsResult.status;
  result.findings_total = findingsResult.findingsTotal;
  result.findings_selected = findingsResult.findingsSelected;
  result.stale_metrics = findingsResult.staleMetrics;

  const webAppUrl = process.env['WEB_APP_URL'];
  const reviewUrl =
    webAppUrl && findingsResult.reportId
      ? `${webAppUrl.replace(/\/$/, '')}/market-reports/${findingsResult.reportId}`
      : null;

  const company = await loadCompanyFooter();
  const message = renderMarketReportEmail({
    title: routine.name,
    sections,
    date: now,
    company,
    narration: findingsResult.narration,
    reviewUrl,
  });
  const delivery = await deliverTeamEmail({ id: routine.id, title: routine.name }, message);
  result.emailed = delivery.sent > 0;
  if (result.emailed && findingsResult.reportId && findingsResult.status === 'published') {
    await markReportEmailed(findingsResult.reportId);
  }

  const staleNote = findingsResult.staleMetrics.length
    ? `; ${findingsResult.staleMetrics.length} stale feed${findingsResult.staleMetrics.length === 1 ? '' : 's'}: ${findingsResult.staleMetrics.join(', ')}`
    : '';
  const narrationNote =
    findingsResult.status === 'published'
      ? ''
      : findingsResult.status === 'held'
        ? '; narration withheld (lint/Lex)'
        : '; narration unavailable';
  const summary =
    `Market report: ${result.bitcoin_count} bitcoin + ${result.trend_count} trend + ` +
    `${result.onchain_count} on-chain + ${result.macro_count} macro indicators` +
    (delivery.configured
      ? ` — emailed to ${delivery.sent}/${delivery.attempted} team members`
      : ' — email not configured') +
    narrationNote +
    staleNote;

  return outcome(
    routine,
    'success',
    { summary, sources: [], metadata: result as unknown as Record<string, unknown> },
    null,
    result,
  );
}

// ── section builders ──────────────────────────────────────────────────────────

function buildOnchainItems(rows: OnchainRow[]): MarketReportItem[] {
  // Network security first, then holder behaviour & valuation.
  const order = (g: string | null) => (g === 'network_security' ? 0 : 1);
  return [...rows]
    .sort((a, b) => order(a.metric_group) - order(b.metric_group))
    .map((r) => ({
      label: r.short_label ?? r.key ?? '',
      value: fmtValue(r.value, r.decimals ?? 2, ONCHAIN_UNITS[r.unit ?? ''] ?? ''),
      delta: fmtDelta(r.change_since_prior, r.pct_change_since_prior, r.decimals ?? 2),
      signal: r.signal ?? null,
      as_of: r.observed_at ?? null,
    }));
}

// Display order within Trend & Valuation: the moving-average ladder, then the
// derived ratios/oscillators. Keys not listed sort last, stably.
const TREND_ORDER = [
  'ma_50d', 'ma_200d', 'ma_200w', 'mayer_multiple', 'ma_cross',
  'rsi_14', 'realized_vol_30d', 'drawdown_from_high',
];

// The 50d/200d cross state, framed neutrally — states what the relationship IS,
// never a buy/sell implication. Mirrors the neutral chip on the web dashboard.
const CROSS_SIGNAL_LABEL: Record<string, string> = {
  above: '50d above 200d',
  below: '50d below 200d',
  cross_up: '50d crossed above 200d',
  cross_down: '50d crossed below 200d',
};

function buildTrendItems(rows: OnchainRow[]): MarketReportItem[] {
  const rank = (k: string | null) => {
    const i = TREND_ORDER.indexOf(k ?? '');
    return i === -1 ? TREND_ORDER.length : i;
  };
  return [...rows]
    .sort((a, b) => rank(a.key) - rank(b.key))
    .map((r) => ({
      label: r.short_label ?? r.key ?? '',
      value: fmtValue(r.value, r.decimals ?? 2, ONCHAIN_UNITS[r.unit ?? ''] ?? ''),
      delta: fmtDelta(r.change_since_prior, r.pct_change_since_prior, r.decimals ?? 2),
      signal: r.signal ? CROSS_SIGNAL_LABEL[r.signal] ?? r.signal : null,
      as_of: r.observed_at ?? null,
    }));
}

function buildMacroItems(rows: MacroRow[]): MarketReportItem[] {
  // v_indicator_latest already orders by region, category.
  return rows.map((r) => ({
    label: r.short_label ?? '',
    value: fmtValue(r.current_value, r.decimals ?? 2, MACRO_UNITS[r.unit ?? ''] ?? ''),
    delta: fmtDelta(r.change_since_prior, r.pct_change_since_prior, r.decimals ?? 2),
    signal: null,
    as_of: r.period_date ?? null,
  }));
}

// ── Bitcoin snapshot: live-fetched, not read from the last poll's stored value ──
// Block height, BTC/AUD price, and Fear & Greed move (or, for Fear & Greed,
// refresh) faster than the once-daily onchain_poll cadence, so the report calls
// the SAME adapters the poll uses directly, at send time, rather than reading
// yesterday's (or last night's) stored row. History still accumulates via the
// normal onchain_poll routine — the delta below compares the live figure to the
// most recently STORED observation, and falls back to the last two stored
// observations if the live fetch fails, so the section degrades the same way the
// web dashboard's equivalent cards do (never a hard failure, just a stale value).

const BITCOIN_SNAPSHOT_KEYS = ['btc_price_aud', 'btc_price_usd', 'block_height', 'fear_greed'] as const;
type BitcoinSnapshotKey = (typeof BITCOIN_SNAPSHOT_KEYS)[number];

type BitcoinIndicatorRow = { id: string; key: string; short_label: string; unit: string; decimals: number };
type StoredObs = { value: number; observed_at: string };

async function fetchLiveValue(key: BitcoinSnapshotKey): Promise<{ value: number; signal: string | null } | null> {
  const config = (provider: OnchainIndicatorConfig['provider']): OnchainIndicatorConfig => ({
    key, provider, providerMetricCode: null, unit: '',
  });
  try {
    if (key === 'block_height') {
      const res = await mempoolAdapter.fetchLatest([config('mempool')]);
      if (!res.ok) return null;
      const obs = res.observations.find((o) => o.key === key);
      return obs ? { value: obs.value, signal: null } : null;
    }
    if (key === 'btc_price_aud' || key === 'btc_price_usd') {
      // The adapter reads the currency off the config key (aud vs usd).
      const res = await coingeckoAdapter.fetchLatest([config('coingecko')]);
      if (!res.ok) return null;
      const obs = res.observations.find((o) => o.key === key);
      return obs ? { value: obs.value, signal: null } : null;
    }
    const res = await alternativeMeAdapter.fetchLatest([config('alternative_me')]);
    if (!res.ok) return null;
    const obs = res.observations.find((o) => o.key === key);
    if (!obs) return null;
    const classification = (obs.raw as { classification?: string } | undefined)?.classification ?? null;
    return { value: obs.value, signal: classification };
  } catch {
    return null; // one provider hiccup must not sink the report
  }
}

async function buildBitcoinSnapshotItems(now: Date): Promise<MarketReportItem[]> {
  const { data: indicatorRows } = await supabase
    .from('onchain_indicators')
    .select('id, key, short_label, unit, decimals')
    .in('key', BITCOIN_SNAPSHOT_KEYS as unknown as string[])
    .eq('is_active', true);
  const indicators = (indicatorRows ?? []) as BitcoinIndicatorRow[];
  if (indicators.length === 0) return [];
  const byKey = new Map(indicators.map((i) => [i.key, i]));

  const { data: obsRows } = await supabase
    .from('onchain_observations')
    .select('indicator_id, observed_at, value')
    .in('indicator_id', indicators.map((i) => i.id))
    .eq('is_current', true)
    .order('observed_at', { ascending: false });
  const latest = new Map<string, StoredObs>();
  const prior = new Map<string, StoredObs>();
  for (const row of (obsRows ?? []) as { indicator_id: string; observed_at: string; value: number }[]) {
    const obs = { value: Number(row.value), observed_at: row.observed_at };
    if (!latest.has(row.indicator_id)) latest.set(row.indicator_id, obs);
    else if (!prior.has(row.indicator_id)) prior.set(row.indicator_id, obs);
  }

  const items = await Promise.all(
    BITCOIN_SNAPSHOT_KEYS.map(async (key): Promise<MarketReportItem | null> => {
      const indicator = byKey.get(key);
      if (!indicator) return null;
      const storedLatest = latest.get(indicator.id) ?? null;
      const storedPrior = prior.get(indicator.id) ?? null;
      const live = await fetchLiveValue(key);

      const value = live ? live.value : storedLatest?.value ?? null;
      const comparisonBase = live ? storedLatest?.value ?? null : storedPrior?.value ?? null;
      const asOf = live ? utcDate(now) : storedLatest?.observed_at ?? null;
      if (value == null) return null; // never polled yet AND the live fetch failed

      const change = comparisonBase != null ? value - comparisonBase : null;
      const pct =
        comparisonBase != null && comparisonBase !== 0
          ? Math.round(((value - comparisonBase) / Math.abs(comparisonBase)) * 10000) / 100
          : null;

      return {
        label: indicator.short_label,
        value: fmtValue(value, indicator.decimals ?? 2, ONCHAIN_UNITS[indicator.unit ?? ''] ?? ''),
        delta: fmtDelta(change, pct, indicator.decimals ?? 2),
        signal: live?.signal ?? null,
        as_of: asOf,
      };
    }),
  );
  return items.filter((i): i is MarketReportItem => i !== null);
}

// ── formatting ──────────────────────────────────────────────────────────────

function fmtNumber(value: number, decimals: number): string {
  return value.toLocaleString('en-AU', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtValue(value: number | null, decimals: number, unitLabel: string): string {
  if (value == null) return '—';
  const n = fmtNumber(value, decimals);
  return unitLabel ? `${n} ${unitLabel}` : n;
}

/** Direction-only change prose. Null when flat or when there's no prior value. */
function fmtDelta(change: number | null, pct: number | null, decimals: number): string | null {
  if (change == null || change === 0) return null;
  const up = change > 0;
  const arrow = up ? '▲' : '▼'; // ▲ ▼ — direction only, no colour semantics
  const sign = up ? '+' : '−';  // − minus sign
  const magnitude = `${sign}${fmtNumber(Math.abs(change), decimals)}`;
  const pctStr = pct != null ? ` (${sign}${Math.abs(pct).toFixed(2)}%)` : '';
  return `${arrow} ${magnitude}${pctStr} on prior`;
}

// ── outcome helper ────────────────────────────────────────────────────────────

function outcome(
  routine: RoutineInput,
  status: 'success' | 'failed',
  routineResult: RoutineOutcome['result'],
  error: string | null,
  marketReportResult: MarketReportResult,
): RoutineOutcome {
  return {
    routine_id: routine.id,
    name: routine.name,
    action_type: RoutineActionType.MARKET_REPORT,
    frequency: routine.frequency as RoutineFrequency,
    time_of_day: routine.time_of_day,
    timezone: routine.timezone,
    status,
    result: routineResult,
    error,
    market_report_result: marketReportResult,
  };
}
