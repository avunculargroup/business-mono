import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RoutineActionType, ROUTINE_ACTION_LABELS } from '@platform/shared';
import type { RoutineActionType as RoutineActionTypeT } from '@platform/shared';

import { RoutineForm, type RoutineFormValues, type TeamMemberOption } from './RoutineForm';

const TEAM: TeamMemberOption[] = [
  { id: '2fcaea14-6d37-4def-b56d-467d61c92f36', full_name: 'Chris Pollard' },
  { id: '6f0d0298-9cb8-469a-b5c3-e82249dbc739', full_name: 'Carolyn Crawford' },
];

const BASE: RoutineFormValues = {
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

const podcastRoutine = BASE;

function routine(overrides: Partial<RoutineFormValues>): RoutineFormValues {
  return { ...BASE, ...overrides };
}

function renderForm(initialValues: RoutineFormValues) {
  const onSubmit = vi.fn();
  render(
    <RoutineForm
      initialValues={initialValues}
      teamMembers={TEAM}
      onSubmit={onSubmit}
      onCancel={vi.fn()}
    />,
  );
  return onSubmit;
}

async function save() {
  await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
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

    await save();

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
    await save();

    expect(onSubmit.mock.calls[0]?.[0].action_config).toEqual({
      max_items_per_source: 25,
      lookback_days: 7,
    });
  });

  it('falls back to the default rather than 0 when a number field is cleared', async () => {
    const onSubmit = renderForm(podcastRoutine);

    await userEvent.clear(screen.getByDisplayValue('14'));
    await save();

    expect(onSubmit.mock.calls[0]?.[0].action_config).toEqual({
      max_items_per_source: 25,
      lookback_days: 14,
    });
  });

  it('still requires a subject for a research digest', async () => {
    const onSubmit = renderForm(
      routine({
        action_type: 'research_digest',
        action_config: { subject: '', search_queries: [], archive_sources: false, max_sources: 10 },
      }),
    );

    await save();

    expect(screen.getByText('Subject is required')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('RoutineForm — action type coverage', () => {
  it('offers an option for every action type the workflow can run', () => {
    renderForm(podcastRoutine);

    for (const value of Object.values(RoutineActionType) as RoutineActionTypeT[]) {
      expect(
        screen.getByRole('option', { name: ROUTINE_ACTION_LABELS[value] }),
      ).toBeInTheDocument();
    }
  });

  // The whole class of bug this guards: an action type with no <option> leaves
  // the select showing some other routine's type, and submit falls through to
  // the research-digest branch demanding a subject the routine has never had.
  it.each([
    ['newsletter', { time_range: 'month', story_count: 5, target_word_count: 250 }],
    ['news_source_scan', { max_items_per_source: 10, lookback_days: 3 }],
    ['indicator_poll', { backfill_periods: 18 }],
    ['onchain_poll', { backfill_days: 2600 }],
    ['market_report', {}],
    ['report_watch_scan', {}],
  ] as const)('shows %s as the selected type and saves it unchanged', async (actionType, config) => {
    const onSubmit = renderForm(
      routine({ action_type: actionType, action_config: { ...config } }),
    );

    expect(
      screen.getByDisplayValue(ROUTINE_ACTION_LABELS[actionType as RoutineActionTypeT]),
    ).toBeInTheDocument();

    await save();

    expect(screen.queryByText('Subject is required')).not.toBeInTheDocument();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]?.[0].action_type).toBe(actionType);
  });
});

describe('RoutineForm — newsletter', () => {
  const newsletter = routine({
    name: 'On-demand newsletter',
    agent_name: 'charlie',
    action_type: 'newsletter',
    action_config: {
      one_off: true,
      time_range: 'month',
      story_count: 7,
      audience_context: null,
      target_word_count: 250,
    },
  });

  it('keeps the one_off flag the /content page relies on', async () => {
    const onSubmit = renderForm(newsletter);

    await save();

    expect(onSubmit.mock.calls[0]?.[0].action_config).toMatchObject({ one_off: true });
  });

  // The min/max attributes refuse this first (the submit never reaches the
  // handler), so assert the outcome rather than the handler's error string —
  // the JS range check behind it is the backstop for a non-browser caller.
  it('refuses to save a story count outside 3–8', async () => {
    const onSubmit = renderForm(newsletter);

    const stories = screen.getByDisplayValue('7');
    await userEvent.clear(stories);
    await userEvent.type(stories, '12');
    await save();

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('carries the monthly guard through', async () => {
    const onSubmit = renderForm(
      routine({
        action_type: 'newsletter',
        action_config: { time_range: 'month', story_count: 5, target_word_count: 250, monthly_guard: true },
      }),
    );

    await save();

    expect(onSubmit.mock.calls[0]?.[0].action_config).toMatchObject({ monthly_guard: true });
  });
});

describe('RoutineForm — social_post_from_news', () => {
  const socialPost = routine({
    name: 'Social posts — Chris Pollard',
    agent_name: 'charlie',
    action_type: 'social_post_from_news',
    action_config: {
      founder_team_member_id: TEAM[0]!.id,
      platforms: ['linkedin', 'twitter_x'],
      lookback_hours: 24,
    },
  });

  it('preselects the founder from the routine config', () => {
    renderForm(socialPost);

    expect(screen.getByDisplayValue('Chris Pollard')).toBeInTheDocument();
  });

  it('saves the founder, platforms and lookback', async () => {
    const onSubmit = renderForm(socialPost);

    await save();

    expect(onSubmit.mock.calls[0]?.[0].action_config).toEqual({
      founder_team_member_id: TEAM[0]!.id,
      platforms: ['linkedin', 'twitter_x'],
      lookback_hours: 24,
    });
  });

  it('requires at least one platform', async () => {
    const onSubmit = renderForm(socialPost);

    await userEvent.click(screen.getByRole('checkbox', { name: 'LinkedIn' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'X' }));
    await save();

    expect(screen.getByText('Pick at least one platform')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('requires a founder', async () => {
    const onSubmit = renderForm(
      routine({
        action_type: 'social_post_from_news',
        action_config: { founder_team_member_id: '', platforms: ['linkedin'], lookback_hours: 24 },
      }),
    );

    await save();

    expect(screen.getByText('Pick the founder these posts are for')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('RoutineForm — config fields that must survive an edit', () => {
  it('keeps a news_ingest relevance filter instead of dropping it', async () => {
    const onSubmit = renderForm(
      routine({
        agent_name: 'rex',
        action_type: 'news_ingest',
        action_config: {
          category: 'macro',
          queries: ['Federal Reserve monetary policy'],
          max_results_per_query: 15,
          max_curated: 6,
          relevance_filter: 'none',
        },
      }),
    );

    await save();

    expect(onSubmit.mock.calls[0]?.[0].action_config).toMatchObject({ relevance_filter: 'none' });
  });

  it('defaults the relevance filter from the category when unset', async () => {
    const onSubmit = renderForm(
      routine({
        agent_name: 'rex',
        action_type: 'news_ingest',
        action_config: {
          category: 'macro',
          queries: ['Federal Reserve monetary policy'],
          max_results_per_query: 15,
          max_curated: 6,
        },
      }),
    );

    await save();

    expect(onSubmit.mock.calls[0]?.[0].action_config).toMatchObject({ relevance_filter: 'none' });
  });

  it('keeps the monitor_change baseline digest', async () => {
    const onSubmit = renderForm(
      routine({
        agent_name: 'rex',
        action_type: 'monitor_change',
        action_config: {
          subject: 'ASIC guidance',
          context: '',
          search_queries: ['ASIC digital asset guidance'],
          notify_signal: true,
          notify_agent: null,
          last_digest: 'Previously: no change since March.',
        },
      }),
    );

    await save();

    expect(onSubmit.mock.calls[0]?.[0].action_config).toMatchObject({
      last_digest: 'Previously: no change since March.',
    });
  });

  it('keeps a non-default more_news_url on news_curation', async () => {
    const onSubmit = renderForm(
      routine({
        agent_name: 'charlie',
        action_type: 'news_curation',
        action_config: { max_stories: 6, lookback_hours: 24, more_news_url: '/news?filter=au' },
      }),
    );

    await save();

    expect(onSubmit.mock.calls[0]?.[0].action_config).toMatchObject({
      more_news_url: '/news?filter=au',
    });
  });
});
