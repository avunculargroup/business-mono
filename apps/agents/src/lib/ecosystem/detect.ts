// Phase A — detection. Deterministic, and it always commits.
//
// Selects the watches that are due, runs each one's adapter, and writes the
// changes it found with their verifiable facts only: payload, title, dedup_key,
// occurred_at, external_url. Scoring, narration and compliance classification
// all happen later, in enrich.ts, so a change never depends on an LLM being up
// to exist.
//
// Spec: docs/features/ecosystem/ecosystem-signal-feature.md

import { supabase } from '@platform/db';
import type { Json } from '@platform/db';
import { createLogger } from '../logger.js';
import { adapterFor } from './registry.js';
import type { EcosystemAdapterError } from './types.js';

const log = createLogger('ecosystem-detect');

// How long after its last check a watch becomes due again. `realtime` is absent
// deliberately: those watches are event-driven (the newsletter rides the
// existing Fastmail spine) and are never polled.
const INTERVAL_MS: Record<string, number> = {
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

// Health thresholds. A watch that has failed a few times in a row is degraded;
// one that keeps failing is failing. Both are visible on the health surface —
// an unattended broken watch is a quieter trust failure than a missed change.
const DEGRADED_AT = 3;
const FAILING_AT = 6;

// Backoff caps out at 4 doublings so a recovered vendor is picked up again
// within a day or so rather than being punished indefinitely.
const MAX_BACKOFF_DOUBLINGS = 4;

const BATCH_LIMIT = 25;

export interface WatchRow {
  id: string;
  product_service_id: string | null;
  advisor_partner_id: string | null;
  watch_type: string;
  label: string;
  config: Record<string, unknown> | null;
  check_frequency: string;
  last_checked_at: string | null;
  last_state: Record<string, unknown> | null;
  consecutive_failures: number;
}

export interface DetectionSummary {
  watchesChecked: number;
  watchesSkipped: number;
  changesDetected: number;
  failures: Array<{ watchId: string; label: string; kind: string; message: string }>;
}

/**
 * Is this watch due, accounting for failure backoff?
 *
 * Exported for tests — the due window is the difference between polling a
 * vendor once a day and hammering them every tick.
 */
export function isDue(watch: WatchRow, now: Date): boolean {
  const interval = INTERVAL_MS[watch.check_frequency];
  if (interval === undefined) return false; // realtime, or an unknown cadence
  if (!watch.last_checked_at) return true;

  const doublings = Math.min(watch.consecutive_failures, MAX_BACKOFF_DOUBLINGS);
  const wait = interval * 2 ** doublings;
  return now.getTime() - Date.parse(watch.last_checked_at) >= wait;
}

/** Health band for a given consecutive-failure count. */
export function healthFor(consecutiveFailures: number): 'healthy' | 'degraded' | 'failing' {
  if (consecutiveFailures >= FAILING_AT) return 'failing';
  if (consecutiveFailures >= DEGRADED_AT) return 'degraded';
  return 'healthy';
}

/**
 * Claim a watch by stamping last_checked_at, but only while it still holds the
 * value we selected it with.
 *
 * The scan runs on an hourly schedule, which puts it on Mastra's evented engine
 * where ticks can overlap. Two concurrent ticks serialise on the row: the first
 * moves last_checked_at, the second's predicate no longer matches and it skips.
 * Without this, a slow tick means a vendor gets polled twice and a director sees
 * the work happen twice in the run log.
 */
async function claimWatch(watch: WatchRow, now: Date): Promise<boolean> {
  const query = supabase
    .from('ecosystem_watches')
    .update({ last_checked_at: now.toISOString() })
    .eq('id', watch.id);

  // A never-checked watch is claimed on the NULL, not on a timestamp compare.
  const { data, error } = watch.last_checked_at
    ? await query.eq('last_checked_at', watch.last_checked_at).select('id')
    : await query.is('last_checked_at', null).select('id');

  if (error) {
    log.warn({ watchId: watch.id, err: error }, 'claim failed — skipping watch this tick');
    return false;
  }
  return (data?.length ?? 0) > 0;
}

/** Record the outcome of a run against the watch: anchor, health, backoff. */
async function recordOutcome(
  watch: WatchRow,
  outcome:
    | { ok: true; nextState: Json; changed: boolean; now: Date }
    | { ok: false },
): Promise<void> {
  const update: Record<string, unknown> = outcome.ok
    ? {
        last_state: outcome.nextState,
        consecutive_failures: 0,
        health: 'healthy',
        ...(outcome.changed ? { last_change_at: outcome.now.toISOString() } : {}),
      }
    : {
        consecutive_failures: watch.consecutive_failures + 1,
        health: healthFor(watch.consecutive_failures + 1),
      };

  const { error } = await supabase.from('ecosystem_watches').update(update).eq('id', watch.id);
  if (error) log.error({ watchId: watch.id, err: error }, 'failed to record watch outcome');
}

/**
 * Persist the changes an adapter found.
 *
 * `ignoreDuplicates` against the (watch_id, dedup_key) unique index is what
 * makes the whole scan safely re-runnable: a repeated run, or two overlapping
 * ticks that both got past the claim, insert nothing the second time. Returns
 * how many rows were actually new.
 */
async function persistChanges(
  watch: WatchRow,
  entityName: string,
  changes: Array<{
    changeType: string;
    title: string;
    payload: Record<string, unknown>;
    dedupKey: string;
    occurredAt: string | null;
    externalUrl: string | null;
  }>,
): Promise<number> {
  if (changes.length === 0) return 0;

  const { data, error } = await supabase
    .from('ecosystem_changes')
    .insert(
      changes.map((change) => ({
        watch_id: watch.id,
        product_service_id: watch.product_service_id,
        advisor_partner_id: watch.advisor_partner_id,
        entity_name: entityName,
        change_type: change.changeType,
        title: change.title,
        payload: change.payload as Json,
        dedup_key: change.dedupKey,
        occurred_at: change.occurredAt,
        external_url: change.externalUrl,
      })),
    )
    .select('id');

  if (error) {
    // 23505 is the dedup index doing its job on a batch where at least one row
    // was already present. Nothing was lost; the change is already recorded.
    if ((error as { code?: string }).code === '23505') {
      log.info({ watchId: watch.id }, 'changes already recorded — dedup index held');
      return 0;
    }
    log.error({ watchId: watch.id, err: error }, 'failed to persist changes');
    return 0;
  }

  return data?.length ?? 0;
}

/** Load due watches with the register name each change should be stamped with. */
async function loadDueWatches(now: Date): Promise<Array<WatchRow & { entityName: string }>> {
  const { data, error } = await supabase
    .from('ecosystem_watches')
    .select(
      'id, product_service_id, advisor_partner_id, watch_type, label, config, check_frequency, ' +
        'last_checked_at, last_state, consecutive_failures, ' +
        'products_services(name), advisors_partners(name)',
    )
    .eq('enabled', true)
    .order('last_checked_at', { ascending: true, nullsFirst: true })
    .limit(BATCH_LIMIT);

  if (error) {
    log.error({ err: error }, 'failed to load watches');
    return [];
  }

  type JoinedRow = WatchRow & {
    products_services: { name: string } | null;
    advisors_partners: { name: string } | null;
  };

  return ((data ?? []) as unknown as JoinedRow[])
    .filter((row) => isDue(row, now))
    .map((row) => ({
      ...row,
      // Denormalised onto the change so it survives a later rename of the
      // register row, the same reason contracts carry counterparty_name.
      entityName: row.products_services?.name ?? row.advisors_partners?.name ?? row.label,
    }));
}

/** Run every due watch. Never throws: one bad vendor must not sink the sweep. */
export async function runDetection(now: Date = new Date()): Promise<DetectionSummary> {
  const summary: DetectionSummary = {
    watchesChecked: 0,
    watchesSkipped: 0,
    changesDetected: 0,
    failures: [],
  };

  const watches = await loadDueWatches(now);

  for (const watch of watches) {
    const adapter = adapterFor(watch.watch_type);
    if (!adapter) {
      // Not yet implemented — a later phase. Not a failure of this watch, so it
      // does not count against its health.
      summary.watchesSkipped += 1;
      continue;
    }

    if (!(await claimWatch(watch, now))) {
      summary.watchesSkipped += 1;
      continue;
    }

    summary.watchesChecked += 1;

    let result;
    try {
      result = await adapter.detect({
        config: watch.config ?? {},
        lastState: watch.last_state,
        now,
      });
    } catch (err) {
      // An adapter is contracted not to throw. If one does, treat it as a
      // failure of that watch rather than letting it abort the sweep.
      log.error({ err, watchId: watch.id }, 'adapter threw');
      result = {
        ok: false as const,
        error: {
          kind: 'transport' as const,
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }

    if (!result.ok) {
      const error: EcosystemAdapterError = result.error;
      summary.failures.push({
        watchId: watch.id,
        label: watch.label,
        kind: error.kind,
        message: error.message,
      });
      await recordOutcome(watch, { ok: false });
      continue;
    }

    const inserted = await persistChanges(watch, watch.entityName, result.changes);
    summary.changesDetected += inserted;
    await recordOutcome(watch, {
      ok: true,
      nextState: result.nextState,
      changed: inserted > 0,
      now,
    });
  }

  return summary;
}
