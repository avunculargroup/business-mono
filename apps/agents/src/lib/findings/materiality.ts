// Materiality & selection — decides which findings survive to narration. Pure:
// no LLM, no I/O. Most days most indicators are boring, and the whole
// credibility play is a report willing to say so.
// Spec: docs/features/findings-engine-spec.md §Spec 2.

import type { Finding, Selection } from '@platform/shared';
import type { ActiveWatch, FindingConfig } from './config.js';
import { clamp01 } from './computors/shared.js';

// The anti-capitulation mechanism: single-period moves in noisy series are
// WEATHER until they persist; a streak's persistence IS the point; a confirmed
// break/crossing is meaningful on day one.
export function persistenceFactor(finding: Finding, config: FindingConfig): number {
  const vol = config.metricConfig[finding.metric_group]?.vol_class ?? 'low';
  const p = finding.persistence_periods;

  if (finding.finding_type === 'anomaly' || finding.finding_type === 'inflection') {
    if (p <= 1 && vol === 'high') return 0.5;
    return Math.min(Math.max(0.6 + 0.1 * p, 0.6), 1.0);
  }
  if (finding.finding_type === 'streak') {
    return Math.min(Math.max(0.5 + 0.08 * p, 0.5), 1.0);
  }
  // divergence, threshold (staleness never reaches scoring).
  return Math.min(Math.max(0.8 + 0.05 * p, 0.8), 1.0);
}

function watchBoost(finding: Finding, watches: ActiveWatch[]): number {
  let boost = 1;
  for (const watch of watches) {
    if (watch.target_type === 'metric_group' && watch.target_ref === finding.metric_group) {
      boost *= watch.boost;
    }
    if (
      watch.target_type === 'pair' &&
      finding.secondary_metric_key &&
      watch.target_ref === `${finding.metric_key}|${finding.secondary_metric_key}`
    ) {
      boost *= watch.boost;
    }
  }
  return boost;
}

// Multiplicative, not additive: a finding unremarkable on any one axis
// collapses toward zero. "Unusual AND sizeable AND on-thesis" is the bar.
export function materialityOf(finding: Finding, config: FindingConfig, watches: ActiveWatch[]): number {
  const { baseMagnitude, kMag } = config.tunables;
  const thesisWeight = config.metricConfig[finding.metric_group]?.thesis_weight ?? 1;
  return clamp01(
    finding.unusualness *
      (baseMagnitude + kMag * finding.magnitude_norm) *
      persistenceFactor(finding, config) *
      thesisWeight *
      watchBoost(finding, watches),
  );
}

export function scoreAndSelect(
  findings: Finding[],
  config: FindingConfig,
  watches: ActiveWatch[],
  asOf: string,
): Selection {
  // Staleness goes to ops, never to the client report — and never scores.
  const opsFindings = findings.filter((f) => f.finding_type === 'staleness');
  const scorable = findings
    .filter((f) => f.finding_type !== 'staleness')
    .map((f) => ({ ...f, materiality: materialityOf(f, config, watches) }))
    .sort((a, b) => b.materiality - a.materiality);

  const { floor, maxFindings } = config.tunables;
  const selected = scorable.filter((f) => f.materiality >= floor).slice(0, maxFindings);

  // Quiet day: nothing cleared the floor. Emit the single highest-materiality
  // finding (if any) so the narrator can say "the only thing worth noting is X".
  // Never pad to K — fewer real findings beats three manufactured ones.
  if (selected.length === 0) {
    return {
      as_of: asOf,
      report_mode: 'quiet',
      findings: scorable.length > 0 ? [scorable[0]] : [],
      ops_findings: opsFindings,
    };
  }

  return { as_of: asOf, report_mode: 'normal', findings: selected, ops_findings: opsFindings };
}
