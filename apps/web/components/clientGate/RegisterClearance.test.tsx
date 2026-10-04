import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { setReviewState, setRegisterClearance, approveDraftRows } = vi.hoisted(() => ({
  setReviewState: vi.fn(async () => ({ success: true })),
  setRegisterClearance: vi.fn(async () => ({ success: true })),
  approveDraftRows: vi.fn(async () => ({ success: true })),
}));
vi.mock('@/app/actions/clientPromotion', () => ({
  setReviewState,
  setRegisterClearance,
  approveDraftRows,
}));

import { RegisterClearance } from './RegisterClearance';

beforeEach(() => {
  setReviewState.mockClear();
  setRegisterClearance.mockClear();
});

describe('RegisterClearance', () => {
  it('offers no subscriber gate on a draft', () => {
    // The schema refuses to clear a draft, so the control does not offer it.
    render(<RegisterClearance companyId="c1" reviewState="draft" cleared={false} clientSummary={null} />);

    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Subscriber visibility' })).not.toBeInTheDocument();
  });

  it('marks a draft reviewed', async () => {
    render(<RegisterClearance companyId="c1" reviewState="draft" cleared={false} clientSummary={null} />);

    await userEvent.click(screen.getByRole('button', { name: 'Mark reviewed' }));

    expect(setReviewState).toHaveBeenCalledWith('c1', 'internal');
  });

  it('asks for the subscriber summary when clearing a reviewed record', async () => {
    render(
      <RegisterClearance
        companyId="c1"
        reviewState="internal"
        cleared={false}
        clientSummary="Holds bitcoin directly."
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Change' }));
    const summary = screen.getByLabelText('Subscriber summary');
    expect(summary).toHaveValue('Holds bitcoin directly.');

    await userEvent.click(screen.getByRole('button', { name: 'Make visible to subscribers' }));
    expect(setRegisterClearance).toHaveBeenCalledWith('c1', true, 'Holds bitcoin directly.');
  });

  it('offers to approve the draft rows on a record, by count', async () => {
    render(
      <RegisterClearance
        companyId="c1"
        reviewState="internal"
        cleared
        clientSummary="x"
        draftRows={3}
      />,
    );

    expect(screen.getByText(/3 rows on this record are drafts/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Approve 3 draft rows' }));
    expect(approveDraftRows).toHaveBeenCalledWith('c1');
  });

  it('says nothing about rows when none are drafts', () => {
    render(<RegisterClearance companyId="c1" reviewState="internal" cleared clientSummary="x" />);

    expect(screen.queryByRole('button', { name: /draft row/ })).not.toBeInTheDocument();
  });

  it('says leaving review withholds a cleared entry', () => {
    render(<RegisterClearance companyId="c1" reviewState="internal" cleared clientSummary="x" />);

    expect(screen.getByText(/also withholds it from subscribers/)).toBeInTheDocument();
  });
});
