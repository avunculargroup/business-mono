import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { NewsCard } from './NewsCard';

// The card's actions talk to Supabase and the toast provider on mount-adjacent
// paths; neither is exercised by the heading-link assertions below.
vi.mock('@/lib/supabase/browser', () => ({ createClient: () => ({}) }));
vi.mock('@/providers/ToastProvider', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

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
