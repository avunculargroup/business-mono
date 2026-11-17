/**
 * Pure helpers for scripts/backfillKeyPointKinds.ts and
 * scripts/normalizeKeyPointAsOf.ts — kept here so they are unit-tested
 * without loading the scripts (which run on import).
 */

import { melbourneDate, normalizeAsOf } from '@platform/shared';

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

/** Why one point's asOf changed in the asOf backfill. */
export type AsOfChange = 'new_stamped' | 'invalid_nulled' | 'future_nulled';

export interface AsOfTally {
  rowsScanned: number;
  rowsChanged: number;
  points: number;
  new_stamped: number;
  invalid_nulled: number;
  future_nulled: number;
}

export const emptyAsOfTally = (): AsOfTally => ({
  rowsScanned: 0, rowsChanged: 0, points: 0, new_stamped: 0, invalid_nulled: 0, future_nulled: 0,
});

/**
 * The asOf rule extraction now applies (stampKeyPointAsOf), applied to one
 * stored key_points value. Returns the rewritten array and a reason per
 * changed point; `changes` is empty when the row is already right. Bare
 * strings and unrecognised entries pass through untouched. Absent and null
 * asOf count as the same value, so a point that just has no date is not a
 * change.
 */
export function normalizeRowAsOf(
  raw: unknown,
  publishedAt: string | null,
): { keyPoints: unknown[]; changes: AsOfChange[] } {
  if (!Array.isArray(raw)) return { keyPoints: [], changes: [] };
  const published = melbourneDate(publishedAt);
  const changes: AsOfChange[] = [];
  const keyPoints = raw.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
    const point = entry as Record<string, unknown>;
    const before = typeof point.asOf === 'string' && point.asOf !== '' ? point.asOf : null;
    const after = point.kind === 'new' ? published : normalizeAsOf(before, publishedAt);
    if (before === after) return entry;
    if (point.kind === 'new') changes.push('new_stamped');
    else changes.push(normalizeAsOf(before, null) === null ? 'invalid_nulled' : 'future_nulled');
    return { ...point, asOf: after };
  });
  return { keyPoints, changes };
}

export function tallyAsOf(changes: AsOfChange[], pointCount: number, into: AsOfTally): AsOfTally {
  into.rowsScanned += 1;
  into.points += pointCount;
  if (changes.length > 0) into.rowsChanged += 1;
  for (const c of changes) into[c] += 1;
  return into;
}
