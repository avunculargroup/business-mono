import type { ReadContext } from '../context';

/**
 * A macro indicator's latest release, from `v_indicator_latest`.
 *
 * **No direction, colour or sentiment.** The model carries signed numbers —
 * `changeSincePrior`, `pctChangeSincePrior`, `yoyChange` — and stops there.
 * Whether a rise is rendered with an up arrow is presentation, and whether it
 * is *good* is not this platform's to say: an AR must not imply a
 * recommendation, so "green up, red down" is a compliance decision rather than
 * a style preference. Keeping the sentiment out of the data layer is what stops
 * a future component quietly reintroducing it. See
 * `repository-contract.md` § Repository interfaces.
 */
export interface IndicatorLatest {
  indicatorId: string | null;
  name: string | null;
  shortLabel: string | null;
  category: string | null;
  region: string | null;
  unit: string | null;
  decimals: number | null;
  periodDate: string | null;
  periodGranularity: string | null;
  releasedAt: string | null;
  daysSinceRelease: number | null;
  expectedNextRelease: string | null;
  typicalReleaseGapDays: number | null;
  currentValue: number | null;
  priorValue: number | null;
  changeSincePrior: number | null;
  pctChangeSincePrior: number | null;
  yearAgoPeriod: string | null;
  yearAgoValue: number | null;
  yoyChange: number | null;
  yoyPctChange: number | null;
  isRevision: boolean | null;
  supersededValue: number | null;
}

/** One point of a macro indicator's history, for a sparkline. */
export interface IndicatorSeriesPoint {
  indicatorId: string | null;
  shortLabel: string | null;
  periodDate: string | null;
  releasedAt: string | null;
  value: number | null;
}

/**
 * An on-chain metric's latest observation, from `v_onchain_dashboard`.
 *
 * `signal` is a neutral *state* — what the relationship is, never what to do
 * about it. The same rule as the deltas above applies to it.
 */
export interface OnchainLatest {
  key: string | null;
  name: string | null;
  shortLabel: string | null;
  metricGroup: string | null;
  unit: string | null;
  decimals: number | null;
  observedAt: string | null;
  daysSinceObserved: number | null;
  value: number | null;
  changeSincePrior: number | null;
  pctChangeSincePrior: number | null;
  signal: string | null;
}

/** One point of an on-chain metric's history, for a sparkline. */
export interface OnchainSeriesPoint {
  indicatorId: string | null;
  key: string | null;
  shortLabel: string | null;
  observedAt: string | null;
  value: number | null;
}

/**
 * The dashboard's indicator block.
 *
 * One method rather than four: the four views are read together, rendered
 * together, and useless apart — a latest row with no series has no sparkline
 * and a series with no latest row has nothing to label it.
 */
export interface DashboardIndicators {
  macroLatest: IndicatorLatest[];
  macroSeries: IndicatorSeriesPoint[];
  onchainLatest: OnchainLatest[];
  onchainSeries: OnchainSeriesPoint[];
}

export interface IndicatorsRepository {
  getDashboard(ctx: ReadContext): Promise<DashboardIndicators>;
}
