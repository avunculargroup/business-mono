export {
  READ_CONTEXT_KEYS,
  READ_CONTEXT_KEYS_ARE_EXHAUSTIVE,
  type Paginated,
  type QueryOptions,
  type ReadContext,
} from './context';
export { DemoWriteBlockedError, NotFoundError } from './errors';
export type { Principal, RepositoryBundle, RepositoryMode } from './bundle';
export type {
  ActivityStatus,
  AgentActivityFilter,
  AgentActivityItem,
  AgentActivityRepository,
  ProposedAction,
} from './repositories/agentActivity';
export type {
  CampaignAccount,
  CampaignBeat,
  CampaignCadence,
  CampaignDetail,
  CampaignGate,
  CampaignGateDecision,
  CampaignMatrixRow,
  CampaignOverview,
  CampaignRepository,
  CampaignStrategy,
  Gate1State,
  Gate2State,
  NewCampaignDraft,
  NewVoiceSnippet,
  PostMetrics,
  PlannedBeat,
  PublishedPost,
  PublishedPostMetrics,
  ReadyToPostItem,
  ReadyToPostQueue,
  ScheduleEntry,
  SchedulePlan,
  VariantCopy,
  VariantGateDecision,
  VariantReview,
} from './repositories/campaigns';
export type {
  ContentCard,
  ContentDetail,
  ContentEditGuard,
  ContentRepository,
  DraftFeedbackEntry,
  NewContentItem,
  PublishGate,
  SocialDraftCopy,
  ThreadSegment,
} from './repositories/content';
export type {
  MarketReportDetail,
  MarketReportRepository,
  MarketReportStatus,
  MarketReportSummary,
  ReportFeedbackEntry,
} from './repositories/marketReports';
export type {
  NewsDigestItem,
  NewsFeedItem,
  NewsItemDetail,
  NewsReport,
  ReportFileRef,
  ResearchRepository,
} from './repositories/research';

// The React provider is deliberately NOT re-exported here. It is a .tsx module,
// and adapters like @platform/data-supabase have no React and no `jsx` setting —
// re-exporting it from the root made their `tsc --noEmit` fail on JSX they never
// asked for. Import it from '@platform/data/provider'.
