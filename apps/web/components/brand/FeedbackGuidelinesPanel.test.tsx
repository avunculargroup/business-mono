import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const updateAccountGuidelines = vi.fn();
vi.mock('@/app/actions/voice', () => ({
  updateAccountGuidelines: (...args: unknown[]) => updateAccountGuidelines(...args),
}));

const toast = { success: vi.fn(), error: vi.fn() };
vi.mock('@/providers/ToastProvider', () => ({ useToast: () => toast }));

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

import { FeedbackGuidelinesPanel } from './FeedbackGuidelinesPanel';
import type { SocialAccountRow } from './voiceTypes';

const ACCOUNTS = [
  { id: 'acc-li', platform: 'linkedin', account_type: 'founder', display_name: 'Chris Pollard', handle: null, profile_url: null, voice_profile: {} },
] as SocialAccountRow[];

beforeEach(() => {
  vi.clearAllMocks();
  updateAccountGuidelines.mockResolvedValue({ success: true });
});

describe('FeedbackGuidelinesPanel', () => {
  it('shows the guideline count per account', () => {
    render(
      <FeedbackGuidelinesPanel
        accounts={ACCOUNTS}
        guidelines={[{ social_account_id: 'acc-li', guidelines: ['Skip hashtags.', 'Hold a view.'] }]}
        feedback={[]}
      />,
    );
    expect(screen.getByText('2 guidelines')).toBeInTheDocument();
  });

  it('opens the editor prefilled and saves the edited list', async () => {
    const user = userEvent.setup();
    render(
      <FeedbackGuidelinesPanel
        accounts={ACCOUNTS}
        guidelines={[{ social_account_id: 'acc-li', guidelines: ['Skip hashtags.'] }]}
        feedback={[
          { id: 'fb-1', social_account_id: 'acc-li', verdict: 'negative', feedback: 'Too preachy.', created_at: '2026-07-16T00:00:00Z' },
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Chris Pollard/ }));
    const textarea = screen.getByPlaceholderText(/never open with/i);
    expect(textarea).toHaveValue('Skip hashtags.');
    // The account's raw feedback shows beneath the editor.
    expect(screen.getByText('Too preachy.')).toBeInTheDocument();

    await user.clear(textarea);
    await user.type(textarea, 'Skip hashtags.{enter}Hold a view.');
    await user.click(screen.getByRole('button', { name: 'Save guidelines' }));

    expect(updateAccountGuidelines).toHaveBeenCalledWith('acc-li', 'Skip hashtags.\nHold a view.');
    expect(toast.success).toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();
  });

  it('surfaces a toast error and stays open when saving fails', async () => {
    updateAccountGuidelines.mockResolvedValue({ error: 'nope' });
    const user = userEvent.setup();
    render(<FeedbackGuidelinesPanel accounts={ACCOUNTS} guidelines={[]} feedback={[]} />);

    await user.click(screen.getByRole('button', { name: /Chris Pollard/ }));
    await user.click(screen.getByRole('button', { name: 'Save guidelines' }));

    expect(toast.error).toHaveBeenCalledWith('nope');
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText(/never open with/i)).toBeInTheDocument();
  });
});
