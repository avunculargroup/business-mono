/**
 * Adapter registry — keyed off indicator.provider so the workflow stays free of
 * provider conditionals. 'abs' is deferred (AU CPI is seeded is_active=false).
 */

import type { Provider, ProviderAdapter } from './types.js';
import { fredAdapter } from './adapters/fred.js';
import { rbaAdapter } from './adapters/rba.js';

export const adapterRegistry: Partial<Record<Provider, ProviderAdapter>> = {
  fred: fredAdapter,
  rba: rbaAdapter,
};

export function getAdapter(provider: Provider): ProviderAdapter | undefined {
  return adapterRegistry[provider];
}
