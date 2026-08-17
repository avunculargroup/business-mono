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
