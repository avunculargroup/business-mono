import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { setReviewState, setRegisterClearance, approveDraftRows, reviewChangedRows } = vi.hoisted(
  () => ({
    setReviewState: vi.fn(async () => ({ success: true })),
    setRegisterClearance: vi.fn(async () => ({ success: true })),
    approveDraftRows: vi.fn(async () => ({ success: true })),
    reviewChangedRows: vi.fn(async () => ({ success: true })),
  }),
);
vi.mock('@/app/actions/clientPromotion', () => ({
  setReviewState,
  setRegisterClearance,
  approveDraftRows,
  reviewChangedRows,
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

  it('badges a record changed since review, and reviews it again in place', async () => {
    render(
      <RegisterClearance
        companyId="c1"
        reviewState="internal"
        cleared
        clientSummary="Holds bitcoin directly."
        changedSinceReview
      />,
    );

    expect(screen.getByText('Changed since review')).toBeInTheDocument();
    // Flag, not demotion: the gate is still offered and the state still reads reviewed.
    expect(screen.getByText('Reviewed')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Mark reviewed again' }));

    expect(setReviewState).toHaveBeenCalledWith('c1', 'internal');
  });

  it('offers no re-review on a record nobody has edited since review', () => {
    render(
      <RegisterClearance companyId="c1" reviewState="internal" cleared={false} clientSummary={null} />,
    );

    expect(screen.queryByText('Changed since review')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark reviewed again' })).not.toBeInTheDocument();
  });

  it('reviews changed rows again as one group', async () => {
    render(
      <RegisterClearance
        companyId="c1"
        reviewState="internal"
        cleared={false}
        clientSummary={null}
        changedRows={2}
      />,
    );

    expect(screen.getByText(/Changed since review · 2 rows/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Mark these reviewed again' }));

    expect(reviewChangedRows).toHaveBeenCalledWith('c1');
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

  it('offers each run its own approval, and the hand-written rows theirs', async () => {
    render(
      <RegisterClearance
        companyId="c1"
        reviewState="internal"
        cleared
        clientSummary="x"
        draftGroups={[
          { runId: 'run-abcdef123456', rows: 3 },
          { runId: null, rows: 1 },
        ]}
      />,
    );

    expect(screen.getByText(/Ingest run run-abcd · 3 rows/)).toBeInTheDocument();
    expect(screen.getByText(/Entered by hand · 1 row/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Approve this run' }));
    expect(approveDraftRows).toHaveBeenCalledWith('c1', 'run-abcdef123456');

    await userEvent.click(screen.getByRole('button', { name: 'Approve these rows' }));
    expect(approveDraftRows).toHaveBeenCalledWith('c1', null);
  });

  it('says nothing about rows when none are drafts', () => {
    render(<RegisterClearance companyId="c1" reviewState="internal" cleared clientSummary="x" />);

    expect(screen.queryByRole('button', { name: /Approve this run|Approve these rows/ })).not.toBeInTheDocument();
  });

  it('says leaving review withholds a cleared entry', () => {
    render(<RegisterClearance companyId="c1" reviewState="internal" cleared clientSummary="x" />);

    expect(screen.getByText(/also withholds it from subscribers/)).toBeInTheDocument();
  });
});
