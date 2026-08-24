import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import {
  createFakeRepositories,
  fakeNewsDigestItem,
  fakeNewsFeedItem,
  type FakeRepositories,
} from '@/test/mocks/repositories';

let repositories: FakeRepositories;
vi.mock('@/lib/repositories', () => ({
  getRepositories: vi.fn(async () => repositories),
}));

vi.mock('@/components/news/NewsFeed', () => ({
  NewsFeed: ({
    initialItems,
    todayDigest,
  }: {
    initialItems: Array<{ id: string; title: string }>;
    todayDigest: Array<{ id: string; title: string }>;
  }) => (
    <div data-testid="news-feed" data-digest-count={todayDigest.length}>
      {initialItems.map((i) => (
        <div key={i.id}>{i.title}</div>
      ))}
    </div>
  ),
}));

import NewsPage from './page';

beforeEach(() => {
  repositories = createFakeRepositories();
});

describe('NewsPage', () => {
  it('renders the header and the feed the repository returned', async () => {
    repositories = createFakeRepositories({
      news: [
        fakeNewsFeedItem({ id: '1', title: 'ASIC updates its guidance' }),
        fakeNewsFeedItem({ id: '2', title: 'RBA holds rates' }),
      ],
    });

    render(await NewsPage());

    expect(screen.getByRole('heading', { name: 'News feed' })).toBeInTheDocument();
    expect(screen.getByText('ASIC updates its guidance')).toBeInTheDocument();
    expect(screen.getByText('RBA holds rates')).toBeInTheDocument();
  });

  it('caps the sidebar digest at twenty', async () => {
    render(await NewsPage());

    // The sidebar shows three per category from today's most relevant. Asking
    // for the full hundred the digest page uses would be four-fifths wasted.
    expect(repositories.research.listTodayDigest).toHaveBeenCalledWith(
      expect.anything(),
      { limit: 20 },
    );
  });

  it('reads the feed and the digest against one read context', async () => {
    render(await NewsPage());

    const [feedCtx] = repositories.research.listItems.mock.calls[0];
    const [digestCtx] = repositories.research.listTodayDigest.mock.calls[0];

    // Two anchors could put the digest on a different day from the feed at a
    // midnight boundary.
    expect(feedCtx).toBe(digestCtx);
  });

  it('renders with no news at all', async () => {
    repositories = createFakeRepositories({ digest: [fakeNewsDigestItem()] });

    render(await NewsPage());

    expect(screen.getByTestId('news-feed')).toHaveAttribute('data-digest-count', '1');
  });
});
