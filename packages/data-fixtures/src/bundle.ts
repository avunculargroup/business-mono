import type { DemoBundle } from '@platform/data';
import { createAgentActivityRepository } from './repositories/agentActivity';
import { createCompanyRepository } from './repositories/companies';
import { createContentRepository } from './repositories/content';
import { createEcosystemRepository } from './repositories/ecosystem';
import { createIndicatorsRepository } from './repositories/indicators';
import { createMarketReportRepository } from './repositories/marketReports';
import { createResearchRepository } from './repositories/research';

/**
 * The demo's bundle.
 *
 * Two things are absent by design and both are load-bearing:
 *
 * - **No client, no principal.** The live factory takes both; there is nothing
 *   here to scope and nothing to connect to. That is the whole point of the
 *   seam — the demo differs by data source, not by branching.
 * - **No `campaigns`.** The return type is `DemoBundle`, the seven domains the
 *   demo renders. A demo route reaching for `campaigns` is a compile error
 *   rather than a stub that throws at runtime, which is what the splittable
 *   bundle in `@platform/data` bought.
 */
export function createFixtureRepositories(): DemoBundle {
  return {
    agentActivity: createAgentActivityRepository(),
    research: createResearchRepository(),
    content: createContentRepository(),
    companies: createCompanyRepository(),
    marketReports: createMarketReportRepository(),
    indicators: createIndicatorsRepository(),
    ecosystem: createEcosystemRepository(),
    mode: 'demo',
  };
}
