import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabaseClient } from '@/test/mocks/supabase';

const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath }));

let client: FakeSupabaseClient;
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => client),
}));

import { updateContentBody, scheduleContent, postContentNow } from './content';

function approvedLinkedInItem(overrides: Record<string, unknown> = {}) {
  return {
    status: 'approved',
    type: 'linkedin',
    body: 'A cleared post.',
    approved_by: 'tm-1',
    compliance_status: 'cleared',
    is_thread: false,
    social_account_id: 'acc-1',
    ...overrides,
  };
}

function wireSchedule(item: Record<string, unknown>, extras?: {
  credential?: Record<string, unknown> | null;
  maxChars?: number;
}) {
  // The follow-up UPDATE only reads `error`, so one response serves both calls.
  client.__setResponse('content_items', { data: item, error: null });
  client.__setResponse('social_credentials', {
    data:
      extras?.credential === null
        ? null
        : { expires_at: new Date(Date.now() + 86400000).toISOString(), ...extras?.credential },
    error: null,
  });
  client.__setResponse('platform_specs', { data: { max_chars: extras?.maxChars ?? 3000 }, error: null });
}

function contentUpdateCall(): Record<string, unknown> | undefined {
  const builder = client.__buildersFor('content_items').find((b) => b.update.mock.calls.length > 0);
  return builder?.update.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
}

beforeEach(() => {
  client = createFakeSupabase();
  client.__setUser({ id: 'user-1' });
  revalidatePath.mockClear();
});

describe('updateContentBody', () => {
  it('saves the body and resets compliance for account-linked drafts', async () => {
    client.__setResponse('content_items', {
      data: { status: 'approved', is_thread: false, campaign_id: null, social_account_id: 'acc-1', publish_locked_at: null },
      error: null,
    });

    const result = await updateContentBody('ci-1', { body: 'Edited body.' });

    expect(result).toEqual({ success: true });
    expect(contentUpdateCall()).toMatchObject({
      body: 'Edited body.',
      compliance_status: 'pending',
      compliance_checked_at: null,
    });
    expect(revalidatePath).toHaveBeenCalledWith('/content');
  });

  it('does not touch compliance for unlinked items', async () => {
    client.__setResponse('content_items', {
      data: { status: 'draft', is_thread: false, campaign_id: null, social_account_id: null, publish_locked_at: null },
      error: null,
    });

    await updateContentBody('ci-1', { body: 'New body.' });

    expect(contentUpdateCall()).not.toHaveProperty('compliance_status');
  });

  it('refuses to edit published content', async () => {
    client.__setResponse('content_items', {
      data: { status: 'published', is_thread: false, campaign_id: null, social_account_id: null, publish_locked_at: null },
      error: null,
    });

    const result = await updateContentBody('ci-1', { body: 'Too late.' });

    expect(result.error).toMatch(/published/i);
  });

  it('refuses to edit while the publisher holds the row', async () => {
    client.__setResponse('content_items', {
      data: { status: 'scheduled', is_thread: false, campaign_id: null, social_account_id: 'acc-1', publish_locked_at: new Date().toISOString() },
      error: null,
    });

    const result = await updateContentBody('ci-1', { body: 'Mid-publish.' });

    expect(result.error).toMatch(/being published/i);
  });
});

describe('scheduleContent', () => {
  it('schedules an approved, cleared, connected LinkedIn post', async () => {
    wireSchedule(approvedLinkedInItem());

    const result = await scheduleContent('ci-1', '2026-08-01T09:00:00.000Z');

    expect(result).toEqual({ success: true });
    expect(contentUpdateCall()).toMatchObject({
      status: 'scheduled',
      scheduled_for: '2026-08-01T09:00:00.000Z',
      publish_error: null,
      publish_attempts: 0,
      publish_locked_at: null,
    });
  });

  it('rejects unapproved posts', async () => {
    wireSchedule(approvedLinkedInItem({ status: 'draft' }));
    const result = await scheduleContent('ci-1', '2026-08-01T09:00:00.000Z');
    expect(result.error).toMatch(/approve/i);
  });

  it('rejects posts without a human approver', async () => {
    wireSchedule(approvedLinkedInItem({ approved_by: null }));
    const result = await scheduleContent('ci-1', '2026-08-01T09:00:00.000Z');
    expect(result.error).toMatch(/approved by a person/i);
  });

  it('rejects uncleared compliance', async () => {
    wireSchedule(approvedLinkedInItem({ compliance_status: 'flagged' }));
    const result = await scheduleContent('ci-1', '2026-08-01T09:00:00.000Z');
    expect(result.error).toMatch(/compliance/i);
  });

  it('rejects non-LinkedIn types', async () => {
    wireSchedule(approvedLinkedInItem({ type: 'newsletter' }));
    const result = await scheduleContent('ci-1', '2026-08-01T09:00:00.000Z');
    expect(result.error).toMatch(/linkedin/i);
  });

  it('rejects when the account is not connected', async () => {
    wireSchedule(approvedLinkedInItem(), { credential: null });
    const result = await scheduleContent('ci-1', '2026-08-01T09:00:00.000Z');
    expect(result.error).toMatch(/not connected/i);
  });

  it('rejects an expired token', async () => {
    wireSchedule(approvedLinkedInItem(), {
      credential: { expires_at: new Date(Date.now() - 1000).toISOString() },
    });
    const result = await scheduleContent('ci-1', '2026-08-01T09:00:00.000Z');
    expect(result.error).toMatch(/expired/i);
  });

  it('rejects over-length bodies', async () => {
    wireSchedule(approvedLinkedInItem({ body: 'x'.repeat(3001) }));
    const result = await scheduleContent('ci-1', '2026-08-01T09:00:00.000Z');
    expect(result.error).toMatch(/3000/);
  });
});

describe('postContentNow', () => {
  it('schedules for now', async () => {
    wireSchedule(approvedLinkedInItem());
    const before = Date.now();

    const result = await postContentNow('ci-1');

    expect(result).toEqual({ success: true });
    const scheduledFor = contentUpdateCall()?.scheduled_for as string;
    expect(new Date(scheduledFor).getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(new Date(scheduledFor).getTime()).toBeLessThanOrEqual(Date.now());
  });
});
