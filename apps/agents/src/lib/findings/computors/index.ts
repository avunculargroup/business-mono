// Fan-out over the six type-computors. Pure: no LLM, no I/O. Findings leave
// here unscored; scoreAndSelect (materiality.ts) sets materiality and selects.
//
// One deterministic pass, deliberately NOT parallel workflow steps — the
// computors are pure functions and splitting them buys nothing.

import type { Finding } from '@platform/shared';
import type { FindingConfig } from '../config.js';
import type { ObservationBundle } from '../dataAccess.js';
import { computeAnomalies } from './anomaly.js';
import { computeDivergences } from './divergence.js';
import { computeInflections } from './inflection.js';
import { computeStreaks } from './streak.js';
import { computeThresholds } from './threshold.js';
import { computeStaleness } from './staleness.js';

export function computeFindings(bundle: ObservationBundle, config: FindingConfig): Finding[] {
  return [
    ...computeAnomalies(bundle, config),
    ...computeDivergences(bundle, config),
    ...computeInflections(bundle, config),
    ...computeStreaks(bundle, config),
    ...computeThresholds(bundle, config),
    ...computeStaleness(bundle, config),
  ];
}
