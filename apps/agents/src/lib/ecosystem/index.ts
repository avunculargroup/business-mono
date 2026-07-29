// The ecosystem scan entry point, called from ecosystemScanWorkflow.
//
// Two phases, in order, both best-effort:
//   A. detect  — deterministic. Runs every due watch and commits what changed.
//   B. enrich  — scores, narrates and classifies changes that have no summary
//                yet, including any left behind by an earlier failed run.
//
// Enrichment sweeps `summary IS NULL` rather than taking a handoff from
// detection, so the two phases are independent: a detection run that found
// nothing still re-tries yesterday's failed narration, and an enrichment outage
// never blocks facts from landing.
//
// Never throws — a scan that partly failed still reports what it did.
// Spec: docs/features/ecosystem/ecosystem-signal-feature.md

import { supabase } from '@platform/db';
import type { Json } from '@platform/db';
import { createLogger } from '../logger.js';
import { runDetection, type DetectionSummary } from './detect.js';
import { runEnrichment, type EnrichmentSummary } from './enrich.js';

const log = createLogger('ecosystem-scan');

export interface EcosystemScanResult {
  detection: DetectionSummary;
  enrichment: EnrichmentSummary;
}

const EMPTY: EcosystemScanResult = {
  detection: { watchesChecked: 0, watchesSkipped: 0, changesDetected: 0, failures: [] },
  enrichment: { enriched: 0, narrated: 0, classified: 0 },
};

/**
 * Log the run to agent_activity.
 *
 * `agent_name` is 'rex' rather than a new 'ecosystem' name: the CHECK on
 * agent_activity (mirrored on platform_capabilities and routines) admits only
 * the roster personas, and Rex already owns the monitoring and research sweeps.
 * Adding a name would mean widening three constraints in lockstep for a label.
 *
 * Run stats are JSON-stringified into `notes` — the queryable convention the
 * routine handlers use — and a run with any watch failure is recorded as
 * 'error' so it surfaces without reading logs.
 */
async function logRun(result: EcosystemScanResult): Promise<void> {
  const failed = result.detection.failures.length > 0;
  const { error } = await supabase.from('agent_activity').insert({
    agent_name: 'rex',
    action: 'Ecosystem scan',
    status: failed ? 'error' : 'auto',
    trigger_type: 'scheduled',
    entity_type: 'ecosystem_watches',
    notes: JSON.stringify(result),
    approved_actions: [result] as unknown as Json,
  });
  if (error) log.error({ err: error }, 'failed to log scan run');
}

export async function runEcosystemScan(now: Date = new Date()): Promise<EcosystemScanResult> {
  try {
    const detection = await runDetection(now);
    const enrichment = await runEnrichment(now);
    const result = { detection, enrichment };

    log.info(
      {
        watchesChecked: detection.watchesChecked,
        watchesSkipped: detection.watchesSkipped,
        changesDetected: detection.changesDetected,
        failures: detection.failures.length,
        enriched: enrichment.enriched,
        narrated: enrichment.narrated,
      },
      'ecosystem scan complete',
    );

    await logRun(result);
    return result;
  } catch (err) {
    log.error({ err }, 'ecosystem scan failed');
    return EMPTY;
  }
}
