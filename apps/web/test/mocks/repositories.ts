import { vi, type Mock } from 'vitest';
import type {
  AgentActivityItem,
  CampaignDetail,
  CampaignGate,
  CompanyContact,
  CompanyDetail,
  CompanySummary,
  MarketReportDetail,
  MarketReportSummary,
  ContentDetail,
  EcosystemWatch,
  NewsDigestItem,
  NewsFeedItem,
  NewsItemDetail,
  PublishGate,
  RepositoryBundle,
} from '@platform/data';

/**
 * A repository bundle whose methods are plain spies.
 *
 * This replaces `test/mocks/supabase.ts` for converted surfaces, and it is a
 * much smaller thing to mock: a test says what a read returns instead of
 * describing a chain of query-builder calls, so it asserts the page's behaviour
 * rather than restating its SQL. Query wiring is tested once, in
 * `@platform/data-supabase`, against the contract suite.
 *
 * Domains are added as their verticals land, matching `RepositoryBundle`.
 */
export type FakeRepositories = {
  agentActivity: { [K in keyof RepositoryBundle['agentActivity']]: Mock };
  research: { [K in keyof RepositoryBundle['research']]: Mock };
  content: { [K in keyof RepositoryBundle['content']]: Mock };
  campaigns: { [K in keyof RepositoryBundle['campaigns']]: Mock };
  companies: { [K in keyof RepositoryBundle['companies']]: Mock };
  marketReports: { [K in keyof RepositoryBundle['marketReports']]: Mock };
  indicators: { [K in keyof RepositoryBundle['indicators']]: Mock };
  ecosystem: { [K in keyof RepositoryBundle['ecosystem']]: Mock };
  mode: RepositoryBundle['mode'];
};

export function createFakeRepositories(
  overrides: {
    activity?: AgentActivityItem[];
    pendingCount?: number;
    news?: NewsFeedItem[];
    digest?: NewsDigestItem[];
    newsItem?: NewsItemDetail;
    publishGate?: PublishGate | null;
    campaignGate?: CampaignGate | null;
    campaignDetail?: CampaignDetail | null;
    companies?: CompanySummary[];
    company?: CompanyDetail | null;
    companyContacts?: CompanyContact[];
    marketReports?: MarketReportSummary[];
    marketReport?: MarketReportDetail | null;
    /** Null means the change is gone; a null complianceClass means unclassified. */
    promotionGate?: { complianceClass: string | null } | null;
    contentDetail?: ContentDetail | null;
  } = {},
): FakeRepositories {
  const items = overrides.activity ?? [];
  const news = overrides.news ?? [];

  return {
    agentActivity: {
      listActivity: vi.fn(async () => ({
        items,
        total: items.length,
        hasMore: false,
      })),
      countPending: vi.fn(async () => overrides.pendingCount ?? 0),
      approveActivity: vi.fn(async () => undefined),
    },
    research: {
      listItems: vi.fn(async () => ({
        items: news,
        total: news.length,
        hasMore: false,
      })),
      listTodayDigest: vi.fn(async () => overrides.digest ?? []),
      getItem: vi.fn(async () => overrides.newsItem ?? fakeNewsItemDetail()),
      getReportFile: vi.fn(async () => ({ storagePath: null, fileName: null })),
      setItemStatus: vi.fn(async () => undefined),
      setReportCuratorNote: vi.fn(async () => undefined),
      promoteItem: vi.fn(async () => undefined),
    },
    content: {
      listCards: vi.fn(async () => ({ items: [], total: 0, hasMore: false })),
      getDetail: vi.fn(async () => overrides.contentDetail ?? fakeContentDetail()),
      getSocialDraftCopy: vi.fn(async () => null),
      getPublishGate: vi.fn(async () =>
        overrides.publishGate === undefined ? fakePublishGate() : overrides.publishGate,
      ),
      getEditGuard: vi.fn(async () => ({
        status: 'draft' as const,
        isThread: false,
        isPublishLocked: false,
      })),
      createItem: vi.fn(async () => undefined),
      updateBody: vi.fn(async () => undefined),
      setStatus: vi.fn(async () => undefined),
      schedule: vi.fn(async () => undefined),
      addDraftFeedback: vi.fn(async () => true),
    },
    campaigns: {
      listOverview: vi.fn(async () => []),
      listAccounts: vi.fn(async () => []),
      getDetail: vi.fn(async () => overrides.campaignDetail ?? null),
      getReadyToPost: vi.fn(async () => null),
      getVariantReview: vi.fn(async () => null),
      getGate: vi.fn(async () =>
        overrides.campaignGate === undefined ? fakeCampaignGate() : overrides.campaignGate,
      ),
      setCampaignDecision: vi.fn(async () => undefined),
      setVariantDecision: vi.fn(async () => undefined),
      createDraft: vi.fn(async () => 'camp-new'),
      saveCadenceAndLaunch: vi.fn(async () => undefined),
      markVariantPosted: vi.fn(async () => true),
      saveVariantCopy: vi.fn(async () => true),
      savePostMetrics: vi.fn(async () => undefined),
      promoteToVoiceSnippet: vi.fn(async () => undefined),
    },
    companies: {
      listCompanies: vi.fn(async () => {
        const rows = overrides.companies ?? [];
        return { items: rows, total: rows.length, hasMore: false };
      }),
      getCompany: vi.fn(async () =>
        overrides.company === undefined ? fakeCompany() : overrides.company,
      ),
      listCompanyContacts: vi.fn(async () => overrides.companyContacts ?? []),
      listCompanyOptions: vi.fn(async () => []),
      createCompany: vi.fn(async () => fakeCompanySummary()),
      updateCompany: vi.fn(async () => undefined),
      deleteCompany: vi.fn(async () => undefined),
    },
    marketReports: {
      listReports: vi.fn(async () => {
        const reports = overrides.marketReports ?? [];
        return { items: reports, total: reports.length, hasMore: false };
      }),
      getReport: vi.fn(async () =>
        overrides.marketReport === undefined ? fakeMarketReport() : overrides.marketReport,
      ),
      addReportFeedback: vi.fn(async () => true),
    },
    indicators: {
      getDashboard: vi.fn(async () => ({
        macroLatest: [],
        macroSeries: [],
        onchainLatest: [],
        onchainSeries: [],
      })),
    },
    ecosystem: {
      listFeed: vi.fn(async () => []),
      listWatchHealth: vi.fn(async () => []),
      getPromotionGate: vi.fn(async () =>
        overrides.promotionGate === undefined
          ? { complianceClass: 'neutral' }
          : overrides.promotionGate,
      ),
      acknowledgeChange: vi.fn(async () => undefined),
      setChangeStatus: vi.fn(async () => undefined),
      pinChange: vi.fn(async () => undefined),
      setCuratorNote: vi.fn(async () => undefined),
      setClientRelevant: vi.fn(async () => undefined),
      createWatch: vi.fn(async () => fakeWatch()),
      updateWatch: vi.fn(async () => undefined),
      setWatchEnabled: vi.fn(async () => undefined),
      deleteWatch: vi.fn(async () => undefined),
    },
    mode: 'live',
  };
}

/** A draft with no thread, no feedback and no platform limit. */
export function fakeContentDetail(overrides: Partial<ContentDetail> = {}): ContentDetail {
  return {
    id: 'c1',
    title: 'Why treasuries hold Bitcoin',
    type: 'linkedin',
    status: 'draft',
    body: 'A draft body.',
    isThread: false,
    socialAccountId: null,
    scheduledFor: null,
    publishedAt: null,
    publishError: null,
    createdAt: '2026-08-19T00:00:00Z',
    updatedAt: '2026-08-19T00:00:00Z',
    threadSegments: [],
    priorFeedback: [],
    maxChars: null,
    ...overrides,
  };
}

/** A published report on a normal day, with one finding behind it. */
export function fakeMarketReport(
  overrides: Partial<MarketReportDetail> = {},
): MarketReportDetail {
  return {
    id: 'mr-1',
    asOf: '2026-07-18',
    status: 'published',
    narrationMarkdown: 'Hash rate fell 8% overnight.',
    emailed: true,
    isQuietDay: false,
    findings: [],
    priorFeedback: [],
    ...overrides,
  };
}

/** A company as the list renders it. */
export function fakeCompanySummary(overrides: Partial<CompanySummary> = {}): CompanySummary {
  return {
    id: 'co-1',
    slug: 'acme-corp',
    name: 'Acme Corp',
    industry: 'Mining',
    size: 'SME',
    website: 'https://acme.test',
    linkedinUrl: null,
    notes: null,
    createdAt: '2026-08-19T00:00:00Z',
    ...overrides,
  };
}

/** A company as its detail page reads it. */
export function fakeCompany(overrides: Partial<CompanyDetail> = {}): CompanyDetail {
  return {
    id: 'co-1',
    slug: 'acme-corp',
    name: 'Acme Corp',
    industry: 'Mining',
    size: 'SME',
    website: 'https://acme.test',
    notes: null,
    ...overrides,
  };
}

/** A contact at a company. */
export function fakeCompanyContact(overrides: Partial<CompanyContact> = {}): CompanyContact {
  return {
    id: 'ct-1',
    slug: 'jane-doe',
    firstName: 'Jane',
    lastName: 'Doe',
    pipelineStage: 'lead',
    email: 'jane@acme.test',
    ...overrides,
  };
}

/** A healthy, enabled watch. */
export function fakeWatch(overrides: Partial<EcosystemWatch> = {}): EcosystemWatch {
  return {
    id: 'w1',
    watchType: 'github_release',
    label: 'Core releases',
    sourceUrl: null,
    enabled: true,
    checkFrequency: 'daily',
    health: 'healthy',
    lastCheckedAt: null,
    lastChangeAt: null,
    ...overrides,
  };
}

/** A campaign with an open gate 1, so a test only breaks the field it means. */
export function fakeCampaignGate(overrides: Partial<CampaignGate> = {}): CampaignGate {
  return {
    status: 'draft',
    workflowRunId: 'run-1',
    openGate: 'strategy',
    ...overrides,
  };
}

/** A gate that passes every rule, so a test only has to break the one it means. */
export function fakePublishGate(overrides: Partial<PublishGate> = {}): PublishGate {
  return {
    status: 'approved',
    type: 'linkedin',
    body: 'A cleared post.',
    isThread: false,
    approvedBy: 'tm-1',
    complianceStatus: 'cleared',
    socialAccountId: 'acc-1',
    credentialExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    maxChars: 3000,
    ...overrides,
  };
}

/** A feed item with sensible defaults, for tests that only care about one field. */
export function fakeNewsFeedItem(overrides: Partial<NewsFeedItem> = {}): NewsFeedItem {
  return {
    id: 'n1',
    title: 'ASIC updates its digital asset guidance',
    url: 'https://example.test/asic',
    imageUrl: null,
    sourceName: 'Regulator Watch',
    publishedAt: '2026-08-18T00:00:00Z',
    summary: 'A one-line summary.',
    category: 'regulatory',
    status: 'new',
    relevanceScore: 0.8,
    curatorNotes: null,
    ...overrides,
  };
}

/** A news item detail with sensible defaults, including no report. */
export function fakeNewsItemDetail(overrides: Partial<NewsItemDetail> = {}): NewsItemDetail {
  return {
    id: 'n1',
    title: 'ASIC updates its digital asset guidance',
    url: 'https://example.test/asic',
    canonicalUrl: null,
    sourceName: 'Regulator Watch',
    author: null,
    publishedAt: '2026-08-18T00:00:00Z',
    summary: 'A one-line summary.',
    category: 'regulatory',
    relevanceScore: 0.8,
    curatorNotes: null,
    topicTags: [],
    bodyMarkdown: null,
    report: null,
    ...overrides,
  };
}

/** A digest item with sensible defaults. */
export function fakeNewsDigestItem(overrides: Partial<NewsDigestItem> = {}): NewsDigestItem {
  return {
    id: 'd1',
    title: 'RBA holds rates',
    url: 'https://example.test/rba',
    category: 'macro',
    sourceName: 'AFR',
    publishedAt: '2026-08-19T00:00:00Z',
    summary: null,
    ...overrides,
  };
}

/** A read model row with sensible defaults, for tests that only care about one field. */
export function fakeActivityItem(
  overrides: Partial<AgentActivityItem> = {},
): AgentActivityItem {
  return {
    id: 'a1',
    agentName: 'simon',
    action: 'Dispatch to petra: triage the backlog',
    status: 'pending',
    triggerType: 'manual',
    createdAt: '2026-08-19T00:00:00Z',
    entityType: null,
    entityId: null,
    proposedActions: [],
    approvedResponse: null,
    workflowRunId: null,
    ...overrides,
  };
}
