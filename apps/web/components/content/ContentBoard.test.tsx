import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ContentBoard } from './ContentBoard';
import { updateContentStatus } from '@/app/actions/content';

// The board renders interactive children that pull in realtime, toasts, and
// server actions. Stub them so this stays a unit on the card descriptors.
vi.mock('@/app/actions/content', () => ({
  updateContentStatus: vi.fn(async () => ({})),
}));
vi.mock('./NewsletterRunStatus', () => ({
  NewsletterRunStatus: () => null,
}));
vi.mock('./RunNewsletterModal', () => ({
  RunNewsletterModal: () => null,
}));
vi.mock('./ContentForm', () => ({
  ContentForm: () => null,
}));

type Card = Parameters<typeof ContentBoard>[0]['items'][number];

const baseCard: Card = {
  id: '1',
  title: 'Why treasuries hold Bitcoin',
  type: 'linkedin',
  status: 'draft',
  scheduled_for: null,
  created_by: null,
  campaign_name: null,
  account_name: null,
  platform: null,
};

function renderBoard(items: Card[]) {
  return render(<ContentBoard items={items} teamMembers={[]} />);
}

describe('ContentBoard card descriptors', () => {
  it('shows the campaign name and social account for a campaign variant', () => {
    renderBoard([
      {
        ...baseCard,
        campaign_name: 'Q3 Education Push',
        account_name: 'BTS Company',
        platform: 'linkedin',
      },
    ]);

    const card = screen.getByRole('link', { name: /Why treasuries hold Bitcoin/ });
    expect(within(card).getByText('Q3 Education Push')).toBeInTheDocument();
    expect(within(card).getByText('LinkedIn · BTS Company')).toBeInTheDocument();
  });

  it('distinguishes two variants that share a title by their social account', () => {
    renderBoard([
      { ...baseCard, id: 'a', account_name: 'BTS Company', platform: 'linkedin' },
      { ...baseCard, id: 'b', account_name: 'Chris Pollard', platform: 'twitter_x' },
    ]);

    expect(screen.getByText('LinkedIn · BTS Company')).toBeInTheDocument();
    expect(screen.getByText('X · Chris Pollard')).toBeInTheDocument();
  });

  it('falls back to the assignment label for non-campaign items', () => {
    renderBoard([{ ...baseCard, created_by: 'member-1' }]);

    expect(screen.getByText('Assigned')).toBeInTheDocument();
  });
});

describe('ContentBoard archiving', () => {
  it('archives a card from the archive button', async () => {
    const user = userEvent.setup();
    vi.mocked(updateContentStatus).mockClear();
    renderBoard([baseCard]);

    const card = screen.getByRole('link', { name: /Why treasuries hold Bitcoin/ });
    await user.click(within(card).getByRole('button', { name: 'Archive' }));

    expect(updateContentStatus).toHaveBeenCalledWith('1', 'archived');
  });

  it('renders archived items in a separate Archive section without an archive button', () => {
    renderBoard([{ ...baseCard, status: 'archived' }]);

    expect(screen.getByText('Archive')).toBeInTheDocument();
    const card = screen.getByRole('link', { name: /Why treasuries hold Bitcoin/ });
    expect(within(card).queryByRole('button', { name: 'Archive' })).toBeNull();
  });
});
