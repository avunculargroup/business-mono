/**
 * Pure helpers for scripts/backfillKeyPointKinds.ts — kept here so they are
 * unit-tested without loading the script (which runs on import).
 */

/** True when a stored key_points value still holds pre-kind bare strings. */
export function hasLegacyKeyPoints(raw: unknown): boolean {
  return Array.isArray(raw) && raw.some((entry) => typeof entry === 'string');
}

/** Same cap the email ingestion paths give the extractor (researchMailListener). */
export const BACKFILL_CONTENT_CHARS = 12_000;

export interface KindTally {
  new: number;
  background: number;
  opinion: number;
}

export function tallyKinds(points: Array<{ kind: keyof KindTally }>, into: KindTally): KindTally {
  for (const p of points) into[p.kind] += 1;
  return into;
}
