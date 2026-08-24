import type { DashboardIndicators } from '@platform/data';
import { onDate } from './anchor';

/**
 * The indicator dashboard.
 *
 * Staged for one claim: **neutral delta colour.** The set carries deltas of
 * both signs, of similar magnitude, and they render identically — no green-up,
 * no red-down, no arrows. An Authorised Representative must not imply a
 * recommendation, and colouring a sign is that implication.
 *
 * That is why the set is deliberately mixed rather than convenient. A dashboard
 * where everything moved the same way cannot show the rule being followed; it
 * just happens not to break it.
 *
 * Values are illustrative and obviously so. There is no bitcoin price here and
 * no allocation figure anywhere — a price would invite exactly the reading the
 * neutral-delta rule exists to prevent.
 */
export function indicators(anchor: Date): DashboardIndicators {
  return {
    macroLatest: [
      {
        indicatorId: 'ind-cpi',
        name: 'Trimmed-mean inflation',
        shortLabel: 'CPI trimmed',
        category: 'inflation',
        region: 'AU',
        unit: '%',
        decimals: 1,
        periodDate: onDate(anchor, -52),
        periodGranularity: 'quarterly',
        releasedAt: onDate(anchor, -3),
        daysSinceRelease: 3,
        expectedNextRelease: onDate(anchor, 88),
        typicalReleaseGapDays: 91,
        currentValue: 3.2,
        priorValue: 3.6,
        // Down.
        changeSincePrior: -0.4,
        pctChangeSincePrior: -11.1,
        yearAgoPeriod: onDate(anchor, -417),
        yearAgoValue: 4.1,
        yoyChange: -0.9,
        yoyPctChange: -21.9,
        isRevision: false,
        supersededValue: null,
      },
      {
        indicatorId: 'ind-cash-rate',
        name: 'Cash rate target',
        shortLabel: 'Cash rate',
        category: 'rates',
        region: 'AU',
        unit: '%',
        decimals: 2,
        periodDate: onDate(anchor, -18),
        periodGranularity: 'monthly',
        releasedAt: onDate(anchor, -18),
        daysSinceRelease: 18,
        expectedNextRelease: onDate(anchor, 12),
        typicalReleaseGapDays: 42,
        currentValue: 3.6,
        priorValue: 3.6,
        // Flat. A zero delta has to render as neutrally as the others.
        changeSincePrior: 0,
        pctChangeSincePrior: 0,
        yearAgoPeriod: onDate(anchor, -383),
        yearAgoValue: 4.35,
        yoyChange: -0.75,
        yoyPctChange: -17.2,
        isRevision: false,
        supersededValue: null,
      },
      {
        indicatorId: 'ind-tweight',
        name: 'Trade-weighted index',
        shortLabel: 'TWI',
        category: 'currency',
        region: 'AU',
        unit: 'index',
        decimals: 1,
        periodDate: onDate(anchor, -1),
        periodGranularity: 'daily',
        releasedAt: onDate(anchor, -1),
        daysSinceRelease: 1,
        expectedNextRelease: onDate(anchor, 1),
        typicalReleaseGapDays: 1,
        currentValue: 61.4,
        priorValue: 60.2,
        // Up, and of comparable size to the CPI move. The pair is the point.
        changeSincePrior: 1.2,
        pctChangeSincePrior: 2.0,
        yearAgoPeriod: onDate(anchor, -366),
        yearAgoValue: 59.8,
        yoyChange: 1.6,
        yoyPctChange: 2.7,
        isRevision: false,
        supersededValue: null,
      },
      {
        indicatorId: 'ind-wpi',
        name: 'Wage price index',
        shortLabel: 'WPI',
        category: 'labour',
        region: 'AU',
        unit: '%',
        decimals: 1,
        periodDate: onDate(anchor, -60),
        periodGranularity: 'quarterly',
        releasedAt: onDate(anchor, -22),
        daysSinceRelease: 22,
        expectedNextRelease: onDate(anchor, 69),
        typicalReleaseGapDays: 91,
        currentValue: 3.4,
        priorValue: 3.5,
        changeSincePrior: -0.1,
        pctChangeSincePrior: -2.9,
        yearAgoPeriod: onDate(anchor, -425),
        yearAgoValue: 4.0,
        yoyChange: -0.6,
        yoyPctChange: -15.0,
        // A revision, so the surface can show that a restated number is marked
        // rather than silently replaced.
        isRevision: true,
        supersededValue: 3.5,
        },
    ],
    macroSeries: [
      { indicatorId: 'ind-cpi', shortLabel: 'CPI trimmed', periodDate: onDate(anchor, -417), releasedAt: onDate(anchor, -368), value: 4.1 },
      { indicatorId: 'ind-cpi', shortLabel: 'CPI trimmed', periodDate: onDate(anchor, -326), releasedAt: onDate(anchor, -277), value: 3.9 },
      { indicatorId: 'ind-cpi', shortLabel: 'CPI trimmed', periodDate: onDate(anchor, -235), releasedAt: onDate(anchor, -186), value: 3.8 },
      { indicatorId: 'ind-cpi', shortLabel: 'CPI trimmed', periodDate: onDate(anchor, -143), releasedAt: onDate(anchor, -94), value: 3.6 },
      { indicatorId: 'ind-cpi', shortLabel: 'CPI trimmed', periodDate: onDate(anchor, -52), releasedAt: onDate(anchor, -3), value: 3.2 },
      { indicatorId: 'ind-tweight', shortLabel: 'TWI', periodDate: onDate(anchor, -4), releasedAt: onDate(anchor, -4), value: 60.1 },
      { indicatorId: 'ind-tweight', shortLabel: 'TWI', periodDate: onDate(anchor, -3), releasedAt: onDate(anchor, -3), value: 60.6 },
      { indicatorId: 'ind-tweight', shortLabel: 'TWI', periodDate: onDate(anchor, -2), releasedAt: onDate(anchor, -2), value: 60.2 },
      { indicatorId: 'ind-tweight', shortLabel: 'TWI', periodDate: onDate(anchor, -1), releasedAt: onDate(anchor, -1), value: 61.4 },
    ],
    onchainLatest: [
      {
        key: 'hash_rate',
        name: 'Network hash rate',
        shortLabel: 'Hash rate',
        metricGroup: 'network',
        unit: 'EH/s',
        decimals: 0,
        observedAt: onDate(anchor, -1),
        daysSinceObserved: 1,
        value: 720,
        // Down sharply — the finding the normal report narrates.
        changeSincePrior: -62,
        pctChangeSincePrior: -7.9,
        // `signal` says what the relationship is, never what to do about it.
        signal: 'below_trend',
      },
      {
        key: 'mempool_fee_median',
        name: 'Median transaction fee',
        shortLabel: 'Median fee',
        metricGroup: 'network',
        unit: 'sat/vB',
        decimals: 1,
        observedAt: onDate(anchor, -1),
        daysSinceObserved: 1,
        value: 4.0,
        changeSincePrior: -0.3,
        pctChangeSincePrior: -7.0,
        signal: null,
      },
      {
        key: 'difficulty',
        name: 'Difficulty',
        shortLabel: 'Difficulty',
        metricGroup: 'network',
        unit: 'T',
        decimals: 1,
        observedAt: onDate(anchor, -6),
        daysSinceObserved: 6,
        value: 128.4,
        // Up. Same screen, opposite sign, identical rendering.
        changeSincePrior: 3.1,
        pctChangeSincePrior: 2.5,
        signal: null,
      },
    ],
    onchainSeries: [
      { indicatorId: 'ind-hash', key: 'hash_rate', shortLabel: 'Hash rate', observedAt: onDate(anchor, -5), value: 778 },
      { indicatorId: 'ind-hash', key: 'hash_rate', shortLabel: 'Hash rate', observedAt: onDate(anchor, -4), value: 791 },
      { indicatorId: 'ind-hash', key: 'hash_rate', shortLabel: 'Hash rate', observedAt: onDate(anchor, -3), value: 769 },
      { indicatorId: 'ind-hash', key: 'hash_rate', shortLabel: 'Hash rate', observedAt: onDate(anchor, -2), value: 782 },
      { indicatorId: 'ind-hash', key: 'hash_rate', shortLabel: 'Hash rate', observedAt: onDate(anchor, -1), value: 720 },
      { indicatorId: 'ind-fee', key: 'mempool_fee_median', shortLabel: 'Median fee', observedAt: onDate(anchor, -2), value: 4.3 },
      { indicatorId: 'ind-fee', key: 'mempool_fee_median', shortLabel: 'Median fee', observedAt: onDate(anchor, -1), value: 4.0 },
    ],
  };
}
