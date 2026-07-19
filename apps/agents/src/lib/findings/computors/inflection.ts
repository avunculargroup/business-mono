// Inflection: a trend changes sign after a run, a forecast crosses zero, or the
// Hash Ribbons state flips. The STORY is the turn, which a level-based report
// can never see. Pure.
//
// The hash-ribbons state transition is the only finding whose allowed_vocab
// carries "capitulation"/"recovery" — the structural lock that stops an 8%
// overnight hash-rate anomaly being narrated as capitulation.

import type { Finding } from '@platform/shared';
import type { FindingConfig } from '../config.js';
import type { ObservationBundle } from '../dataAccess.js';
import { baselineOf, periodDeltas, unusualnessOf, type PeriodDelta } from '../stats.js';
import {
  clamp01,
  evidenceRefs,
  findingId,
  isFresh,
  resolutionFor,
  UNSCORED,
  verdictAllowed,
  vocabFor,
  volClassFor,
} from './shared.js';

// Series where a run-end is a story. Curated: a turn in sentiment, momentum,
// drawdown, the 50/200 spread, or the difficulty forecast.
const RUN_KEYS = ['fear_greed', 'rsi_14', 'drawdown_from_high', 'ma_cross'] as const;

// A run must be at least this long before its end is an inflection.
const MIN_RUN_DAILY = 5;
const MIN_RUN_PERIODIC = 3;

/** Completed same-sign run lengths in a delta list (for the baseline). */
function runLengths(deltas: PeriodDelta[]): number[] {
  const runs: number[] = [];
  let current = 0;
  let sign = 0;
  for (const d of deltas) {
    const s = Math.sign(d.abs);
    if (s === 0) continue;
    if (s === sign) current += 1;
    else {
      if (current > 0) runs.push(current);
      sign = s;
      current = 1;
    }
  }
  if (current > 0) runs.push(current);
  return runs;
}

function runEndFindings(bundle: ObservationBundle, config: FindingConfig): Finding[] {
  const findings: Finding[] = [];

  for (const key of RUN_KEYS) {
    const series = bundle.series[key];
    if (!series) continue;

    const resolution = resolutionFor(series);
    const deltas = periodDeltas(series.points, resolution).slice(-(resolution.windowPeriods + 1));
    const minRun = resolution.period === 'day' ? MIN_RUN_DAILY : MIN_RUN_PERIODIC;
    if (deltas.length < minRun + 2) continue;

    const latest = deltas[deltas.length - 1];
    if (!isFresh(latest.date, bundle.asOf, resolution.period === 'day' ? 2 : 45)) continue;

    const latestSign = Math.sign(latest.abs);
    if (latestSign === 0) continue;

    // Count the run that the latest delta just ended.
    let endedRun = 0;
    for (let i = deltas.length - 2; i >= 0; i--) {
      const s = Math.sign(deltas[i].abs);
      if (s === 0 || s === latestSign) break;
      endedRun += 1;
    }
    if (endedRun < minRun) continue;

    const historicalRuns = runLengths(deltas.slice(0, -1));
    const baseline = baselineOf(historicalRuns);
    const volClass = volClassFor(config, series.group);
    const periodWord = resolution.period === 'day' ? 'day' : resolution.period;
    const turnedUp = latestSign > 0;

    findings.push({
      id: findingId('inflection', series.key, bundle.asOf),
      finding_type: 'inflection',
      metric_key: series.key,
      metric_group: series.group,
      period: resolution.period,
      as_of: latest.date,
      window_days: resolution.windowDays,
      // The run length that just ended — the turn is the story.
      observed: endedRun,
      baseline,
      unusualness: unusualnessOf(historicalRuns, endedRun),
      // A fortnight-long daily run (or two quarters) ending = a full-size turn.
      magnitude_norm: clamp01(endedRun / (resolution.period === 'day' ? 14 : 6)),
      persistence_periods: 1, // the turn itself is always one period old
      direction: turnedUp ? 'up' : 'down',
      materiality: UNSCORED,
      compliance_class: 'informational',
      allowed_vocab: vocabFor(config, series.group),
      narration_hint: {
        means:
          `${series.label} turned ${turnedUp ? 'up' : 'down'} after ` +
          `${endedRun} consecutive ${periodWord}s moving the other way`,
        verdict_allowed: verdictAllowed(1, volClass),
      },
      evidence_refs: evidenceRefs(series, [latest.date]),
    });
  }

  return findings;
}

// The difficulty-adjustment forecast crossing zero is a lead signal (an
// adjustment loading), handled here rather than as a divergence.
function difficultyZeroCross(bundle: ObservationBundle, config: FindingConfig): Finding[] {
  const series = bundle.series['next_difficulty_adjustment'];
  if (!series || series.points.length < 2) return [];

  const latest = series.points[series.points.length - 1];
  const prior = series.points[series.points.length - 2];
  if (!isFresh(latest.date, bundle.asOf, 2)) return [];
  if (Math.sign(latest.value) === Math.sign(prior.value) || Math.sign(latest.value) === 0) return [];

  const windowValues = series.points.slice(-90).map((p) => p.value);
  const turnedUp = latest.value > 0;

  return [
    {
      id: findingId('inflection', series.key, bundle.asOf),
      finding_type: 'inflection',
      metric_key: series.key,
      metric_group: series.group,
      period: 'day',
      as_of: latest.date,
      window_days: 90,
      observed: latest.value,
      baseline: baselineOf(windowValues),
      unusualness: unusualnessOf(windowValues, latest.value),
      magnitude_norm: clamp01(Math.abs(latest.value) / 5), // a ±5% forecast is a full-size move
      persistence_periods: 1,
      direction: turnedUp ? 'up' : 'down',
      materiality: UNSCORED,
      compliance_class: 'informational',
      allowed_vocab: vocabFor(config, series.group),
      narration_hint: {
        means:
          `The next difficulty adjustment forecast crossed ${turnedUp ? 'above' : 'below'} zero, ` +
          `now tracking ${latest.value.toFixed(1)}%`,
        verdict_allowed: verdictAllowed(1, volClassFor(config, series.group)),
      },
      evidence_refs: evidenceRefs(series, [prior.date, latest.date]),
    },
  ];
}

// Hash Ribbons state transition — the ONLY source of 'capitulation'/'recovery'
// vocabulary. Fires only when the state actually changed at the latest point.
function hashRibbonsTransition(bundle: ObservationBundle, config: FindingConfig): Finding[] {
  const ribbons = bundle.hashRibbons;
  if (ribbons.length < 2) return [];

  const latest = ribbons[ribbons.length - 1];
  const prior = ribbons[ribbons.length - 2];
  if (!isFresh(latest.date, bundle.asOf, 2)) return [];
  if (latest.signal === prior.signal) return [];
  if (latest.signal !== 'capitulation' && latest.signal !== 'recovery') return [];

  const spreads = ribbons.slice(-90).map((r) => r.spreadPct);
  const group = 'network_security';

  return [
    {
      id: findingId('inflection', 'hash_ribbons', bundle.asOf),
      finding_type: 'inflection',
      metric_key: 'hash_ribbons',
      metric_group: group,
      period: 'day',
      as_of: latest.date,
      window_days: 90,
      // The 30d/60d MA spread at the flip.
      observed: latest.spreadPct,
      baseline: baselineOf(spreads.slice(0, -1)),
      unusualness: unusualnessOf(spreads.slice(0, -1), latest.spreadPct),
      magnitude_norm: clamp01(Math.abs(latest.spreadPct) / 5),
      persistence_periods: 1,
      direction: latest.signal === 'recovery' ? 'up' : 'down',
      materiality: UNSCORED,
      compliance_class: 'valuation_sensitive',
      // The lock: the state word is permitted here, and only here, because the
      // derived condition state is actually present.
      allowed_vocab: [...vocabFor(config, group), latest.signal],
      narration_hint: {
        means:
          latest.signal === 'capitulation'
            ? `Hash Ribbons flipped to capitulation: the 30-day hash-rate average crossed below the 60-day`
            : `Hash Ribbons flipped to recovery: the 30-day hash-rate average crossed back above the 60-day`,
        verdict_allowed: true, // the derived condition state is present
      },
      evidence_refs: [`view:v_hash_ribbons`, `key:hash_ribbons`, `date:${prior.date}`, `date:${latest.date}`],
    },
  ];
}

export function computeInflections(bundle: ObservationBundle, config: FindingConfig): Finding[] {
  return [
    ...runEndFindings(bundle, config),
    ...difficultyZeroCross(bundle, config),
    ...hashRibbonsTransition(bundle, config),
  ];
}
