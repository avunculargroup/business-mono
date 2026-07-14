/**
 * Storage retention pruning workflow.
 *
 * Mastra's storage retention (the `retention` config on the PostgresStore in
 * ../mastra/index.ts) is opt-in and never runs on its own — `prune()` must be
 * driven by a cron. This workflow is that cron: it fires daily and calls
 * `storage.prune()`, which batch-deletes rows older than the configured
 * per-table `maxAge` across the growth-table domains (memory, observability
 * spans, workflow snapshots, schedule fire history) in the Mastra Postgres
 * (MASTRA_DB_URL).
 *
 * Uses the same built-in-scheduler pattern as executeRoutineWorkflow — the
 * workflow-level `schedule` field drives it, no separate listener needed.
 */

import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { createLogger } from '../lib/logger.js';

const log = createLogger('prune-storage');

// Cap passes per tick so a single run can never spin unbounded if prune keeps
// reporting done:false against a large backlog. Each pass deletes in bounded
// batches; anything left over is cleaned up on the next daily tick.
const MAX_PASSES = 20;

const outputSchema = z.object({
  deleted: z.number(),
  passes: z.number(),
  done: z.boolean(),
});

/** Minimal shape of a prunable store — one result per table touched. */
interface PrunableStore {
  prune(): Promise<Array<{ deleted: number; done: boolean }>>;
}

/**
 * Drive `prune()` until every table reports `done: true` (or the pass cap is
 * hit). `prune()` deletes in bounded batches and returns `done: false` when
 * eligible rows remain, so we loop to fully drain a backlog within one tick.
 * An empty result (no retention configured, or nothing old enough) counts as
 * done — `[].every(...)` is `true`.
 *
 * Pure and store-agnostic so the loop logic is unit-testable without Mastra
 * internals.
 */
export async function runPrune(
  storage: PrunableStore,
  maxPasses = MAX_PASSES,
): Promise<z.infer<typeof outputSchema>> {
  let deleted = 0;
  let passes = 0;
  let done = false;

  while (passes < maxPasses) {
    passes += 1;
    const results = await storage.prune();
    deleted += results.reduce((sum, r) => sum + r.deleted, 0);
    done = results.every((r) => r.done);
    if (done) break;
  }

  return { deleted, passes, done };
}

const pruneStorage = createStep({
  id: 'prune_storage',
  inputSchema: z.object({ triggered_at: z.string() }),
  outputSchema,
  execute: async ({ mastra }) => {
    const storage = mastra.getStorage();
    if (!storage) {
      log.warn('No storage configured; skipping prune');
      return { deleted: 0, passes: 0, done: true };
    }

    const result = await runPrune(storage);

    if (result.done) {
      log.info({ deleted: result.deleted, passes: result.passes }, 'Storage prune complete');
    } else {
      log.warn(
        { deleted: result.deleted, passes: result.passes },
        'Storage prune hit pass cap; remaining rows deferred to next tick',
      );
    }

    return result;
  },
});

export const pruneStorageWorkflow = createWorkflow({
  id: 'pruneStorage',
  inputSchema: z.object({ triggered_at: z.string() }),
  outputSchema,
  // Daily at 03:00 UTC — off-peak; retention is coarse (days), so sub-daily
  // ticks add nothing. Mastra's built-in scheduler fires this (same mechanism
  // as executeRoutineWorkflow); triggered_at is a static marker so the
  // schedule payload doesn't go stale at module-load time.
  schedule: {
    cron: '0 3 * * *',
    timezone: 'UTC',
    inputData: { triggered_at: 'scheduled' },
  },
})
  .then(pruneStorage)
  .commit();
