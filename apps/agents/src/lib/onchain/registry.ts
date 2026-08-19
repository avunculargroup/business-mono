/**
 * Adapter registry — keyed off indicator.provider so the workflow stays free of
 * provider conditionals. Mirrors lib/indicators/registry.ts.
 */

import type { OnchainAdapter, OnchainProvider } from './types.js';
import { mempoolAdapter } from './adapters/mempool.js';
import { coinmetricsAdapter } from './adapters/coinmetrics.js';
import { coingeckoAdapter } from './adapters/coingecko.js';
import { alternativeMeAdapter } from './adapters/alternativeMe.js';
import { bgeometricsAdapter } from './adapters/bgeometrics.js';
import { sosovalueAdapter } from './adapters/sosovalue.js';

export const adapterRegistry: Partial<Record<OnchainProvider, OnchainAdapter>> = {
  mempool: mempoolAdapter,
  coinmetrics: coinmetricsAdapter,
  coingecko: coingeckoAdapter,
  alternative_me: alternativeMeAdapter,
  bgeometrics: bgeometricsAdapter,
  sosovalue: sosovalueAdapter,
};

export function getAdapter(provider: OnchainProvider): OnchainAdapter | undefined {
  return adapterRegistry[provider];
}
