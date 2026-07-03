/**
 * market_report routine handler — the daily market snapshot email.
 *
 * Deterministic and read-only: it consumes the data the on-chain and macro polls
 * have ALREADY stored (v_onchain_dashboard + v_indicator_latest), assembles two
 * neutral sections (current value, day-over-day/period change, and any signal
 * chip), and emails them to the team via the shared deliverTeamEmail transport.
 * It calls no LLM and writes nothing beyond the routine's audit row.
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
    emailed: false,
  };

  const [onchainRes, macroRes] = await Promise.all([
    supabase.from('v_onchain_dashboard').select('*'),
    supabase.from('v_indicator_latest').select('*'),
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

  const onchainRows = ((onchainRes.data ?? []) as unknown as OnchainRow[]);
  const macroRows = ((macroRes.data ?? []) as unknown as MacroRow[]);

  const onchainItems = buildOnchainItems(onchainRows);
  const macroItems = buildMacroItems(macroRows);
  result.onchain_count = onchainItems.length;
  result.macro_count = macroItems.length;

  const sections: MarketReportSection[] = [];
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

  const company = await loadCompanyFooter();
  const message = renderMarketReportEmail({ title: routine.name, sections, date: now, company });
  const delivery = await deliverTeamEmail({ id: routine.id, title: routine.name }, message);
  result.emailed = delivery.sent > 0;

  const summary =
    `Market report: ${result.onchain_count} on-chain + ${result.macro_count} macro indicators` +
    (delivery.configured
      ? ` — emailed to ${delivery.sent}/${delivery.attempted} team members`
      : ' — email not configured');

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
