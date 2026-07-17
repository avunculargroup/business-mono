import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const submitDraftFeedback = vi.fn();
vi.mock('@/app/actions/contentFeedback', () => ({
  submitDraftFeedback: (...args: unknown[]) => submitDraftFeedback(...args),
}));

const toast = { success: vi.fn(), error: vi.fn() };
vi.mock('@/providers/ToastProvider', () => ({ useToast: () => toast }));

import { DraftFeedback } from './DraftFeedback';

beforeEach(() => {
  vi.clearAllMocks();
  submitDraftFeedback.mockResolvedValue({ success: true });
});

describe('DraftFeedback', () => {
  it('disables saving until a note is written', () => {
    render(<DraftFeedback contentItemId="ci-1" priorFeedback={[]} />);
    expect(screen.getByRole('button', { name: 'Save feedback' })).toBeDisabled();
  });

  it('submits the note with the chosen verdict and shows it in the history', async () => {
    const user = userEvent.setup();
    render(<DraftFeedback contentItemId="ci-1" priorFeedback={[]} />);

    await user.click(screen.getByRole('button', { name: 'Needs work' }));
    await user.type(screen.getByPlaceholderText(/what should change/i), 'Too preachy.');
    await user.click(screen.getByRole('button', { name: 'Save feedback' }));

    expect(submitDraftFeedback).toHaveBeenCalledWith({
      contentItemId: 'ci-1',
      feedback: 'Too preachy.',
      verdict: 'negative',
    });
    expect(toast.success).toHaveBeenCalled();
    expect(await screen.findByText('Too preachy.')).toBeInTheDocument();
  });

  it('omits the verdict when none is selected', async () => {
    const user = userEvent.setup();
    render(<DraftFeedback contentItemId="ci-1" priorFeedback={[]} />);

    await user.type(screen.getByPlaceholderText(/what should change/i), 'Note.');
    await user.click(screen.getByRole('button', { name: 'Save feedback' }));

    expect(submitDraftFeedback).toHaveBeenCalledWith({
      contentItemId: 'ci-1',
      feedback: 'Note.',
      verdict: undefined,
    });
  });

  it('shows a toast and keeps the note on error', async () => {
    submitDraftFeedback.mockResolvedValue({ error: 'nope' });
    const user = userEvent.setup();
    render(<DraftFeedback contentItemId="ci-1" priorFeedback={[]} />);

    const textarea = screen.getByPlaceholderText(/what should change/i);
    await user.type(textarea, 'Note.');
    await user.click(screen.getByRole('button', { name: 'Save feedback' }));

    expect(toast.error).toHaveBeenCalledWith('nope');
    expect(textarea).toHaveValue('Note.');
  });

  it('lists prior feedback with its verdict', () => {
    render(
      <DraftFeedback
        contentItemId="ci-1"
        priorFeedback={[
          { id: 'fb-1', verdict: 'positive', feedback: 'More like this.', created_at: '2026-07-16T00:00:00Z' },
        ]}
      />,
    );
    expect(screen.getByText('More like this.')).toBeInTheDocument();
    expect(screen.getByText(/Good ·/)).toBeInTheDocument();
  });
});
