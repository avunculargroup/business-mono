import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { fakeActivityItem } from '@/test/mocks/repositories';
import { AgentActivityCard } from './AgentActivityCard';

// Stub the interactive child so this stays a unit on what the card renders from
// the read model, not on the approval flow's server action and toasts.
vi.mock('./ApprovalControls', () => ({
  ApprovalControls: ({ activityId }: { activityId: string }) => (
    <div data-testid="approval-controls">{activityId}</div>
  ),
}));

describe('AgentActivityCard', () => {
  it('renders the proposed-action descriptions and their entity types', () => {
    render(
      <AgentActivityCard
        activity={fakeActivityItem({
          proposedActions: [
            { description: 'Update contact', entityType: 'contacts', entityId: 'c1' },
          ],
        })}
      />,
    );

    expect(screen.getByText('Update contact')).toBeInTheDocument();
    expect(screen.getByText('(contacts)')).toBeInTheDocument();
  });

  it('counts proposed actions instead of listing them when compact', () => {
    render(
      <AgentActivityCard
        compact
        activity={fakeActivityItem({
          proposedActions: [
            // The shapes other producers write map to all-null entries. They
            // still have to be counted — that count is all the compact card
            // shows, and dropping them would under-report the work proposed.
            { description: null, entityType: null, entityId: null },
            { description: null, entityType: null, entityId: null },
          ],
        })}
      />,
    );

    expect(screen.getByText('2 proposed actions')).toBeInTheDocument();
  });

  it('links to the draft when the activity points at a content item', () => {
    render(
      <AgentActivityCard
        activity={fakeActivityItem({ entityType: 'content_items', entityId: 'ci-9' })}
      />,
    );

    expect(screen.getByRole('link', { name: /View draft/ })).toHaveAttribute(
      'href',
      '/content/ci-9',
    );
  });

  it('offers approval controls only while pending', () => {
    const { rerender } = render(
      <AgentActivityCard activity={fakeActivityItem({ status: 'pending' })} />,
    );
    expect(screen.getByTestId('approval-controls')).toBeInTheDocument();

    rerender(<AgentActivityCard activity={fakeActivityItem({ status: 'approved' })} />);
    expect(screen.queryByTestId('approval-controls')).not.toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();
  });

  it('shows a generated response only when it is not linked to an entity', () => {
    render(
      <AgentActivityCard
        activity={fakeActivityItem({ status: 'auto', approvedResponse: 'the draft body' })}
      />,
    );

    expect(screen.getByText('View generated content')).toBeInTheDocument();
    expect(screen.getByText('the draft body')).toBeInTheDocument();
  });
});
