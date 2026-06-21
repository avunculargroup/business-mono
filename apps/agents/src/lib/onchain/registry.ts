/**
 * Adapter registry — keyed off indicator.provider so the workflow stays free of
 * provider conditionals. Mirrors lib/indicators/registry.ts.
 */

import type { OnchainAdapter, OnchainProvider } from './types.js';
import { mempoolAdapter } from './adapters/mempool.js';
import { coinmetricsAdapter } from './adapters/coinmetrics.js';

export const adapterRegistry: Partial<Record<OnchainProvider, OnchainAdapter>> = {
  mempool: mempoolAdapter,
  coinmetrics: coinmetricsAdapter,
};

export function getAdapter(provider: OnchainProvider): OnchainAdapter | undefined {
  return adapterRegistry[provider];
}
