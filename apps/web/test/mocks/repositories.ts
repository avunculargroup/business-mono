import { vi, type Mock } from 'vitest';
import type {
  AgentActivityItem,
  CampaignGate,
  ContentDetail,
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
