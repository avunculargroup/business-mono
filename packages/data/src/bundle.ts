/**
 * The repository bundle: the object an app holds instead of a database client.
 */
import type { AgentActivityRepository } from './repositories/agentActivity';
import type { CampaignRepository } from './repositories/campaigns';
import type { CompanyRepository } from './repositories/companies';
import type { ContentRepository } from './repositories/content';
import type { EcosystemRepository } from './repositories/ecosystem';
import type { IndicatorsRepository } from './repositories/indicators';
import type { MarketReportRepository } from './repositories/marketReports';
import type { ResearchRepository } from './repositories/research';

/**
 * Which adapter produced this bundle.
 *
 * Drives chrome and copy only. If a component branches on `mode` to change
 * anything else, the apps have started to diverge and the seam has failed —
 * grep for it during review. With a client app as a third consumer this rule
 * gets stricter, not looser: a client app must differ by scope, never by
 * branch.
 */
export type RepositoryMode = 'live' | 'demo' | 'client';

/**
 * Who a bundle is constructed for. The scoping rule in `context.ts` means this
 * is the *only* place scope enters: an adapter factory takes a principal and
 * returns a bundle that cannot see rows outside it, so a caller has no way to
 * ask the wrong question.
 *
 * Only the internal team principal exists today. A `client` variant becomes a
 * second member of this union if and when the client app firms up; nothing in
 * the seam has to change for that, which is the whole point of settling the
 * rule before the verticals landed.
 */
export interface Principal {
  kind: 'team';
  userId: string;
}

/**
 * Domains are added here one vertical at a time, alongside their
 * implementation in `@platform/data-supabase` and their conversion in
 * `apps/web`. Keeping the interface in step with the adapters means the app
 * compiles at every commit rather than carrying a half-migrated bundle.
 */
export interface RepositoryBundle {
  agentActivity: AgentActivityRepository;
  research: ResearchRepository;
  content: ContentRepository;
  campaigns: CampaignRepository;
  companies: CompanyRepository;
  marketReports: MarketReportRepository;
  indicators: IndicatorsRepository;
  ecosystem: EcosystemRepository;
  mode: RepositoryMode;
}
