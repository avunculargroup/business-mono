/**
 * End-to-end edit round-trip for every routine currently in the database.
 *
 * Path exercised: stored action_config → RoutineForm initial values → the
 * form's submit builder → valuesToFormData → the server action's schema →
 * the action_config written back.
 *
 * The fixtures are the real stored configs. Opening a routine and pressing
 * Save must not lose a field or change a value — the failure mode this guards
 * is silent: a config key the form does not know about is simply gone from the
 * row afterwards, and the routine's next run behaves differently.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createFakeSupabase, type FakeSupabaseClient } from '@/test/mocks/supabase';

import { RoutineForm, type RoutineFormValues } from './RoutineForm';
import { valuesToFormData } from './routineFormData';

const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath }));

let client: FakeSupabaseClient;
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => client),
}));

// eslint-disable-next-line import/first
import { updateRoutine } from '@/app/actions/routines';

const CAROLYN = '6f0d0298-9cb8-469a-b5c3-e82249dbc739';
const CHRIS = '2fcaea14-6d37-4def-b56d-467d61c92f36';

const TEAM = [
  { id: CHRIS, full_name: 'Chris Pollard' },
  { id: CAROLYN, full_name: 'Carolyn Crawford' },
];

interface Fixture {
  name: string;
  agent_name: string;
  action_type: string;
  /** Exactly as stored in routines.action_config today. */
  stored: Record<string, unknown>;
  /** What must come back out after an untouched Save. */
  expected: Record<string, unknown>;
}

const FIXTURES: Fixture[] = [
  {
    name: 'Daily economic indicator poll',
    agent_name: 'simon',
    action_type: 'indicator_poll',
    stored: { backfill_periods: 18 },
    expected: { backfill_periods: 18 },
  },
  {
    name: 'Daily market report',
    agent_name: 'simon',
    action_type: 'market_report',
    stored: {},
    expected: {},
  },
  {
    name: 'Daily news curation',
    agent_name: 'charlie',
    action_type: 'news_curation',
    stored: { max_stories: 6, more_news_url: '/news', lookback_hours: 24 },
    expected: { max_stories: 6, lookback_hours: 24, more_news_url: '/news' },
  },
  {
    name: 'News: Corporate',
    agent_name: 'rex',
    action_type: 'news_ingest',
    stored: {
      queries: ['public company bitcoin treasury balance sheet corporate adoption holdings'],
      category: 'corporate',
      max_curated: 6,
      max_results_per_query: 15,
    },
    expected: {
      queries: ['public company bitcoin treasury balance sheet corporate adoption holdings'],
      category: 'corporate',
      max_curated: 6,
      max_results_per_query: 15,
      // Absent in the row; resolved from the category, matching the agent-side default.
      relevance_filter: 'au_or_bitcoin',
    },
  },
  {
    name: 'News: General',
    agent_name: 'rex',
    action_type: 'news_ingest',
    stored: {
      queries: ['Bitcoin BIP proposal protocol development consensus change soft fork'],
      category: 'international',
      max_curated: 8,
      max_results_per_query: 18,
    },
    expected: {
      queries: ['Bitcoin BIP proposal protocol development consensus change soft fork'],
      category: 'international',
      max_curated: 8,
      max_results_per_query: 18,
      relevance_filter: 'au_or_bitcoin',
    },
  },
  {
    name: 'News: Macro',
    agent_name: 'rex',
    action_type: 'news_ingest',
    stored: {
      queries: ['Federal Reserve monetary policy liquidity reverse repo bank reserves'],
      category: 'macro',
      max_curated: 6,
      max_results_per_query: 15,
    },
    expected: {
      queries: ['Federal Reserve monetary policy liquidity reverse repo bank reserves'],
      category: 'macro',
      max_curated: 6,
      max_results_per_query: 15,
      // Macro is the category that must NOT be narrowed to AU/Bitcoin.
      relevance_filter: 'none',
    },
  },
  {
    name: 'News: Source scan',
    agent_name: 'rex',
    action_type: 'news_source_scan',
    stored: { lookback_days: 3, max_items_per_source: 10 },
    expected: { lookback_days: 3, max_items_per_source: 10 },
  },
  {
    name: 'Monthly newsletter',
    agent_name: 'charlie',
    action_type: 'newsletter',
    stored: { time_range: 'month', story_count: 5, monthly_guard: true, target_word_count: 250 },
    expected: {
      time_range: 'month',
      story_count: 5,
      target_word_count: 250,
      monthly_guard: true,
      audience_context: null,
      one_off: false,
    },
  },
  {
    name: 'On-demand newsletter',
    agent_name: 'charlie',
    action_type: 'newsletter',
    stored: {
      one_off: true,
      time_range: 'month',
      story_count: 7,
      audience_context: null,
      target_word_count: 250,
    },
    expected: {
      time_range: 'month',
      story_count: 7,
      target_word_count: 250,
      audience_context: null,
      monthly_guard: false,
      // The flag that makes this routine a re-armable one-shot for /content.
      one_off: true,
    },
  },
  {
    name: 'Daily on-chain indicator poll',
    agent_name: 'simon',
    action_type: 'onchain_poll',
    stored: { backfill_days: 2600 },
    expected: { backfill_days: 2600 },
  },
  {
    name: 'Podcast: Ingest episodes',
    agent_name: 'archie',
    action_type: 'podcast_ingest',
    stored: { lookback_days: 14, max_items_per_source: 25 },
    expected: { lookback_days: 14, max_items_per_source: 25 },
  },
  {
    name: 'Daily report watch',
    agent_name: 'rex',
    action_type: 'report_watch_scan',
    stored: {},
    // Gains the explicit default the agent already falls back to.
    expected: { max_acquisitions_per_run: 10 },
  },
  {
    name: 'Social posts — Carolyn Crawford',
    agent_name: 'charlie',
    action_type: 'social_post_from_news',
    stored: {
      platforms: ['linkedin', 'twitter_x'],
      lookback_hours: 24,
      founder_team_member_id: CAROLYN,
    },
    expected: {
      founder_team_member_id: CAROLYN,
      platforms: ['linkedin', 'twitter_x'],
      lookback_hours: 24,
    },
  },
  {
    name: 'Social posts — Chris Pollard',
    agent_name: 'charlie',
    action_type: 'social_post_from_news',
    stored: {
      platforms: ['linkedin', 'twitter_x'],
      lookback_hours: 24,
      founder_team_member_id: CHRIS,
    },
    expected: {
      founder_team_member_id: CHRIS,
      platforms: ['linkedin', 'twitter_x'],
      lookback_hours: 24,
    },
  },
];

function updateCall(): Record<string, unknown> | undefined {
  const b = client.__buildersFor('routines').find((x) => x.update.mock.calls.length > 0);
  return b?.update.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
}

beforeEach(() => {
  client = createFakeSupabase();
  client.__setUser({ id: 'user-1' });
  revalidatePath.mockClear();
});

describe.each(FIXTURES)('$name ($action_type)', (fixture) => {
  const initialValues: RoutineFormValues = {
    name: fixture.name,
    description: '',
    agent_name: fixture.agent_name,
    action_type: fixture.action_type as RoutineFormValues['action_type'],
    action_config: fixture.stored,
    frequency: 'daily',
    time_of_day: '08:00',
    timezone: 'Australia/Melbourne',
    show_on_dashboard: false,
    dashboard_title: '',
    is_active: true,
  };

  it('opens for editing and saves without losing config', async () => {
    const onSubmit = vi.fn();
    render(
      <RoutineForm
        initialValues={initialValues}
        teamMembers={TEAM}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    // The form accepted it — no validation wall in front of an untouched routine.
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const submitted = onSubmit.mock.calls[0]?.[0] as RoutineFormValues;
    expect(submitted.action_type).toBe(fixture.action_type);

    const result = await updateRoutine('r-1', valuesToFormData(submitted));

    expect(result).toEqual({ success: true });
    expect(updateCall()).toMatchObject({
      action_type: fixture.action_type,
      agent_name: fixture.agent_name,
      action_config: fixture.expected,
    });
  });
});
