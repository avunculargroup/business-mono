import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NotFoundError } from '@platform/data';

import {
  createFakeRepositories,
  fakeNewsItemDetail,
  type FakeRepositories,
} from '@/test/mocks/repositories';

const { notFound } = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));
vi.mock('next/navigation', () => ({ notFound }));

// Converted to the seam in vertical 4.2b. The two source-name cases this file
// used to cover — prefer the configured source, fall back to the denormalised
// column — moved to the adapter, which is where that resolution now happens.
let repositories: FakeRepositories;
vi.mock('@/lib/repositories', () => ({
  getRepositories: vi.fn(async () => repositories),
}));

vi.mock('./NewsItemDetail', () => ({
  NewsItemDetail: ({ item }: { item: { title: string; sourceName: string } }) => (
    <div data-testid="news-detail" data-title={item.title} data-source={item.sourceName} />
  ),
}));

import NewsItemPage from './page';

beforeEach(() => {
  repositories = createFakeRepositories();
  notFound.mockClear();
});

describe('NewsItemPage', () => {
  it('loads the item by id and hands it to the detail view', async () => {
    repositories = createFakeRepositories({
      newsItem: fakeNewsItemDetail({
        title: 'Tree Rings — Issue 42',
        sourceName: 'Gromen Tree Rings',
      }),
    });

    render(await NewsItemPage({ params: Promise.resolve({ id: 'item-9' }) }));

    expect(repositories.research.getItem).toHaveBeenCalledWith(expect.anything(), 'item-9');
    const detail = screen.getByTestId('news-detail');
    expect(detail).toHaveAttribute('data-title', 'Tree Rings — Issue 42');
    expect(detail).toHaveAttribute('data-source', 'Gromen Tree Rings');
  });

  it('titles the page by whether the item carries a report', async () => {
    render(await NewsItemPage({ params: Promise.resolve({ id: 'item-9' }) }));
    expect(screen.getByRole('heading', { name: 'Article' })).toBeInTheDocument();
  });

  it('is a 404 when the item does not exist', async () => {
    repositories.research.getItem.mockRejectedValueOnce(new NotFoundError('news item', 'nope'));

    await expect(
      NewsItemPage({ params: Promise.resolve({ id: 'nope' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalled();
  });

  it('lets a real failure through rather than showing a 404 for it', async () => {
    // A dropped connection is not a missing article, and rendering "not found"
    // for one would send a reader looking for a page that does exist.
    repositories.research.getItem.mockRejectedValueOnce(new Error('connection reset'));

    await expect(
      NewsItemPage({ params: Promise.resolve({ id: 'item-9' }) }),
    ).rejects.toThrow('connection reset');
    expect(notFound).not.toHaveBeenCalled();
  });
});
