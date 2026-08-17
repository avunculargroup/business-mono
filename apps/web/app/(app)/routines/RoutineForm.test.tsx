import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { RoutineForm, type RoutineFormValues } from './RoutineForm';

const podcastRoutine: RoutineFormValues = {
  name: 'Podcast: Ingest episodes',
  description: 'Daily ingestion of podcast feeds.',
  agent_name: 'archie',
  action_type: 'podcast_ingest',
  action_config: { max_items_per_source: 25, lookback_days: 14 },
  frequency: 'daily',
  time_of_day: '06:45',
  timezone: 'Australia/Melbourne',
  show_on_dashboard: true,
  dashboard_title: 'Podcast ingestion',
  is_active: true,
};

function renderForm(initialValues: RoutineFormValues) {
  const onSubmit = vi.fn();
  render(<RoutineForm initialValues={initialValues} onSubmit={onSubmit} onCancel={vi.fn()} />);
  return onSubmit;
}

describe('RoutineForm — podcast_ingest', () => {
  it('renders the podcast knobs and not the research subject/query fields', () => {
    renderForm(podcastRoutine);

    expect(screen.getByDisplayValue('25')).toBeInTheDocument();
    expect(screen.getByDisplayValue('14')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Daily Bitcoin headlines')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/bitcoin news today/)).not.toBeInTheDocument();
  });

  it('saves without a subject or search queries', async () => {
    const onSubmit = renderForm(podcastRoutine);

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(screen.queryByText('Subject is required')).not.toBeInTheDocument();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      action_type: 'podcast_ingest',
      action_config: { max_items_per_source: 25, lookback_days: 14 },
    });
  });

  it('carries an edited lookback through to the submitted config', async () => {
    const onSubmit = renderForm(podcastRoutine);

    const lookback = screen.getByDisplayValue('14');
    await userEvent.clear(lookback);
    await userEvent.type(lookback, '7');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(onSubmit.mock.calls[0]?.[0].action_config).toEqual({
      max_items_per_source: 25,
      lookback_days: 7,
    });
  });

  it('still requires a subject for a research digest', async () => {
    const onSubmit = renderForm({
      ...podcastRoutine,
      action_type: 'research_digest',
      action_config: { subject: '', search_queries: [], archive_sources: false, max_sources: 10 },
    });

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(screen.getByText('Subject is required')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
