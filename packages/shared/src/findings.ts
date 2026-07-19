// Findings engine — shared shapes for the daily market report insight layer.
//
// A finding is a deterministically computed, scored, compliance-classified claim
// about the indicator data. Findings are the ONLY thing the report narrator ever
// sees: if it isn't a finding, it doesn't exist as far as the narration is
// concerned. Spec: docs/features/findings-engine-spec.md.
//
// Plain interfaces only (no zod) — shared is a leaf package. The agents-side
// zod mirrors live in apps/agents/src/lib/findings/schemas.ts.

export type FindingType =
  | 'anomaly'
  | 'divergence'
  | 'inflection'
  | 'streak'
  | 'threshold'
  | 'staleness';

export type ComplianceClass = 'informational' | 'valuation_sensitive';

export type FindingPeriod = 'day' | 'month' | 'quarter';

// The trailing distribution the observed value was judged against.
export interface FindingBaseline {
  mean: number;
  sd: number;
  p05: number;
  p50: number;
  p95: number;
}

export interface FindingNarrationHint {
  // Plain-language meaning of `observed` — the only prose a computor writes.
  means: string;
  // e.g. "inside normal daily band" / "outside it".
  noise_note?: string;
  // False for single-period moves in noisy series: narrated as a watch-item, never
  // a conclusion.
  verdict_allowed: boolean;
}

export interface Finding {
  id: string;
  finding_type: FindingType;

  // Unified metric key: onchain_indicators.key as-is, or macro:<slug> for
  // economic_indicators (see macroMetricKey).
  metric_key: string;
  metric_group: string;
  // Divergence only — the paired series.
  secondary_metric_key?: string;

  period: FindingPeriod;
  // ISO date of the triggering observation.
  as_of: string;
  // Trailing window actually used, in calendar days.
  window_days: number;

  // The period-appropriate value/delta that triggered the finding.
  observed: number;
  baseline: FindingBaseline;
  // 0..1 — percentile distance from baseline.
  unusualness: number;
  // 0..1 — normalised size of the move.
  magnitude_norm: number;
  // How many consecutive periods the condition has held.
  persistence_periods: number;
  // For logic only — NEVER mapped to colour.
  direction: 'up' | 'down' | 'flat_break';

  // 0..1 — set by scoreAndSelect, 0 until scored.
  materiality: number;
  compliance_class: ComplianceClass;

  // Words the narrator MAY use to characterise this finding.
  allowed_vocab: string[];
  narration_hint: FindingNarrationHint;

  // Observation/view references — the audit trail.
  evidence_refs: string[];
}

// Output of scoreAndSelect — the narrator's entire universe.
export interface Selection {
  as_of: string;
  report_mode: 'normal' | 'quiet';
  // Client-report set (staleness already stripped).
  findings: Finding[];
  // Staleness etc. — surfaced to ops, never narrated.
  ops_findings: Finding[];
}

// market_reports.status: published = narration passed lint + Lex and went into
// the email; held = it failed and was withheld (stored for review); error = the
// pipeline itself failed before producing a persistable narration.
export type MarketReportStatus = 'published' | 'held' | 'error';

export type MarketReportMode = 'normal' | 'quiet';

/**
 * Unified metric key for a macro (economic_indicators) series, derived from its
 * short_label: 'US M2' -> 'macro:us_m2', 'S&P 500' -> 'macro:s_p_500'.
 * On-chain series use onchain_indicators.key unprefixed. Used by the findings
 * config loader and the seed rows in finding_divergence_pairs — keep in sync.
 */
export function macroMetricKey(shortLabel: string): string {
  const slug = shortLabel
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `macro:${slug}`;
}
