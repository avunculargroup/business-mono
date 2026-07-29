// Phase B — enrichment. Scores, narrates and classifies changes that detection
// has already committed.
//
// This runs as a sweep over `summary IS NULL` rather than inline after
// detection, which means a failed or skipped enrichment is self-healing: the
// next scan picks the change up again. It also means the facts are never
// waiting on the model — by the time this runs, the change is already in the
// feed with its payload.
//
// Materiality is always written (pure code, cannot fail). Summary and
// compliance class are written only when they succeed; either can stay NULL.

import { supabase } from '@platform/db';
import { createLogger } from '../logger.js';
import { classifyChange } from './classify.js';
import { scoreMateriality, severityBand } from './materiality.js';
import { narrateChange } from './narrate.js';

const log = createLogger('ecosystem-enrich');

// Bounded per run: each change costs two LLM calls, and an unbounded sweep on a
// backfill would be a surprise bill.
const BATCH_LIMIT = 20;

export interface EnrichmentSummary {
  enriched: number;
  narrated: number;
  classified: number;
}

interface UnenrichedChange {
  id: string;
  change_type: string;
  title: string;
  payload: Record<string, unknown> | null;
  occurred_at: string | null;
  entity_name: string;
  ecosystem_watches: { centrality: number | null } | null;
}

/** Enrich the changes detection has left un-narrated. Never throws. */
export async function runEnrichment(now: Date = new Date()): Promise<EnrichmentSummary> {
  const summary: EnrichmentSummary = { enriched: 0, narrated: 0, classified: 0 };

  const { data, error } = await supabase
    .from('ecosystem_changes')
    .select('id, change_type, title, payload, occurred_at, entity_name, ecosystem_watches(centrality)')
    .is('summary', null)
    .order('detected_at', { ascending: false })
    .limit(BATCH_LIMIT);

  if (error) {
    log.error({ err: error }, 'failed to load unenriched changes');
    return summary;
  }

  for (const change of (data ?? []) as unknown as UnenrichedChange[]) {
    const payload = change.payload ?? {};

    // Deterministic first, and unconditionally: a change always gets a score
    // and a band, even if both model calls fail.
    const materiality = scoreMateriality({
      changeType: change.change_type as never,
      payload,
      occurredAt: change.occurred_at,
      centrality: change.ecosystem_watches?.centrality ?? 1,
      now,
    });
    const severity = severityBand(payload, materiality);

    const [narration, classification] = await Promise.all([
      narrateChange({ changeType: change.change_type, title: change.title, payload }),
      classifyChange({
        changeType: change.change_type,
        title: change.title,
        payload,
        entityName: change.entity_name,
      }),
    ]);

    const update: Record<string, unknown> = { materiality, severity };
    if (narration) update.summary = narration;
    if (classification) {
      update.compliance_class = classification.complianceClass;
      update.compliance_notes = classification.complianceNotes;
    }

    const { error: updateError } = await supabase
      .from('ecosystem_changes')
      .update(update)
      .eq('id', change.id);

    if (updateError) {
      log.error({ err: updateError, changeId: change.id }, 'failed to persist enrichment');
      continue;
    }

    summary.enriched += 1;
    if (narration) summary.narrated += 1;
    if (classification) summary.classified += 1;
  }

  return summary;
}
