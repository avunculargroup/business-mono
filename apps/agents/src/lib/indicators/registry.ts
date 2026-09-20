/**
 * Adapter registry — keyed off indicator.provider so the workflow stays free of
 * provider conditionals.
 *
 * Every provider in the union now has an adapter. `abs` and `oecd` are
 * registered but unexercised: the two rows that use them are seeded
 * `is_active = false`, and the poll only reads active rows, so registering them
 * changes nothing until someone activates one. That is the intended order —
 * their SDMX parsing has never met a live response (see `adapters/sdmx.ts`), so
 * the first run of either is a verification step rather than an ingest.
 */

import type { Provider, ProviderAdapter } from './types.js';
import { fredAdapter } from './adapters/fred.js';
import { rbaAdapter } from './adapters/rba.js';
import { stooqAdapter } from './adapters/stooq.js';
import { goldApiAdapter } from './adapters/goldApi.js';
import { absAdapter } from './adapters/abs.js';
import { oecdAdapter } from './adapters/oecd.js';

export const adapterRegistry: Partial<Record<Provider, ProviderAdapter>> = {
  fred: fredAdapter,
  rba: rbaAdapter,
  stooq: stooqAdapter,
  gold_api: goldApiAdapter,
  abs: absAdapter,
  oecd: oecdAdapter,
};

export function getAdapter(provider: Provider): ProviderAdapter | undefined {
  return adapterRegistry[provider];
}
