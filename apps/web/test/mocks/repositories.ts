import { vi, type Mock } from 'vitest';
import type { AgentActivityItem, RepositoryBundle } from '@platform/data';

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
  mode: RepositoryBundle['mode'];
};

export function createFakeRepositories(
  overrides: { activity?: AgentActivityItem[]; pendingCount?: number } = {},
): FakeRepositories {
  const items = overrides.activity ?? [];

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
    mode: 'live',
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
