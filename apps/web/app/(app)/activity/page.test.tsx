import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import {
  createFakeRepositories,
  fakeActivityItem,
  type FakeRepositories,
} from '@/test/mocks/repositories';

// Same shape as crm/companies/page.test.tsx, one layer up: the page now asks a
// repository instead of building a query, so the test hands it a bundle rather
// than a Supabase fake. What it asserts is unchanged — query wiring plus prop
// hand-off — but the wiring it can get wrong is now a method call, and the SQL
// is verified once in @platform/data-supabase.
let repositories: FakeRepositories;
vi.mock('@/lib/repositories', () => ({
  getRepositories: vi.fn(async () => repositories),
}));

vi.mock('@/components/agent/ActivityFeed', () => ({
  ActivityFeed: ({
    initialActivities,
    totalCount,
  }: {
    initialActivities: Array<{ id: string; action: string }>;
    totalCount: number;
  }) => (
    <div data-testid="activity-feed" data-total={totalCount}>
      {initialActivities.map((a) => (
        <div key={a.id}>{a.action}</div>
      ))}
    </div>
  ),
}));

import ActivityPage from './page';

beforeEach(() => {
  repositories = createFakeRepositories();
});

describe('ActivityPage', () => {
  it('renders the header and hands the feed what the repository returned', async () => {
    repositories = createFakeRepositories({
      activity: [
        fakeActivityItem({ id: '1', action: 'Dispatch to petra: triage the backlog' }),
        fakeActivityItem({ id: '2', action: 'Web directive: draft a post' }),
      ],
    });

    render(await ActivityPage());

    expect(screen.getByRole('heading', { name: 'Agent Activity' })).toBeInTheDocument();
    expect(screen.getByText('Dispatch to petra: triage the backlog')).toBeInTheDocument();
    expect(screen.getByText('Web directive: draft a post')).toBeInTheDocument();
    expect(screen.getByTestId('activity-feed')).toHaveAttribute('data-total', '2');
  });

  it('passes the total from the repository, not the length of the page', async () => {
    // The feed shows "N of M"; taking M from items.length would silently read
    // the page size as the total once there is more than one page.
    repositories.agentActivity.listActivity.mockResolvedValueOnce({
      items: [fakeActivityItem({ id: '1' })],
      total: 87,
      hasMore: true,
    });

    render(await ActivityPage());

    expect(screen.getByTestId('activity-feed')).toHaveAttribute('data-total', '87');
  });

  it('renders an empty feed rather than failing when there is no activity', async () => {
    render(await ActivityPage());

    expect(screen.getByTestId('activity-feed')).toHaveAttribute('data-total', '0');
  });
});
