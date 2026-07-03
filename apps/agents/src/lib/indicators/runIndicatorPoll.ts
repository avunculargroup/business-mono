/**
 * indicator_poll routine handler — the deterministic macro poll.
 *
 * For each active economic_indicator that is DUE per its poll_frequency and whose
 * provider has an adapter: fetch via the adapter, apply the released_at fallback,
 * run the revision rules (insert / supersede / no-op), and — on a qualifying new
 * print for an already-tracked series — propose a content beat for Charlie behind
 * the publish wall. One failing provider never sinks the sweep.
 *
 * Adapters fetch+parse only; all DB diffing/supersession lives here. See
 * docs/features/economic-indicators/feature-spec.md + adapter-contract.md.
 */

import { supabase } from '@platform/db';
import type { Json } from '@platform/db';
import {
  RoutineActionType,
  type IndicatorPollConfig,
  type IndicatorPollResult,
  type RoutineFrequency,
} from '@platform/shared';
import { getAdapter } from './registry.js';
import type { IndicatorConfig, PeriodGranularity, Provider } from './types.js';
// Type-only import — erased at compile time, so no runtime import cycle with the
// workflow (which imports this handler's value).
import type { RoutineOutcome } from '../../workflows/executeRoutineWorkflow.js';

const DEFAULT_BACKFILL_PERIODS = 18; // ~12–24; enough for YoY + a sparkline on day one
const DAILY_BACKFILL_MIN = 90;       // daily series count in days — a thin 18-day start isn't enough
const STEADY_LIMIT = 6;
const BEAT_DEDUPE_DAYS = 7;
const FETCH_TZ = 'Australia/Melbourne';

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
  name: string;
  short_label: string;
  category: string;
  provider: Provider;
  provider_series_code: string | null;
  provider_table_ref: string | null;
  unit: string;
  decimals: number;
  poll_frequency: string;
  period_granularity: PeriodGranularity;
  alert_on_new_print: boolean;
  alert_change_threshold: number | null;
};

type CurrentObs = { id: string; period_date: string; value: number; released_at: string };

export async function runIndicatorPoll(
  routine: RoutineInput,
  now: Date = new Date(),
): Promise<RoutineOutcome> {
  const cfg = routine.action_config as IndicatorPollConfig;
  const backfillPeriods = cfg.backfill_periods ?? DEFAULT_BACKFILL_PERIODS;
  const fetchDate = dateInTz(now, FETCH_TZ);

  const result: IndicatorPollResult = {
    indicators_polled: 0,
    observations_inserted: 0,
    observations_superseded: 0,
    no_op: 0,
    beats_proposed: 0,
    failed: [],
  };

  const { data: indicators, error } = await supabase
    .from('economic_indicators')
    .select(
      'id, name, short_label, category, provider, provider_series_code, provider_table_ref, unit, decimals, poll_frequency, period_granularity, alert_on_new_print, alert_change_threshold',
    )
    .eq('is_active', true);

  if (error) {
    return outcome(routine, 'failed', null, `Failed to load indicators: ${error.message}`, result);
  }

  // Cast through unknown: the generated types lag the migration that adds
  // period_granularity to the select, so the row type resolves as an error until
  // `pnpm --filter @platform/db generate-types` runs post-migration.
  for (const indicator of (indicators ?? []) as unknown as IndicatorRow[]) {
    const adapter = getAdapter(indicator.provider);
    if (!adapter) continue; // e.g. 'abs' — no adapter yet
    if (!isDue(indicator.poll_frequency, now, routine.timezone)) continue;
    result.indicators_polled += 1;

    try {
      await pollOne(indicator, adapter.provider, backfillPeriods, fetchDate, result);
    } catch (err) {
      result.failed.push(`${indicator.short_label} (${err instanceof Error ? err.message : String(err)})`);
    }
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

  // ── per-indicator processing ───────────────────────────────────────────────
  async function pollOne(
    indicator: IndicatorRow,
    provider: Provider,
    backfill: number,
    asAt: string,
    acc: IndicatorPollResult,
  ): Promise<void> {
    const adapter = getAdapter(provider)!;

    // All current-vintage observations for this indicator, for first-ingest
    // detection, per-period lookup, and prior-latest comparison.
    const { data: currentRows } = await supabase
      .from('indicator_observations')
      .select('id, period_date, value, released_at')
      .eq('indicator_id', indicator.id)
      .eq('is_current', true);
    const current = (currentRows ?? []) as CurrentObs[];
    const firstIngest = current.length === 0;
    const byPeriod = new Map(current.map((o) => [o.period_date, o]));
    const priorLatest = current.reduce<CurrentObs | null>(
      (max, o) => (max === null || o.period_date > max.period_date ? o : max),
      null,
    );

    const config: IndicatorConfig = {
      id: indicator.id,
      shortLabel: indicator.short_label,
      provider,
      providerSeriesCode: indicator.provider_series_code,
      providerTableRef: indicator.provider_table_ref,
      granularity: indicator.period_granularity,
    };
    // Daily series count backfill in days, so a first ingest needs a deeper window
    // than the ~18-period default sized for monthly data.
    const firstLimit =
      indicator.period_granularity === 'daily' ? Math.max(backfill, DAILY_BACKFILL_MIN) : backfill;
    const res = await adapter.fetchLatest(config, { limit: firstIngest ? firstLimit : STEADY_LIMIT });
    if (!res.ok) {
      acc.failed.push(`${indicator.short_label} (${res.error.kind}: ${res.error.message})`);
      return;
    }

    let newLatestValue: number | null = null;
    for (const obs of res.observations) {
      const releasedAt = obs.releasedAt ?? asAt;
      const existing = byPeriod.get(obs.periodDate);

      if (!existing) {
        const { error: insErr } = await supabase.from('indicator_observations').insert({
          indicator_id: indicator.id,
          period_date: obs.periodDate,
          value: obs.value,
          released_at: releasedAt,
          is_current: true,
          is_revision: false,
          source: provider,
          raw: (obs.raw ?? {}) as Json,
        });
        if (insErr) { acc.failed.push(`${indicator.short_label} insert: ${insErr.message}`); continue; }
        acc.observations_inserted += 1;
        if (!priorLatest || obs.periodDate > priorLatest.period_date) newLatestValue = obs.value;
      } else if (existing.value === obs.value) {
        acc.no_op += 1;
      } else if (releasedAt > existing.released_at) {
        // Revision: supersede the prior vintage.
        await supabase.from('indicator_observations').update({ is_current: false }).eq('id', existing.id);
        const { error: revErr } = await supabase.from('indicator_observations').insert({
          indicator_id: indicator.id,
          period_date: obs.periodDate,
          value: obs.value,
          released_at: releasedAt,
          is_current: true,
          is_revision: true,
          superseded_value: existing.value,
          source: provider,
          raw: (obs.raw ?? {}) as Json,
        });
        if (revErr) { acc.failed.push(`${indicator.short_label} revision: ${revErr.message}`); continue; }
        acc.observations_superseded += 1;
        if (priorLatest && obs.periodDate === priorLatest.period_date) newLatestValue = obs.value;
      } else {
        // Different value but not a newer vintage than what we hold — skip to
        // avoid a duplicate (indicator_id, period_date, released_at).
        acc.no_op += 1;
      }
    }

    // Content beat: only for an already-tracked series that printed a new latest
    // value this run, when the alert rule fires and we haven't proposed this week.
    if (firstIngest || newLatestValue === null) return;
    const priorValue = priorLatest?.value ?? null;
    const change = priorValue === null ? null : newLatestValue - priorValue;
    const thresholdHit =
      indicator.alert_change_threshold != null &&
      change != null &&
      Math.abs(change) > indicator.alert_change_threshold;
    if (!indicator.alert_on_new_print && !thresholdHit) return;

    if (await alreadyProposedThisWeek(indicator.id, now)) return;
    await proposeContentBeat(indicator, newLatestValue, change, asAt);
    acc.beats_proposed += 1;
  }
}

async function alreadyProposedThisWeek(indicatorId: string, now: Date): Promise<boolean> {
  const cutoff = new Date(now.getTime() - BEAT_DEDUPE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('agent_activity')
    .select('id')
    .eq('entity_type', 'economic_indicator')
    .eq('entity_id', indicatorId)
    .gte('created_at', cutoff)
    .limit(1)
    .maybeSingle();
  return data != null;
}

async function proposeContentBeat(
  indicator: IndicatorRow,
  value: number,
  change: number | null,
  asAt: string,
): Promise<void> {
  const formatted = `${value.toFixed(indicator.decimals)}`;
  const changeLabel =
    change === null ? '' : `, ${change >= 0 ? 'up' : 'down'} ${Math.abs(change).toFixed(indicator.decimals)} on the prior period`;
  const message =
    `New ${indicator.name} print: ${formatted} (released ${asAt})${changeLabel}. ` +
    `Draft a short LinkedIn post for review where the BTS perspective leads and this figure ` +
    `is supporting evidence — never the voice. Keep the framing neutral; let the number do the work.`;

  await supabase.from('agent_activity').insert({
    agent_name: 'simon',
    action: `Proposed content beat: ${indicator.short_label}`,
    status: 'auto',
    trigger_type: 'scheduled',
    entity_type: 'economic_indicator',
    entity_id: indicator.id,
    proposed_actions: [
      {
        agent: 'charlie',
        message,
        context: { indicator_id: indicator.id, value, change, released_at: asAt },
      },
    ] as Json,
  });
}

// ── helpers ───────────────────────────────────────────────────────────────────

function outcome(
  routine: RoutineInput,
  status: 'success' | 'failed',
  result: RoutineOutcome['result'],
  error: string | null,
  indicatorResult: IndicatorPollResult,
): RoutineOutcome {
  return {
    routine_id: routine.id,
    name: routine.name,
    action_type: RoutineActionType.INDICATOR_POLL,
    frequency: routine.frequency as RoutineFrequency,
    time_of_day: routine.time_of_day,
    timezone: routine.timezone,
    status,
    result,
    error,
    indicator_poll_result: indicatorResult,
  };
}

/** A weekly-poll indicator only hits its API on Mondays (in the routine tz); a
 *  daily-poll indicator polls every run. No per-poll state needed. */
function isDue(pollFrequency: string, now: Date, tz: string): boolean {
  if (pollFrequency !== 'weekly') return true;
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(now);
  return weekday === 'Mon';
}

/** Today's date as 'YYYY-MM-DD' in the given IANA timezone. */
function dateInTz(now: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
