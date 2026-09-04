/**
 * Reconciliation: what the ledger now says against what it said before.
 *
 * Runs after validation and before any narration, so a delta is arithmetic
 * rather than an impression. Two jobs:
 *
 *   1. Say which candidate events are new and which restate something already
 *      committed, so re-ingesting a document produces no findings at all.
 *   2. Apply the materiality floor, which is what stops the feed drowning.
 *
 * The floor is calibrated against a real restatement: an amended notice
 * restated shares on issue by 90,539 — 0.03% — because buyback shares had not
 * yet been cancelled on the register. Administrative, not signal, and exactly
 * the kind of noise that trains a reader to stop looking. Anything below half a
 * percent of the reference quantity is logged and suppressed rather than
 * dropped: "we looked and it was immaterial" and "we did not look" have to stay
 * distinguishable, which is why a suppressed delta is still a stored row.
 */

import { MATERIALITY_FLOOR } from '@platform/shared';

export interface CandidateEvent {
  event_type: string;
  event_date: string;
  quantity?: number | null;
  consideration_native?: number | null;
  natural_key: string;
  [key: string]: unknown;
}

export interface CommittedEvent {
  natural_key: string;
  quantity: number | null;
  consideration_native: number | null;
}

export interface Delta {
  natural_key: string;
  field: 'quantity' | 'consideration_native';
  from: number | null;
  to: number | null;
  /** Absolute change over the reference quantity. Null when there is no reference to divide by. */
  relative: number | null;
  suppressed: boolean;
  reason: string | null;
}

export interface Reconciliation {
  /** Events with no committed counterpart. */
  created: CandidateEvent[];
  /** Events whose committed counterpart differs on a numeric field. */
  restated: CandidateEvent[];
  /** Events already committed with identical figures. Re-ingest lands here. */
  unchanged: CandidateEvent[];
  deltas: Delta[];
}

/**
 * A change as a fraction of what it changed from.
 *
 * Relative to the prior value, not the new one: a holding going from 0 to
 * anything is not a 100% change, it is the first disclosure, and dividing by
 * the new value would report it as material for the wrong reason. A prior of
 * zero has no meaningful denominator, so it returns null and the caller treats
 * it as material — a first figure always is.
 */
export function relativeChange(from: number | null, to: number | null): number | null {
  if (from === null || to === null) return null;
  if (from === 0) return null;
  return Math.abs(to - from) / Math.abs(from);
}

function numericFields(
  candidate: CandidateEvent,
  committed: CommittedEvent,
): Array<{ field: Delta['field']; from: number | null; to: number | null }> {
  return [
    { field: 'quantity' as const, from: committed.quantity, to: candidate.quantity ?? null },
    {
      field: 'consideration_native' as const,
      from: committed.consideration_native,
      to: candidate.consideration_native ?? null,
    },
  ].filter((pair) => pair.from !== pair.to);
}

export function reconcile(
  candidates: readonly CandidateEvent[],
  committed: readonly CommittedEvent[],
): Reconciliation {
  const byKey = new Map(committed.map((row) => [row.natural_key, row]));

  const created: CandidateEvent[] = [];
  const restated: CandidateEvent[] = [];
  const unchanged: CandidateEvent[] = [];
  const deltas: Delta[] = [];

  for (const candidate of candidates) {
    const prior = byKey.get(candidate.natural_key);

    if (!prior) {
      created.push(candidate);
      continue;
    }

    const changes = numericFields(candidate, prior);
    if (changes.length === 0) {
      unchanged.push(candidate);
      continue;
    }

    restated.push(candidate);

    for (const change of changes) {
      const relative = relativeChange(change.from, change.to);
      // A null relative means there is no prior figure to measure against — a
      // first disclosure, or a figure that appeared where none was. Material by
      // construction, because there is nothing to say it is not.
      const suppressed = relative !== null && relative < MATERIALITY_FLOOR;

      deltas.push({
        natural_key: candidate.natural_key,
        field: change.field,
        from: change.from,
        to: change.to,
        relative,
        suppressed,
        reason: suppressed
          ? `Below the ${(MATERIALITY_FLOOR * 100).toFixed(1)}% materiality floor ` +
            `(${((relative ?? 0) * 100).toFixed(3)}%)`
          : null,
      });
    }
  }

  return { created, restated, unchanged, deltas };
}

/** The deltas worth a finding. Suppressed ones are stored, never narrated. */
export function materialDeltas(reconciliation: Reconciliation): Delta[] {
  return reconciliation.deltas.filter((delta) => !delta.suppressed);
}

/**
 * True when a run has nothing to report.
 *
 * The quiet-day path. Most weeks nothing meaningful happens, and a pipeline
 * that cannot say so ends up manufacturing something to say.
 */
export function isQuietRun(reconciliation: Reconciliation): boolean {
  return reconciliation.created.length === 0 && materialDeltas(reconciliation).length === 0;
}
