import type { Principal, RepositoryBundle } from '@platform/data';
import { createAdapterContext, type PlatformSupabaseClient } from './adapterContext';
import { createAgentActivityRepository } from './repositories/agentActivity';
import { createCampaignRepository } from './repositories/campaigns';
import { createCompanyRepository } from './repositories/companies';
import { createContentRepository } from './repositories/content';
import { createCorporateHoldingsRepository } from './repositories/corporateHoldings';
import { createEcosystemRepository } from './repositories/ecosystem';
import { createIndicatorsRepository } from './repositories/indicators';
import { createMarketReportRepository } from './repositories/marketReports';
import { createResearchRepository } from './repositories/research';

/**
 * Builds a bundle scoped to `principal`.
 *
 * The principal is bound here and nowhere else. No repository method takes a
 * scoping argument, so a caller holding this bundle has no way to ask for data
 * outside it — which is what lets a differently-scoped consumer be a different
 * construction rather than a signature change across every repository.
 *
 * Domains are added as their verticals land.
 */
export function createSupabaseRepositories(
  client: PlatformSupabaseClient,
  principal: Principal,
): RepositoryBundle {
  const adapter = createAdapterContext(client, principal);

  return {
    agentActivity: createAgentActivityRepository(adapter),
    research: createResearchRepository(adapter),
    content: createContentRepository(adapter),
    campaigns: createCampaignRepository(adapter),
    companies: createCompanyRepository(adapter),
    corporateHoldings: createCorporateHoldingsRepository(adapter),
    marketReports: createMarketReportRepository(adapter),
    indicators: createIndicatorsRepository(adapter),
    ecosystem: createEcosystemRepository(adapter),
    mode: 'live',
  };
}
