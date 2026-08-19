import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { NewsCard } from './NewsCard';
import { createFakeRepositories, type FakeRepositories } from '@/test/mocks/repositories';

// Converted to the seam in vertical 4.2. The card used to build the knowledge
// item itself, so this file asserted which url ended up in `source_url` — that
// choice now lives in the adapter and is tested there, against the same three
// cases. What is left here is the card's own behaviour: which method it calls,
// and what it does with success and failure.
let repositories: FakeRepositories;
vi.mock('@platform/data/provider', () => ({
  useRepositories: () => repositories,
}));

const toast = { success: vi.fn(), error: vi.fn() };
vi.mock('@platform/ui/ToastProvider', () => ({
  useToast: () => toast,
}));

beforeEach(() => {
  repositories = createFakeRepositories();
  toast.success.mockClear();
  toast.error.mockClear();
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

  it('promotes by id and confirms', async () => {
    renderCard();
    await promote();

    // By id alone: the adapter reads the title, url and category from the row,
    // so a card holding stale props cannot file the article under the wrong one.
    expect(repositories.research.promoteItem).toHaveBeenCalledWith('item-9');
    expect(toast.success).toHaveBeenCalledWith('Article promoted to the knowledge base.');
  });

  it('says so and stays put when the promotion fails', async () => {
    repositories.research.promoteItem.mockRejectedValueOnce(new Error('denied'));

    renderCard();
    await promote();

    expect(toast.error).toHaveBeenCalledWith('Could not promote to knowledge base.');
    expect(toast.success).not.toHaveBeenCalled();
    // Still promotable — a failed write must not leave the card claiming success.
    expect(screen.getByRole('button', { name: /knowledge base/i })).toBeInTheDocument();
  });
});

describe('NewsCard status controls', () => {
  it('records a review against the item', async () => {
    renderCard();
    await userEvent.click(screen.getByRole('button', { name: /reviewed/i }));

    expect(repositories.research.setItemStatus).toHaveBeenCalledWith('item-9', 'reviewed');
  });

  it('surfaces a failed status change instead of moving the card', async () => {
    repositories.research.setItemStatus.mockRejectedValueOnce(new Error('offline'));

    renderCard();
    await userEvent.click(screen.getByRole('button', { name: /archive/i }));

    expect(toast.error).toHaveBeenCalledWith('Could not update article status.');
  });
});
