import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const setDeepgramTranscription =
  vi.fn<(id: string, enabled: boolean) => Promise<{ success?: boolean; error?: string }>>();
vi.mock('@/app/actions/podcasts', () => ({
  setDeepgramTranscription: (id: string, enabled: boolean) => setDeepgramTranscription(id, enabled),
}));

import { DeepgramToggle } from './DeepgramToggle';

beforeEach(() => {
  setDeepgramTranscription.mockClear();
  setDeepgramTranscription.mockResolvedValue({ success: true });
});

describe('DeepgramToggle', () => {
  it('renders a switch reflecting the current state', () => {
    render(<DeepgramToggle sourceId="s1" enabled={true} />);
    const sw = screen.getByRole('switch');
    expect(sw).toBeChecked();
    expect(screen.getByText('Deepgram on')).toBeInTheDocument();
  });

  it('flips the label and calls the action on click', async () => {
    const user = userEvent.setup();
    render(<DeepgramToggle sourceId="s1" enabled={false} />);

    await user.click(screen.getByRole('switch'));

    expect(setDeepgramTranscription).toHaveBeenCalledWith('s1', true);
    expect(await screen.findByText('Deepgram on')).toBeInTheDocument();
  });

  it('reverts the label when the action fails', async () => {
    setDeepgramTranscription.mockResolvedValue({ error: 'nope' });
    const user = userEvent.setup();
    render(<DeepgramToggle sourceId="s1" enabled={false} />);

    await user.click(screen.getByRole('switch'));

    expect(await screen.findByText('Deepgram off')).toBeInTheDocument();
    expect(screen.getByRole('switch')).not.toBeChecked();
  });
});
