/**
 * onchain_poll routine handler — the deterministic on-chain poll.
 *
 * For each active on-chain indicator whose provider has an adapter: batch-fetch
 * via the adapter (Coin Metrics returns all its metrics in one call), apply the
 * revision rules (insert / supersede / no-op) to the RAW fetched series, and let
 * the views derive the rest. Then evaluate alert_config against the DERIVED views
 * — a Hash-Ribbons signal change, an MVRV band cross, or a large hash-rate drop —
 * and propose a (compliance-sensitive) content beat for Charlie behind the
 * publish wall. One failing provider never sinks the sweep.
 *
 * Adapters fetch+parse only; all DB diffing/supersession lives here; all
 * derivation lives in the views. See docs/features/onchain-indicators/.
 */

import { supabase } from '@platform/db';
import type { Json } from '@platform/db';
import {
  RoutineActionType,
  type OnchainPollConfig,
  type OnchainPollResult,
  type RoutineFrequency,
} from '@platform/shared';
import { getAdapter } from './registry.js';
import type { OnchainIndicatorConfig, OnchainProvider, RawObservation } from './types.js';
// Type-only import — erased at compile time, so no runtime import cycle with the
// workflow (which imports this handler's value).
import type { RoutineOutcome } from '../../workflows/executeRoutineWorkflow.js';

const DEFAULT_BACKFILL_DAYS = 90; // Hash Ribbons needs 60 days of hash rate.
const BEAT_DEDUPE_DAYS = 7;
const OBS_SCALE = 1e6; // NUMERIC(24,6) — round to the column scale before compare/insert.

interface RoutineInput {
  id: string;
  name: string;
  action_type: string;
  action_config: Record<string, unknown>;
  frequency: string;
  time_of_day: string;
  timezone: string;
}

type IndicatorRow = {
  id: string;
  key: string;
  name: string;
  short_label: string;
  metric_group: string;
  derivation: string;
  provider: OnchainProvider | null;
  provider_metric_code: string | null;
  unit: string;
  decimals: number;
  alert_config: Record<string, unknown> | null;
};

type CurrentObs = { id: string; observed_at: string; value: number };

const round6 = (n: number): number => Math.round(n * OBS_SCALE) / OBS_SCALE;

export async function runOnchainPoll(
  routine: RoutineInput,
  now: Date = new Date(),
): Promise<RoutineOutcome> {
  const cfg = routine.action_config as OnchainPollConfig;
  const backfillDays = cfg.backfill_days ?? DEFAULT_BACKFILL_DAYS;

  const result: OnchainPollResult = {
    indicators_polled: 0,
    observations_inserted: 0,
    observations_superseded: 0,
    no_op: 0,
    beats_proposed: 0,
    failed: [],
  };

  const { data: indicators, error } = await supabase
    .from('onchain_indicators')
    .select('id, key, name, short_label, metric_group, derivation, provider, provider_metric_code, unit, decimals, alert_config')
    .eq('is_active', true);

  if (error) {
    return outcome(routine, 'failed', null, `Failed to load indicators: ${error.message}`, result);
  }

  const all = (indicators ?? []) as IndicatorRow[];
  const byKey = new Map(all.map((i) => [i.key, i]));
  const fetched = all.filter((i) => i.derivation === 'fetched' && i.provider);

  // Decide backfill per provider: backfill when ANY of its indicators has no
  // observations yet (first ingest), so the views aren't empty on day one.
  const fetchedIds = fetched.map((i) => i.id);
  const withData = new Set<string>();
  if (fetchedIds.length > 0) {
    const { data: existing } = await supabase
      .from('onchain_observations')
      .select('indicator_id')
      .in('indicator_id', fetchedIds);
    for (const r of (existing ?? []) as { indicator_id: string }[]) withData.add(r.indicator_id);
  }

  // Group fetched indicators by provider and poll each provider once.
  const providers = new Map<OnchainProvider, IndicatorRow[]>();
  for (const i of fetched) {
    const list = providers.get(i.provider as OnchainProvider) ?? [];
    list.push(i);
    providers.set(i.provider as OnchainProvider, list);
  }

  // Collect all returned observations by key, then apply supersession per indicator.
  const byKeyObs = new Map<string, RawObservation[]>();

  for (const [provider, rows] of providers) {
    const adapter = getAdapter(provider);
    if (!adapter) continue; // no adapter for this provider yet
    result.indicators_polled += rows.length;

    const configs: OnchainIndicatorConfig[] = rows.map((i) => ({
      key: i.key,
      provider,
      providerMetricCode: i.provider_metric_code,
      unit: i.unit,
    }));
    const needBackfill = rows.some((i) => !withData.has(i.id));

    const res = await adapter.fetchLatest(configs, needBackfill ? { backfillDays } : undefined);
    if (!res.ok) {
      result.failed.push(`${provider} (${res.error.kind}: ${res.error.message})`);
      continue;
    }
    for (const obs of res.observations) {
      const list = byKeyObs.get(obs.key) ?? [];
      list.push(obs);
      byKeyObs.set(obs.key, list);
    }
  }

  // Supersession: one current-observation load per indicator that returned data.
  for (const [key, obsList] of byKeyObs) {
    const indicator = byKey.get(key);
    if (!indicator) continue; // unknown key
    try {
      await processIndicator(indicator, obsList, result);
    } catch (err) {
      result.failed.push(`${indicator.short_label} (${err instanceof Error ? err.message : String(err)})`);
    }
  }

  // Alerts: evaluated against the DERIVED views after all raw rows have landed.
  try {
    await evaluateAlerts(all, result, now);
  } catch (err) {
    result.failed.push(`alerts (${err instanceof Error ? err.message : String(err)})`);
  }

  const summary =
    `Polled ${result.indicators_polled} indicators — ` +
    `${result.observations_inserted} inserted, ${result.observations_superseded} revised, ` +
    `${result.no_op} unchanged, ${result.beats_proposed} beats proposed` +
    (result.failed.length ? `, ${result.failed.length} failed` : '');

  return outcome(
    routine,
    'success',
    { summary, sources: [], metadata: result as unknown as Record<string, unknown> },
    null,
    result,
  );
}

// ── per-indicator supersession ────────────────────────────────────────────────

async function processIndicator(
  indicator: IndicatorRow,
  obsList: RawObservation[],
  acc: OnchainPollResult,
): Promise<void> {
  const { data: currentRows } = await supabase
    .from('onchain_observations')
    .select('id, observed_at, value')
    .eq('indicator_id', indicator.id)
    .eq('is_current', true);
  const byDate = new Map<string, CurrentObs>(
    ((currentRows ?? []) as CurrentObs[]).map((o) => [o.observed_at, { ...o, value: Number(o.value) }]),
  );

  const sorted = [...obsList].sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  for (const obs of sorted) {
    const value = round6(obs.value);
    const existing = byDate.get(obs.observedAt);

    if (!existing) {
      const { error } = await supabase.from('onchain_observations').insert({
        indicator_id: indicator.id,
        observed_at: obs.observedAt,
        value,
        is_current: true,
        is_revision: false,
        source: indicator.provider as string,
        raw: (obs.raw ?? {}) as Json,
      });
      if (error) { acc.failed.push(`${indicator.short_label} insert: ${error.message}`); continue; }
      acc.observations_inserted += 1;
    } else if (existing.value === value) {
      acc.no_op += 1;
    } else {
      // Revision: supersede the prior vintage for this day.
      await supabase.from('onchain_observations').update({ is_current: false }).eq('id', existing.id);
      const { error } = await supabase.from('onchain_observations').insert({
        indicator_id: indicator.id,
        observed_at: obs.observedAt,
        value,
        is_current: true,
        is_revision: true,
        superseded_value: existing.value,
        source: indicator.provider as string,
        raw: (obs.raw ?? {}) as Json,
      });
      if (error) { acc.failed.push(`${indicator.short_label} revision: ${error.message}`); continue; }
      acc.observations_superseded += 1;
      byDate.set(obs.observedAt, { ...existing, value });
    }
  }
}

// ── alert evaluation (reads the derived views) ────────────────────────────────

async function evaluateAlerts(
  indicators: IndicatorRow[],
  acc: OnchainPollResult,
  now: Date,
): Promise<void> {
  for (const ind of indicators) {
    const cfg = ind.alert_config ?? {};
    if (!cfg || Object.keys(cfg).length === 0) continue;

    if (ind.key === 'hash_ribbons' && (cfg as { on_signal_change?: boolean }).on_signal_change) {
      await evalHashRibbons(ind, acc, now);
    } else if (Array.isArray((cfg as { bands?: unknown }).bands)) {
      await evalBands(ind, (cfg as { bands: Array<{ below?: number; above?: number }> }).bands, acc, now);
    } else if ((cfg as { drop_pct_over_days?: unknown }).drop_pct_over_days) {
      await evalDrop(ind, (cfg as { drop_pct_over_days: { pct: number; days: number } }).drop_pct_over_days, acc, now);
    }
  }
}

/** Fire when the Hash-Ribbons signal differs between the two most recent days. */
async function evalHashRibbons(ind: IndicatorRow, acc: OnchainPollResult, now: Date): Promise<void> {
  const { data } = await supabase
    .from('v_hash_ribbons')
    .select('observed_at, signal, spread_pct')
    .order('observed_at', { ascending: false })
    .limit(2);
  const rows = (data ?? []) as { observed_at: string; signal: string; spread_pct: number | null }[];
  if (rows.length < 2 || rows[0].signal === rows[1].signal) return;

  const latest = rows[0];
  const msg =
    `Hash Ribbons signal changed to ${latest.signal.toUpperCase()} as at ${latest.observed_at} ` +
    `(30-day hash-rate moving average crossed ${latest.signal === 'capitulation' ? 'below' : 'above'} the 60-day; ` +
    `spread ${latest.spread_pct ?? '—'}%). Draft a short post for review where the BTS perspective leads. ` +
    `State what the cross IS, never what to DO — this is context, not a buy/sell signal or price prediction.`;
  await proposeBeat(ind, msg, { signal: latest.signal, observed_at: latest.observed_at }, now, acc);
}

/** Fire on a fresh band cross: latest value is in a band the prior day was not. */
async function evalBands(
  ind: IndicatorRow,
  bands: Array<{ below?: number; above?: number }>,
  acc: OnchainPollResult,
  now: Date,
): Promise<void> {
  const { data } = await supabase
    .from('onchain_observations')
    .select('observed_at, value')
    .eq('indicator_id', ind.id)
    .eq('is_current', true)
    .order('observed_at', { ascending: false })
    .limit(2);
  const rows = (data ?? []) as { observed_at: string; value: number }[];
  if (rows.length === 0) return;
  const latest = { observed_at: rows[0].observed_at, value: Number(rows[0].value) };
  const prior = rows[1] ? Number(rows[1].value) : null;

  const bandOf = (v: number): string | null => {
    for (const b of bands) {
      if (b.below != null && v < b.below) return `below ${b.below}`;
      if (b.above != null && v > b.above) return `above ${b.above}`;
    }
    return null;
  };
  const nowBand = bandOf(latest.value);
  const priorBand = prior == null ? null : bandOf(prior);
  if (!nowBand || nowBand === priorBand) return; // not in a band, or no fresh cross

  const msg =
    `${ind.name} is ${latest.value.toFixed(ind.decimals)} as at ${latest.observed_at} — ${nowBand}, ` +
    `a historical extreme (illustrative band, not calibrated and NOT advice). Frame strictly as context ` +
    `(where price sits relative to the network's aggregate cost basis); never as a buy/sell signal or ` +
    `price prediction. BTS perspective leads; the figure is supporting evidence.`;
  await proposeBeat(ind, msg, { value: latest.value, band: nowBand, observed_at: latest.observed_at }, now, acc);
}

/** Fire when value dropped more than pct% over the last `days` days. */
async function evalDrop(
  ind: IndicatorRow,
  rule: { pct: number; days: number },
  acc: OnchainPollResult,
  now: Date,
): Promise<void> {
  const { data } = await supabase
    .from('onchain_observations')
    .select('observed_at, value')
    .eq('indicator_id', ind.id)
    .eq('is_current', true)
    .order('observed_at', { ascending: false })
    .limit(rule.days + 1);
  const rows = (data ?? []) as { observed_at: string; value: number }[];
  if (rows.length < 2) return;
  const latest = { observed_at: rows[0].observed_at, value: Number(rows[0].value) };
  const past = Number(rows[rows.length - 1].value);
  if (past <= 0) return;
  const changePct = ((latest.value - past) / past) * 100;
  if (changePct > -rule.pct) return;

  const msg =
    `Network hash rate fell ${Math.abs(changePct).toFixed(1)}% over ~${rule.days} days to ` +
    `${latest.value.toFixed(ind.decimals)} EH/s as at ${latest.observed_at} — a miner-stress watch. ` +
    `Neutral framing: state the move and its security context, not a market call. BTS perspective leads.`;
  await proposeBeat(ind, msg, { change_pct: changePct, observed_at: latest.observed_at }, now, acc);
}

// ── content beat proposal (behind the publish wall) ──────────────────────────

async function proposeBeat(
  indicator: IndicatorRow,
  message: string,
  context: Record<string, unknown>,
  now: Date,
  acc: OnchainPollResult,
): Promise<void> {
  if (await alreadyProposedThisWeek(indicator.id, now)) return;
  await supabase.from('agent_activity').insert({
    agent_name: 'simon',
    action: `Proposed content beat: ${indicator.short_label}`,
    status: 'auto',
    trigger_type: 'scheduled',
    entity_type: 'onchain_indicator',
    entity_id: indicator.id,
    proposed_actions: [
      {
        agent: 'charlie',
        message,
        // compliance_sensitive flags this draft for Lex's review (Session 4) — on-chain
        // valuation framing is the platform's highest advice-risk surface (AFSL/AR).
        context: {
          indicator_key: indicator.key,
          metric_group: indicator.metric_group,
          compliance_sensitive: true,
          ...context,
        },
      },
    ] as Json,
  });
  acc.beats_proposed += 1;
}

async function alreadyProposedThisWeek(indicatorId: string, now: Date): Promise<boolean> {
  const cutoff = new Date(now.getTime() - BEAT_DEDUPE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('agent_activity')
    .select('id')
    .eq('entity_type', 'onchain_indicator')
    .eq('entity_id', indicatorId)
    .gte('created_at', cutoff)
    .limit(1)
    .maybeSingle();
  return data != null;
}

// ── outcome wrapper ───────────────────────────────────────────────────────────

function outcome(
  routine: RoutineInput,
  status: 'success' | 'failed',
  result: RoutineOutcome['result'],
  error: string | null,
  onchainResult: OnchainPollResult,
): RoutineOutcome {
  return {
    routine_id: routine.id,
    name: routine.name,
    action_type: RoutineActionType.ONCHAIN_POLL,
    frequency: routine.frequency as RoutineFrequency,
    time_of_day: routine.time_of_day,
    timezone: routine.timezone,
    status,
    result,
    error,
    onchain_poll_result: onchainResult,
  };
}
