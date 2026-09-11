/**
 * The live adapter. Domain implementations land one vertical at a time, each
 * composed over a `SupabaseAdapterContext`.
 */
export {
  createAdapterContext,
  resolveReadContext,
  type PlatformSupabaseClient,
  type SupabaseAdapterContext,
} from './adapterContext';
export { createSupabaseRepositories } from './bundle';
export {
  createAgentActivityRepository,
  toAgentActivityItem,
} from './repositories/agentActivity';
export { createCampaignRepository } from './repositories/campaigns';
export { createCompanyRepository } from './repositories/companies';
export { createContentRepository } from './repositories/content';
export { createEcosystemRepository } from './repositories/ecosystem';
export { createIndicatorsRepository } from './repositories/indicators';
export { createMarketReportRepository } from './repositories/marketReports';
export { createResearchRepository } from './repositories/research';

/**
 * The client adapter. A different scope over the same database, not a different
 * database — `apps/client` composes this instead of `createSupabaseRepositories`.
 */
export {
  createClientAdapterContext,
  requireDisclosure,
  DisclosureRequiredError,
  type ClientAdapterContext,
  type ClientSupabaseClient,
} from './client/context';
export { createClientRepositories } from './client/bundle';
export { FACT_SOURCES, KNOWN_FACT_KEYS, type FactSource } from './client/facts';
