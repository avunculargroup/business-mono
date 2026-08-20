import type { Finding } from '@platform/shared';
import type { MarketReportDetail } from '@platform/data';
import { onDate } from './anchor';

/**
 * The daily market report set.
 *
 * Four reports, staging four states of one pipeline —
 * [`fixture-and-trace-schema.md` § Narrative staging](../../../../docs/features/demo-app/fixture-and-trace-schema.md#narrative-staging).
 * The quiet day is the one that matters most: restraint is much rarer in AI
 * products than capability, and a system that says nothing happened rather than
 * manufacturing insight reads as maturity to anyone technical.
 *
 * ## ⚠️ The highest-risk prose in the fixture set
 *
 * Narration must read as market commentary and never as advice, and it is
 * dangerous precisely because it is the most plausible-sounding thing here. The
 * rules it is written under:
 *
 * - Describes what the data did. Never what anyone should do about it.
 * - No bitcoin allocation figure, percentage, target or recommendation
 *   anywhere — the single highest-risk element of the whole build.
 * - No forecast, no implied direction, no "expect", "should", "likely to".
 * - Where a finding's `verdict_allowed` is false the narration says so in
 *   plain words rather than quietly drawing the conclusion anyway.
 *
 * **This prose has not been through Lex.** The spec requires a classification
 * pass over the full set before deployment, with the outcome recorded in
 * `agent_activity` on the live platform. A `flagged` verdict on any of it is a
 * signal to rewrite, not to override.
 */

/** A finding as the engine emits one: computed, scored, classified, before any model sees it. */
function hashRateDrop(anchor: Date): Finding {
  return {
    id: 'fnd-hashrate',
    finding_type: 'anomaly',
    metric_key: 'hash_rate',
    metric_group: 'network',
    period: 'day',
    as_of: onDate(anchor, -3),
    window_days: 90,
    observed: -7.9,
    baseline: { mean: 0.2, sd: 3.1, p05: -4.8, p50: 0.1, p95: 5.2 },
    unusualness: 0.97,
    magnitude_norm: 0.62,
    persistence_periods: 1,
    direction: 'down',
    materiality: 0.71,
    compliance_class: 'informational',
    allowed_vocab: ['fell', 'declined', 'lower than'],
    narration_hint: {
      means: 'Network hash rate fell further in one day than it has on all but a handful of days in the trailing quarter.',
      noise_note: 'outside the normal daily band',
      // A single-period move in a noisy series. The narrator may report it and
      // may not conclude from it — which is the constraint the fixture exists
      // to make visible.
      verdict_allowed: false,
    },
    evidence_refs: ['onchain_observations/hash_rate'],
  };
}

function feeStreak(anchor: Date): Finding {
  return {
    id: 'fnd-fees',
    finding_type: 'streak',
    metric_key: 'mempool_fee_median',
    metric_group: 'network',
    period: 'day',
    as_of: onDate(anchor, -3),
    window_days: 90,
    observed: 4.0,
    baseline: { mean: 11.4, sd: 6.9, p05: 3.2, p50: 9.8, p95: 24.6 },
    unusualness: 0.81,
    magnitude_norm: 0.34,
    persistence_periods: 6,
    direction: 'flat_break',
    materiality: 0.58,
    compliance_class: 'informational',
    allowed_vocab: ['held', 'remained', 'sixth consecutive'],
    narration_hint: {
      means: 'Median transaction fees have stayed in the bottom decile of the trailing quarter for six days running.',
      noise_note: 'inside the normal daily band, but persistently at the low end',
      verdict_allowed: true,
    },
    evidence_refs: ['onchain_observations/mempool_fee_median'],
  };
}

function cpiRelease(anchor: Date): Finding {
  return {
    id: 'fnd-cpi',
    finding_type: 'inflection',
    metric_key: 'macro:au-cpi-trimmed-mean',
    metric_group: 'inflation',
    period: 'quarter',
    as_of: onDate(anchor, -3),
    window_days: 730,
    observed: -0.4,
    baseline: { mean: 0.1, sd: 0.3, p05: -0.3, p50: 0.1, p95: 0.5 },
    unusualness: 0.88,
    magnitude_norm: 0.45,
    persistence_periods: 3,
    direction: 'down',
    materiality: 0.66,
    compliance_class: 'informational',
    allowed_vocab: ['eased', 'third consecutive quarter', 'lower'],
    narration_hint: {
      means: 'Trimmed-mean inflation eased for a third consecutive quarter.',
      verdict_allowed: true,
    },
    evidence_refs: ['economic_observations/au-cpi-trimmed-mean'],
  };
}

function goldDivergence(anchor: Date): Finding {
  return {
    id: 'fnd-divergence',
    finding_type: 'divergence',
    metric_key: 'macro:aud-gold',
    secondary_metric_key: 'macro:aud-tweight',
    metric_group: 'currency',
    period: 'month',
    as_of: onDate(anchor, -3),
    window_days: 365,
    observed: 2.6,
    baseline: { mean: 0.4, sd: 1.1, p05: -1.4, p50: 0.3, p95: 2.2 },
    unusualness: 0.79,
    magnitude_norm: 0.29,
    persistence_periods: 2,
    direction: 'up',
    materiality: 0.52,
    compliance_class: 'valuation_sensitive',
    allowed_vocab: ['diverged', 'moved apart', 'while'],
    narration_hint: {
      means: 'The gold price in Australian dollars and the trade-weighted index moved apart by more than they usually do in a month.',
      noise_note: 'just outside the normal monthly band',
      verdict_allowed: false,
    },
    evidence_refs: ['economic_observations/aud-gold', 'economic_observations/aud-tweight'],
  };
}

/** A finding that was computed and scored below the floor. Never reaches the narrator. */
function belowFloor(anchor: Date): Finding {
  return {
    id: 'fnd-below-floor',
    finding_type: 'threshold',
    metric_key: 'macro:au-cash-rate',
    metric_group: 'rates',
    period: 'month',
    as_of: onDate(anchor, -1),
    window_days: 365,
    observed: 0,
    baseline: { mean: 0.02, sd: 0.09, p05: 0, p50: 0, p95: 0.25 },
    unusualness: 0.11,
    magnitude_norm: 0.0,
    persistence_periods: 9,
    direction: 'flat_break',
    materiality: 0.08,
    compliance_class: 'informational',
    allowed_vocab: ['unchanged'],
    narration_hint: {
      means: 'The cash rate was unchanged, as it has been for nine months.',
      verdict_allowed: true,
    },
    evidence_refs: ['economic_observations/au-cash-rate'],
  };
}

export function marketReports(anchor: Date): MarketReportDetail[] {
  return [
    {
      // ── The key screen. Nothing cleared the floor, and the system says so.
      id: 'mr-quiet',
      asOf: onDate(anchor, -1),
      status: 'published',
      narrationMarkdown: null,
      emailed: true,
      isQuietDay: true,
      // One finding was computed and scored, and came in under the materiality
      // floor. It is here rather than absent because "we looked and found
      // nothing worth telling you" is a different claim from "we did not look",
      // and the demo's whole point on this screen is which one the system makes.
      findings: [belowFloor(anchor)],
      priorFeedback: [],
    },
    {
      // ── The other side of the same boundary: what "material" looks like.
      id: 'mr-normal',
      asOf: onDate(anchor, -3),
      status: 'published',
      narrationMarkdown: [
        'Network hash rate fell 7.9% over the day, a larger single-day decline than all but a',
        'handful of days in the trailing quarter. One day is not a trend in a series this noisy,',
        'and this reads as a watch-item rather than a conclusion.',
        '',
        'Median transaction fees held in the bottom decile of the trailing quarter for a sixth',
        'consecutive day. Trimmed-mean inflation eased for a third consecutive quarter.',
        '',
        'The gold price in Australian dollars and the trade-weighted index moved apart by more',
        'than a typical month. The two series are related through several channels and this',
        'report does not attribute the gap to any of them.',
      ].join('\n'),
      emailed: true,
      isQuietDay: false,
      findings: [hashRateDrop(anchor), feeStreak(anchor), cpiRelease(anchor), goldDivergence(anchor)],
      priorFeedback: [
        {
          id: 'fb-1',
          verdict: 'positive',
          feedback: 'The hash rate paragraph saying outright that one day is not a trend is the right call. Keep doing that.',
          createdAt: onDate(anchor, -2),
        },
      ],
    },
    {
      // ── The refusal path: narration was written, failed review, was withheld.
      id: 'mr-held',
      asOf: onDate(anchor, -4),
      status: 'held',
      narrationMarkdown: [
        'Held before sending. The drafted narration drew a conclusion from a single-period move',
        'in a series whose finding was marked as not supporting one, and the compliance check',
        'flagged the wording as reading like a view rather than an observation.',
        '',
        'The email went without a narration section. The findings below are unchanged — they',
        'were computed before any of this and are not what failed.',
      ].join('\n'),
      emailed: true,
      isQuietDay: false,
      findings: [hashRateDrop(anchor)],
      priorFeedback: [],
    },
    {
      // ── The pipeline failing outright, which is a third thing again.
      id: 'mr-error',
      asOf: onDate(anchor, -5),
      status: 'error',
      narrationMarkdown: null,
      emailed: false,
      isQuietDay: false,
      findings: [],
      priorFeedback: [],
    },
  ];
}
