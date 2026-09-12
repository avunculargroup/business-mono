import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClientGate } from './ClientGate';

const base = {
  consequence: 'Subscribers can see this.',
  withheldConsequence: 'Subscribers cannot see this.',
};

describe('ClientGate', () => {
  it('names the three states distinctly', () => {
    const { rerender } = render(<ClientGate {...base} cleared={null} onChange={vi.fn()} />);
    expect(screen.getByText('Not assessed')).toBeInTheDocument();

    rerender(<ClientGate {...base} cleared={false} onChange={vi.fn()} />);
    expect(screen.getByText('Not visible to subscribers')).toBeInTheDocument();

    rerender(<ClientGate {...base} cleared onChange={vi.fn()} />);
    expect(screen.getByText('Visible to subscribers')).toBeInTheDocument();
  });

  it('states the consequence of the current state, not just the state', () => {
    render(<ClientGate {...base} cleared onChange={vi.fn()} />);

    expect(screen.getByText('Subscribers can see this.')).toBeInTheDocument();
  });

  it('names withholding as a state rather than leaving a blank', () => {
    // Absence is a fact on these surfaces, and "not visible" is a decision
    // someone made rather than a gap.
    render(<ClientGate {...base} cleared={false} onChange={vi.fn()} />);

    expect(screen.getByText('Subscribers cannot see this.')).toBeInTheDocument();
  });

  it('prefers the unassessed note over the withheld one when never assessed', () => {
    render(
      <ClientGate
        {...base}
        cleared={null}
        unassessedNote="Nobody has judged this yet."
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText('Nobody has judged this yet.')).toBeInTheDocument();
    expect(screen.queryByText('Subscribers cannot see this.')).not.toBeInTheDocument();
  });

  it('labels the action by what it will do, not by the current state', async () => {
    // A control reading "Visible" next to a state reading "Visible" is
    // ambiguous about whether it is a label or a button.
    const user = userEvent.setup();
    render(<ClientGate {...base} cleared={false} onChange={vi.fn(async () => ({ success: true }))} />);

    await user.click(screen.getByRole('button', { name: 'Change' }));

    expect(
      screen.getByRole('button', { name: 'Make visible to subscribers' }),
    ).toBeInTheDocument();
  });

  it('offers to withhold when it is currently visible', async () => {
    const user = userEvent.setup();
    render(<ClientGate {...base} cleared onChange={vi.fn(async () => ({ success: true }))} />);

    await user.click(screen.getByRole('button', { name: 'Change' }));

    expect(screen.getByRole('button', { name: 'Withhold from subscribers' })).toBeInTheDocument();
  });

  it('sends the flipped value and the note', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn(async () => ({ success: true }));
    render(
      <ClientGate
        {...base}
        cleared={false}
        requireNote={{ label: 'Reasoning', hint: 'Why.' }}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Change' }));
    await user.type(screen.getByLabelText('Reasoning'), 'Holds client tokens.');
    await user.click(screen.getByRole('button', { name: 'Make visible to subscribers' }));

    expect(onChange).toHaveBeenCalledWith(true, 'Holds client tokens.');
  });

  it('surfaces the action’s refusal instead of closing', async () => {
    const user = userEvent.setup();
    render(
      <ClientGate
        {...base}
        cleared={false}
        requireNote={{ label: 'Reasoning', hint: 'Why.' }}
        onChange={vi.fn(async () => ({ error: 'Say what it rests on.' }))}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Change' }));
    await user.click(screen.getByRole('button', { name: 'Make visible to subscribers' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Say what it rests on.');
    expect(screen.getByLabelText('Reasoning')).toBeInTheDocument();
  });

  it('shows no note field when the caller does not need one', async () => {
    const user = userEvent.setup();
    render(<ClientGate {...base} cleared={false} onChange={vi.fn(async () => ({ success: true }))} />);

    await user.click(screen.getByRole('button', { name: 'Change' }));

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('seeds the note field from an existing one', async () => {
    const user = userEvent.setup();
    render(
      <ClientGate
        {...base}
        cleared
        requireNote={{ label: 'Reasoning', hint: 'Why.', initial: 'Previously judged a DAP.' }}
        onChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Change' }));

    expect(screen.getByLabelText('Reasoning')).toHaveValue('Previously judged a DAP.');
  });
});
