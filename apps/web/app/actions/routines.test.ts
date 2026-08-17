import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabaseClient } from '@/test/mocks/supabase';

const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath }));

let client: FakeSupabaseClient;
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => client),
}));

import { createRoutine, updateRoutine } from './routines';

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const SCHEDULE = {
  frequency: 'daily',
  time_of_day: '06:45',
  timezone: 'Australia/Melbourne',
  show_on_dashboard: 'true',
  dashboard_title: 'Podcast ingestion',
  is_active: 'true',
};

function podcastForm(overrides: Record<string, string> = {}): FormData {
  return formData({
    name: 'Podcast: Ingest episodes',
    description: 'Daily ingestion of podcast feeds.',
    agent_name: 'archie',
    action_type: 'podcast_ingest',
    max_items_per_source: '25',
    lookback_days: '14',
    ...SCHEDULE,
    ...overrides,
  });
}

function updateCall(table: string): Record<string, unknown> | undefined {
  const b = client.__buildersFor(table).find((x) => x.update.mock.calls.length > 0);
  return b?.update.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
}

function insertCall(table: string): Record<string, unknown> | undefined {
  const b = client.__buildersFor(table).find((x) => x.insert.mock.calls.length > 0);
  return b?.insert.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
}

beforeEach(() => {
  client = createFakeSupabase();
  client.__setUser({ id: 'user-1' });
  revalidatePath.mockClear();
});

describe('podcast_ingest routines', () => {
  it('updates without demanding a subject or search queries', async () => {
    const result = await updateRoutine('r-1', podcastForm({ lookback_days: '7' }));

    expect(result).toEqual({ success: true });
    expect(updateCall('routines')).toMatchObject({
      action_type: 'podcast_ingest',
      action_config: { max_items_per_source: 25, lookback_days: 7 },
    });
  });

  it('creates with the podcast config and no research-digest leftovers', async () => {
    client.__setResponse('routines', { data: { id: 'r-2' }, error: null });

    const result = await createRoutine(podcastForm());

    expect(result).toMatchObject({ success: true });
    expect(insertCall('routines')?.['action_config']).toEqual({
      max_items_per_source: 25,
      lookback_days: 14,
    });
  });

  it('falls back to the seeded defaults when the numbers are absent', async () => {
    const fd = podcastForm();
    fd.delete('max_items_per_source');
    fd.delete('lookback_days');

    await updateRoutine('r-1', fd);

    expect(updateCall('routines')?.['action_config']).toEqual({
      max_items_per_source: 25,
      lookback_days: 14,
    });
  });

  it('rejects an out-of-range lookback', async () => {
    const result = await updateRoutine('r-1', podcastForm({ lookback_days: '365' }));

    expect(result.error).toBeTruthy();
    expect(updateCall('routines')).toBeUndefined();
  });
});

describe('news_curation routines', () => {
  it('persists the submitted limits instead of silently resetting them', async () => {
    const result = await updateRoutine(
      'r-3',
      formData({
        name: 'Daily news digest',
        description: '',
        agent_name: 'charlie',
        action_type: 'news_curation',
        max_stories: '4',
        lookback_hours: '48',
        ...SCHEDULE,
        dashboard_title: 'Today in Bitcoin',
      }),
    );

    expect(result).toEqual({ success: true });
    expect(updateCall('routines')?.['action_config']).toEqual({
      max_stories: 4,
      lookback_hours: 48,
      more_news_url: '/news',
    });
  });
});

/**
 * Every action_type the agent-side executeRoutineWorkflow dispatches must be
 * saveable. A type missing from the schema union used to fail validation
 * outright, so the routine could not be edited at all — not its schedule, not
 * even its Active toggle.
 */
describe('action types the workflow can run', () => {
  const cases: Array<[string, Record<string, string>, Record<string, unknown>]> = [
    [
      'news_source_scan',
      { agent_name: 'rex', max_items_per_source: '10', lookback_days: '3' },
      { max_items_per_source: 10, lookback_days: 3 },
    ],
    [
      'newsletter',
      {
        agent_name: 'charlie',
        time_range: 'month',
        story_count: '5',
        target_word_count: '250',
        audience_context: '',
        monthly_guard: 'true',
        one_off: 'false',
      },
      {
        time_range: 'month',
        story_count: 5,
        target_word_count: 250,
        audience_context: null,
        monthly_guard: true,
        one_off: false,
      },
    ],
    [
      'social_post_from_news',
      {
        agent_name: 'charlie',
        founder_team_member_id: '2fcaea14-6d37-4def-b56d-467d61c92f36',
        platforms: JSON.stringify(['linkedin', 'twitter_x']),
        lookback_hours: '24',
      },
      {
        founder_team_member_id: '2fcaea14-6d37-4def-b56d-467d61c92f36',
        platforms: ['linkedin', 'twitter_x'],
        lookback_hours: 24,
      },
    ],
    ['indicator_poll', { agent_name: 'simon', backfill_periods: '18' }, { backfill_periods: 18 }],
    ['onchain_poll', { agent_name: 'simon', backfill_days: '2600' }, { backfill_days: 2600 }],
    ['market_report', { agent_name: 'simon' }, {}],
    [
      'report_watch_scan',
      { agent_name: 'rex', max_acquisitions_per_run: '10' },
      { max_acquisitions_per_run: 10 },
    ],
  ];

  it.each(cases)('saves a %s routine', async (actionType, fields, expected) => {
    const result = await updateRoutine(
      'r-1',
      formData({ name: `A ${actionType} routine`, description: '', action_type: actionType, ...SCHEDULE, ...fields }),
    );

    expect(result).toEqual({ success: true });
    expect(updateCall('routines')).toMatchObject({
      action_type: actionType,
      action_config: expected,
    });
  });
});

describe('newsletter routines', () => {
  function newsletterForm(overrides: Record<string, string> = {}): FormData {
    return formData({
      name: 'On-demand newsletter',
      description: '',
      agent_name: 'charlie',
      action_type: 'newsletter',
      time_range: 'month',
      story_count: '7',
      target_word_count: '250',
      audience_context: '',
      monthly_guard: 'false',
      one_off: 'true',
      ...SCHEDULE,
      ...overrides,
    });
  }

  it('keeps one_off set so the on-demand routine stays a one-shot', async () => {
    await updateRoutine('r-4', newsletterForm());

    expect(updateCall('routines')?.['action_config']).toMatchObject({ one_off: true });
  });

  it('rejects a story count above 8', async () => {
    const result = await updateRoutine('r-4', newsletterForm({ story_count: '12' }));

    expect(result.error).toBeTruthy();
    expect(updateCall('routines')).toBeUndefined();
  });
});

describe('social_post_from_news routines', () => {
  function socialForm(overrides: Record<string, string> = {}): FormData {
    return formData({
      name: 'Social posts — Chris Pollard',
      description: '',
      agent_name: 'charlie',
      action_type: 'social_post_from_news',
      founder_team_member_id: '2fcaea14-6d37-4def-b56d-467d61c92f36',
      platforms: JSON.stringify(['linkedin', 'twitter_x']),
      lookback_hours: '24',
      ...SCHEDULE,
      ...overrides,
    });
  }

  it('rejects a missing founder', async () => {
    const result = await updateRoutine('r-5', socialForm({ founder_team_member_id: '' }));

    expect(result.error).toBe('Pick the founder these posts are for');
    expect(updateCall('routines')).toBeUndefined();
  });

  it('rejects an empty platform list', async () => {
    const result = await updateRoutine('r-5', socialForm({ platforms: '[]' }));

    expect(result.error).toBe('Pick at least one platform');
    expect(updateCall('routines')).toBeUndefined();
  });

  it('accepts a single platform', async () => {
    await updateRoutine('r-5', socialForm({ platforms: JSON.stringify(['linkedin']) }));

    expect(updateCall('routines')?.['action_config']).toMatchObject({ platforms: ['linkedin'] });
  });
});

describe('config fields that must survive an edit', () => {
  function newsIngestForm(overrides: Record<string, string> = {}): FormData {
    return formData({
      name: 'News: Macro',
      description: '',
      agent_name: 'rex',
      action_type: 'news_ingest',
      category: 'macro',
      queries: JSON.stringify(['Federal Reserve monetary policy']),
      max_results_per_query: '15',
      max_curated: '6',
      ...SCHEDULE,
      ...overrides,
    });
  }

  it('persists the chosen relevance filter', async () => {
    await updateRoutine('r-6', newsIngestForm({ relevance_filter: 'bitcoin' }));

    expect(updateCall('routines')?.['action_config']).toMatchObject({ relevance_filter: 'bitcoin' });
  });

  it('falls back to the category default when the filter is absent', async () => {
    await updateRoutine('r-6', newsIngestForm());

    expect(updateCall('routines')?.['action_config']).toMatchObject({ relevance_filter: 'none' });
  });

  it('keeps the monitor_change baseline digest', async () => {
    await updateRoutine(
      'r-7',
      formData({
        name: 'ASIC watch',
        description: '',
        agent_name: 'rex',
        action_type: 'monitor_change',
        subject: 'ASIC guidance',
        search_queries: 'ASIC digital asset guidance',
        notify_signal: 'true',
        last_digest: 'Previously: no change since March.',
        ...SCHEDULE,
      }),
    );

    expect(updateCall('routines')?.['action_config']).toMatchObject({
      last_digest: 'Previously: no change since March.',
    });
  });
});

describe('blank numeric fields', () => {
  it('falls back to the default rather than failing on 0', async () => {
    const result = await updateRoutine('r-8', podcastForm({ lookback_days: '' }));

    expect(result).toEqual({ success: true });
    expect(updateCall('routines')?.['action_config']).toEqual({
      max_items_per_source: 25,
      lookback_days: 14,
    });
  });
});
