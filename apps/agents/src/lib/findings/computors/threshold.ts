// Threshold crossing: a named, pre-registered level is crossed. Levels live in
// finding_thresholds; the one dynamic level (btc_price_usd through its 200-week
// MA) is computed here against the loaded series. Pure.
//
// Threshold findings carry the seed row's compliance_class — the
// valuation_sensitive ones are exactly the "framing as a buy/sell signal"
// landmines that route the narration through Lex.

import type { Finding } from '@platform/shared';
import type { ComplianceClass } from '@platform/shared';
import type { FindingConfig, ThresholdRow } from '../config.js';
import type { MetricSeries, ObservationBundle } from '../dataAccess.js';
import { baselineOf, sd } from '../stats.js';
import { clamp01, evidenceRefs, findingId, isFresh, UNSCORED, verdictAllowed, vocabFor, volClassFor } from './shared.js';

interface Crossing {
  series: MetricSeries;
  levelName: string;
  levelValue: number;
  complianceClass: ComplianceClass;
  prior: number;
  latest: number;
  priorDate: string;
  latestDate: string;
}

function detectCross(series: MetricSeries, row: Pick<ThresholdRow, 'level_value' | 'cross_direction'>): 'up' | 'down' | null {
  const n = series.points.length;
  if (n < 2) return null;
  const prior = series.points[n - 2].value;
  const latest = series.points[n - 1].value;
  const level = row.level_value;

  const crossedUp = prior < level && latest >= level;
  const crossedDown = prior > level && latest <= level;
  if (crossedUp && row.cross_direction !== 'down') return 'up';
  if (crossedDown && row.cross_direction !== 'up') return 'down';
  return null;
}

function toFinding(crossing: Crossing, direction: 'up' | 'down', config: FindingConfig, asOf: string): Finding {
  const { series } = crossing;
  const windowValues = series.points.slice(-90).map((p) => p.value);
  const baseline = baselineOf(windowValues.slice(0, -1));
  const spread = sd(windowValues.slice(0, -1));
  const volClass = volClassFor(config, series.group);

  return {
    id: findingId('threshold', series.key, asOf, crossing.levelName.replace(/\s+/g, '_')),
    finding_type: 'threshold',
    metric_key: series.key,
    metric_group: series.group,
    period: 'day',
    as_of: crossing.latestDate,
    window_days: 90,
    // The level-relative position at the cross.
    observed: crossing.latest,
    baseline,
    // Pre-registered levels are inherently notable — the cross event itself is
    // the story, not its distance from the median.
    unusualness: 0.9,
    magnitude_norm: spread > 0 ? clamp01(Math.abs(crossing.latest - crossing.levelValue) / spread) : 0.5,
    persistence_periods: 1,
    direction,
    materiality: UNSCORED,
    compliance_class: crossing.complianceClass,
    allowed_vocab: vocabFor(config, series.group),
    narration_hint: {
      means:
        `${series.label} crossed ${direction === 'up' ? 'above' : 'below'} ` +
        `the ${crossing.levelName} level (${crossing.levelValue}), now at ${crossing.latest.toFixed(2)}`,
      verdict_allowed: verdictAllowed(1, volClass),
    },
    evidence_refs: evidenceRefs(series, [crossing.priorDate, crossing.latestDate]),
  };
}

export function computeThresholds(bundle: ObservationBundle, config: FindingConfig): Finding[] {
  const findings: Finding[] = [];

  for (const row of config.thresholds) {
    const series = bundle.series[row.metric_key];
    if (!series || series.points.length < 2) continue;
    const latestPoint = series.points[series.points.length - 1];
    if (!isFresh(latestPoint.date, bundle.asOf, 2)) continue;

    const direction = detectCross(series, row);
    if (!direction) continue;

    findings.push(
      toFinding(
        {
          series,
          levelName: row.level_name,
          levelValue: row.level_value,
          complianceClass: row.compliance_class,
          prior: series.points[series.points.length - 2].value,
          latest: latestPoint.value,
          priorDate: series.points[series.points.length - 2].date,
          latestDate: latestPoint.date,
        },
        direction,
        config,
        bundle.asOf,
      ),
    );
  }

  // Dynamic threshold: btc_price_usd through its 200-week moving average. The
  // level moves daily, so compare each day's close to that day's ma_200w.
  const price = bundle.series['btc_price_usd'];
  const ma200w = bundle.series['ma_200w'];
  if (price && ma200w && price.points.length >= 2) {
    const maByDate = new Map(ma200w.points.map((p) => [p.date, p.value]));
    const n = price.points.length;
    const latest = price.points[n - 1];
    const prior = price.points[n - 2];
    const maLatest = maByDate.get(latest.date);
    const maPrior = maByDate.get(prior.date);
    if (maLatest != null && maPrior != null && isFresh(latest.date, bundle.asOf, 2)) {
      const crossedUp = prior.value < maPrior && latest.value >= maLatest;
      const crossedDown = prior.value > maPrior && latest.value <= maLatest;
      if (crossedUp || crossedDown) {
        findings.push(
          toFinding(
            {
              series: price,
              levelName: '200-week MA',
              levelValue: maLatest,
              complianceClass: 'valuation_sensitive',
              prior: prior.value,
              latest: latest.value,
              priorDate: prior.date,
              latestDate: latest.date,
            },
            crossedUp ? 'up' : 'down',
            config,
            bundle.asOf,
          ),
        );
      }
    }
  }

  return findings;
}
