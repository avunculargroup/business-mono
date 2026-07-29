/**
 * Ecosystem scan workflow.
 *
 * Polls the enabled ecosystem watches, commits what changed, then enriches the
 * changes that have no summary yet. All the logic lives in
 * ../lib/ecosystem/ — this file is only the schedule and the Mastra seam, the
 * same split as the market report (runMarketReport → generateFindingsNarration)
 * and for the same reason: the pipeline is then testable as a plain function.
 *
 * Scheduled hourly rather than through the `routines` table, because
 * `routines.frequency` admits only daily/weekly/fortnightly and the spec calls
 * for an hourly cadence on some watches. The tick is hourly; each watch's own
 * `check_frequency` decides whether it is actually due, so a daily watch is
 * still polled once a day.
 *
 * Note that declaring `schedule` promotes this workflow to Mastra's evented
 * engine, where ticks can overlap. That is handled in detect.ts, which claims
 * each watch before running it.
 */

import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { runEcosystemScan } from '../lib/ecosystem/index.js';

const outputSchema = z.object({
  watches_checked: z.number(),
  watches_skipped: z.number(),
  changes_detected: z.number(),
  failures: z.number(),
  enriched: z.number(),
  narrated: z.number(),
  classified: z.number(),
});

const scanEcosystem = createStep({
  id: 'scan_ecosystem',
  inputSchema: z.object({ triggered_at: z.string() }),
  outputSchema,
  execute: async () => {
    const { detection, enrichment } = await runEcosystemScan();
    return {
      watches_checked: detection.watchesChecked,
      watches_skipped: detection.watchesSkipped,
      changes_detected: detection.changesDetected,
      failures: detection.failures.length,
      enriched: enrichment.enriched,
      narrated: enrichment.narrated,
      classified: enrichment.classified,
    };
  },
});

export const ecosystemScanWorkflow = createWorkflow({
  id: 'ecosystemScan',
  inputSchema: z.object({ triggered_at: z.string() }),
  outputSchema,
  // Twenty past the hour, to sit clear of the on-the-hour polls. triggered_at is
  // a static marker so the schedule payload doesn't go stale at module load.
  schedule: {
    cron: '20 * * * *',
    timezone: 'UTC',
    inputData: { triggered_at: 'scheduled' },
  },
})
  .then(scanEcosystem)
  .commit();
