// Materiality & severity — pure: no LLM, no I/O.
//
// The spec had Rex score this. The platform already decides "what is
// interesting" in deterministic code (lib/findings/materiality.ts) and reserves
// the model for narration, and the same reasoning applies here with more force:
// a score that drives what a director sees first should be auditable and
// reproducible, not re-derived by a model on every run. Everything here is a
// pure function of the payload, so a scoring change is a diff someone can read.
//
// Bump RUBRIC_VERSION on any change to the weights or the formula. It is
// stamped on the change so a shift in scoring is traceable after the fact.

import type { EcosystemChangeType, EcosystemSeverity } from '@platform/shared';

export const RUBRIC_VERSION = 'v1';

// What kind of change this is, before anything about the specific instance.
// A regulatory move ranks highest: it is the hard, verifiable fact a Trustee is
// meant to be watching and rarely is. A mention ranks lowest — it is context.
const BASE_BY_TYPE: Record<EcosystemChangeType, number> = {
  regulatory_change: 90,
  advisory:          80,
  discontinuity:     70,
  incident:          55,
  staleness:         50,
  corporate_event:   50,
  policy_change:     40,
  pricing_change:    40,
  release:           35,
  mention:           15,
  other:             20,
};

// Vendor-declared severity, where the source states one (GHSA bands, status
// page impact). Absent severity is neutral rather than penalised.
const SEVERITY_MULTIPLIER: Record<string, number> = {
  critical: 1.35,
  high:     1.2,
  major:    1.2,
  medium:   1.0,
  moderate: 1.0,
  low:      0.8,
  minor:    0.8,
  none:     0.7,
  info:     0.7,
};

const DAY_MS = 86_400_000;

/**
 * Recency decay. A change that happened today matters more than the same change
 * from six weeks ago — mostly this affects backfill, where a watch's first real
 * run can surface something old. Full weight for a week, then a gentle slope to
 * a floor of 0.6, because an old regulatory de-listing is still a de-listing.
 */
export function recencyFactor(occurredAt: string | null, now: Date): number {
  if (!occurredAt) return 1;
  const occurred = Date.parse(occurredAt);
  if (!Number.isFinite(occurred)) return 1;

  const ageDays = (now.getTime() - occurred) / DAY_MS;
  if (ageDays <= 7) return 1;
  if (ageDays >= 90) return 0.6;
  return 1 - 0.4 * ((ageDays - 7) / 83);
}

/**
 * How overdue an attestation is scales its materiality: a week late is an
 * administrative slip, a year late is the finding. Capped so a five-year-old
 * attestation does not swamp everything else in the feed forever.
 */
function stalenessFactor(payload: Record<string, unknown>): number {
  const overdue = Number(payload.days_overdue);
  const cadence = Number(payload.expected_cadence_days);
  if (!Number.isFinite(overdue) || !Number.isFinite(cadence) || cadence <= 0) return 1;

  // One full cadence overdue = 1.2x, two = 1.4x, capped at 1.5x.
  return Math.min(1 + 0.2 * (overdue / cadence), 1.5);
}

function severityMultiplier(payload: Record<string, unknown>): number {
  const declared = payload.severity ?? payload.impact;
  if (typeof declared !== 'string') return 1;
  return SEVERITY_MULTIPLIER[declared.toLowerCase()] ?? 1;
}

export interface MaterialityInput {
  changeType: EcosystemChangeType;
  payload: Record<string, unknown>;
  occurredAt: string | null;
  /** The watch's explicit weight for how much this entity matters to us. */
  centrality: number;
  now: Date;
}

/** Score 0–100. Multiplicative, so a change has to clear more than one bar. */
export function scoreMateriality(input: MaterialityInput): number {
  const base = BASE_BY_TYPE[input.changeType] ?? 20;
  const score =
    base *
    severityMultiplier(input.payload) *
    (input.changeType === 'staleness' ? stalenessFactor(input.payload) : 1) *
    recencyFactor(input.occurredAt, input.now) *
    (Number.isFinite(input.centrality) ? input.centrality : 1);

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Display band.
 *
 * Where the source declares a severity, it wins outright — a vendor calling an
 * advisory critical is a fact, and it should not be softened because we happen
 * to weight that entity low. Otherwise the band comes from the score.
 */
export function severityBand(
  payload: Record<string, unknown>,
  materiality: number,
): EcosystemSeverity {
  const declared = payload.severity;
  if (typeof declared === 'string') {
    const normalised = declared.toLowerCase();
    if (normalised === 'critical') return 'critical';
    if (normalised === 'high') return 'high';
  }

  if (materiality >= 85) return 'critical';
  if (materiality >= 65) return 'high';
  if (materiality >= 40) return 'medium';
  if (materiality >= 20) return 'low';
  return 'info';
}
