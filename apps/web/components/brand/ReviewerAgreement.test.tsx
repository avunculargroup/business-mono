import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ReviewerAgreement } from './ReviewerAgreement';
import type { PickAgreementRow } from './reviewerAgreement';

function row(overrides: Partial<PickAgreementRow> = {}): PickAgreementRow {
  return {
    candidate_set_id: 'set',
    created_at: '2026-11-09T04:53:39Z',
    picked_symbol: 'A football pitch',
    picked_recognisable: 5,
    picked_twist_visible: 4,
    picked_on_hook: 4,
    top_symbol: "An architect's blueprint tube",
    top_recognisable: 4,
    top_twist_visible: 4,
    top_on_hook: 5,
    agreed: false,
    ...overrides,
  };
}

const FIVE: PickAgreementRow[] = [
  row({ candidate_set_id: 'a', created_at: '2026-11-09T04:53:39Z' }),
  row({ candidate_set_id: 'b', created_at: '2026-11-08T04:00:00Z', agreed: true, picked_recognisable: 1, top_recognisable: 1 }),
  row({ candidate_set_id: 'c', created_at: '2026-11-07T04:00:00Z', agreed: null }),
  row({ candidate_set_id: 'd', created_at: '2026-11-06T04:00:00Z', agreed: true }),
  row({ candidate_set_id: 'e', created_at: '2026-11-05T04:00:00Z', picked_symbol: 'A whistle', top_symbol: 'A binder', picked_recognisable: 3, top_recognisable: 4 }),
];

describe('ReviewerAgreement', () => {
  it('shows the empty state under five decided runs', () => {
    render(<ReviewerAgreement rows={FIVE.slice(0, 4)} />);
    expect(screen.getByText('Not enough picks yet. This fills in as you choose images in Review.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('counts matches over runs with a verdict, leaving out a null one', () => {
    render(<ReviewerAgreement rows={FIVE} />);
    expect(screen.getByText(/Your pick matched the reviewer’s top pick in/)).toHaveTextContent(
      'Your pick matched the reviewer’s top pick in 2 of 4 runs.',
    );
  });

  it('averages scores over the overrides only, in mono', () => {
    render(<ReviewerAgreement rows={FIVE} />);
    const recognisable = screen.getByRole('row', { name: /Recognisable/ });
    // Overrides a and e: picks 5 and 3, top picks 4 and 4. The matched run b (1, 1) is excluded.
    expect(within(recognisable).getAllByRole('cell').map((c) => c.textContent)).toEqual(['4.0', '4.0']);
    const onHook = screen.getByRole('row', { name: /On hook/ });
    expect(within(onHook).getAllByRole('cell').map((c) => c.textContent)).toEqual(['4.0', '5.0']);
  });

  it('lists recent overrides as plain text, nothing behind hover', () => {
    const { container } = render(<ReviewerAgreement rows={FIVE} />);
    const list = screen.getByRole('list', { name: 'Recent runs where you chose differently' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('9 Nov 2026');
    expect(items[0]).toHaveTextContent("You chose A football pitch; the reviewer ranked An architect's blueprint tube first.");
    expect(items[1]).toHaveTextContent('You chose A whistle; the reviewer ranked A binder first.');
    // Every figure and name is visible text: no title tooltips carrying content.
    expect(container.querySelectorAll('[title]')).toHaveLength(0);
  });

  it('says so when every judged pick matched', () => {
    render(<ReviewerAgreement rows={FIVE.map((r) => ({ ...r, agreed: true }))} />);
    expect(screen.getByText('Every pick so far matched the reviewer’s top pick.')).toBeInTheDocument();
  });
});
