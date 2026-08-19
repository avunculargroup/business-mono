import { vi, type Mock } from 'vitest';
import type {
  AgentActivityItem,
  NewsDigestItem,
  NewsFeedItem,
  NewsItemDetail,
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
  mode: RepositoryBundle['mode'];
};

export function createFakeRepositories(
  overrides: {
    activity?: AgentActivityItem[];
    pendingCount?: number;
    news?: NewsFeedItem[];
    digest?: NewsDigestItem[];
    newsItem?: NewsItemDetail;
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
    mode: 'live',
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
