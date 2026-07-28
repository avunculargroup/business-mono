import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { NewsCard } from './NewsCard';

const insertedRows: Array<Record<string, unknown>> = [];

// The card writes to knowledge_items on promote and updates news_items after.
const insert = vi.fn((row: Record<string, unknown>) => {
  insertedRows.push(row);
  return {
    select: () => ({ single: () => Promise.resolve({ data: { id: 'ki-1' }, error: null }) }),
  };
});
vi.mock('@/lib/supabase/browser', () => ({
  createClient: () => ({
    from: () => ({
      insert,
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
  }),
}));
vi.mock('@/providers/ToastProvider', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

beforeEach(() => {
  insertedRows.length = 0;
  insert.mockClear();
});

function renderCard(overrides: Partial<Parameters<typeof NewsCard>[0]> = {}) {
  return render(
    <NewsCard
      id="item-9"
      title="RBA holds rates"
      url="https://afr.com/rba-holds"
      sourceName="AFR"
      publishedAt={null}
      summary={null}
      category="macro"
      status="new"
      {...overrides}
    />,
  );
}

describe('NewsCard heading link', () => {
  it('opens a real article in a new tab', () => {
    renderCard();
    const link = screen.getByRole('link', { name: /RBA holds rates/ });
    expect(link).toHaveAttribute('href', 'https://afr.com/rba-holds');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('routes an email-sourced item to the in-app reading view', () => {
    renderCard({ url: 'email://gromen/issue-42%40gromen.com', title: 'Tree Rings' });
    const link = screen.getByRole('link', { name: /Tree Rings/ });
    expect(link).toHaveAttribute('href', '/news/item-9');
    expect(link).not.toHaveAttribute('target');
  });
});

describe('NewsCard promote to knowledge base', () => {
  async function promote() {
    await userEvent.click(screen.getByRole('button', { name: /knowledge base/i }));
  }

  it('stores the article url for a normal item', async () => {
    renderCard();
    await promote();
    expect(insertedRows[0]).toMatchObject({ source_url: 'https://afr.com/rba-holds' });
  });

  it('stores canonical_url rather than the synthetic email url', async () => {
    renderCard({
      url: 'email://gromen/issue-42%40gromen.com',
      canonicalUrl: 'https://tree-rings.example/view/42',
    });
    await promote();
    expect(insertedRows[0]).toMatchObject({ source_url: 'https://tree-rings.example/view/42' });
  });

  it('stores null rather than a dead email:// url', async () => {
    renderCard({ url: 'email://gromen/issue-42%40gromen.com', canonicalUrl: null });
    await promote();
    expect(insertedRows[0]!['source_url']).toBeNull();
  });
});
