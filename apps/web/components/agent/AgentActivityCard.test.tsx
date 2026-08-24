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
  it('labels a proposed action with its kind and its name', () => {
    render(
      <AgentActivityCard
        activity={fakeActivityItem({
          proposedActions: [{ type: 'create_task', label: 'Follow up on the letter' }],
        })}
      />,
    );

    expect(screen.getByText('Create task: Follow up on the letter')).toBeInTheDocument();
  });

  it('falls back to the kind alone when the producer records no name', () => {
    // Most producers write only a discriminator. Rendering the label field
    // directly is what put an empty bullet on this page for every proposed
    // action ever logged, so an entry must never render as nothing.
    render(
      <AgentActivityCard
        activity={fakeActivityItem({
          proposedActions: [
            { type: 'suggested_rewrite', label: null },
            { type: null, label: null },
          ],
        })}
      />,
    );

    expect(screen.getByText('Suggested rewrite')).toBeInTheDocument();
    expect(screen.getByText('Proposed action')).toBeInTheDocument();
    expect(screen.queryAllByRole('listitem').map((li) => li.textContent)).not.toContain('');
  });

  it('counts proposed actions instead of listing them when compact', () => {
    render(
      <AgentActivityCard
        compact
        activity={fakeActivityItem({
          proposedActions: [
            { type: 'variant', label: null },
            { type: 'compliance', label: null },
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
