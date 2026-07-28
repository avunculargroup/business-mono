import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { createFakeSupabase, type FakeSupabaseClient } from '@/test/mocks/supabase';

const { notFound } = vi.hoisted(() => ({ notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND'); }) }));
vi.mock('next/navigation', () => ({ notFound }));

let fake: FakeSupabaseClient;
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => fake),
}));

vi.mock('./NewsItemDetail', () => ({
  NewsItemDetail: ({ item, sourceName }: { item: { title: string }; sourceName: string }) => (
    <div data-testid="news-detail" data-title={item.title} data-source={sourceName} />
  ),
}));

import NewsItemPage from './page';

function newsRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item-9',
    title: 'Tree Rings — Issue 42',
    url: 'email://gromen/issue-42%40gromen.com',
    source_id: 'src-gromen',
    source_name: 'Stale denormalised name',
    body_markdown: '# Tree Rings',
    ...overrides,
  };
}

beforeEach(() => {
  fake = createFakeSupabase();
});

describe('NewsItemPage', () => {
  it('loads the item by id and hands it to the detail view', async () => {
    fake.__setResponse('news_items', { data: newsRow(), error: null });
    fake.__setResponse('news_sources', { data: { name: 'Gromen Tree Rings' }, error: null });

    render(await NewsItemPage({ params: Promise.resolve({ id: 'item-9' }) }));

    expect(fake.from).toHaveBeenCalledWith('news_items');
    const builder = fake.__buildersFor('news_items')[0]!;
    expect(builder.eq).toHaveBeenCalledWith('id', 'item-9');
    expect(builder.single).toHaveBeenCalled();
    expect(screen.getByTestId('news-detail')).toHaveAttribute('data-title', 'Tree Rings — Issue 42');
  });

  it('prefers the live source name over the denormalised column', async () => {
    fake.__setResponse('news_items', { data: newsRow(), error: null });
    fake.__setResponse('news_sources', { data: { name: 'Gromen Tree Rings' }, error: null });

    render(await NewsItemPage({ params: Promise.resolve({ id: 'item-9' }) }));

    expect(screen.getByTestId('news-detail')).toHaveAttribute('data-source', 'Gromen Tree Rings');
  });

  it('falls back to source_name when the item has no configured source', async () => {
    fake.__setResponse('news_items', {
      data: newsRow({ source_id: null, source_name: 'Tavily' }),
      error: null,
    });

    render(await NewsItemPage({ params: Promise.resolve({ id: 'item-9' }) }));

    expect(screen.getByTestId('news-detail')).toHaveAttribute('data-source', 'Tavily');
    expect(fake.from).not.toHaveBeenCalledWith('news_sources');
  });

  it('is a 404 when the item does not exist', async () => {
    fake.__setResponse('news_items', { data: null, error: null });
    await expect(NewsItemPage({ params: Promise.resolve({ id: 'nope' }) })).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalled();
  });
});
