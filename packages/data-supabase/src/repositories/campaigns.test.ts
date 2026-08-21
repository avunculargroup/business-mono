import { beforeEach, describe, expect, it } from 'vitest';
import { testReadContext } from '@platform/data/testing';
import type { Principal } from '@platform/data';
import { createFakeSupabase, type FakeSupabaseClient } from '../../test/mocks/supabase';
import { createSupabaseRepositories } from '../bundle';
import type { PlatformSupabaseClient } from '../adapterContext';

const principal: Principal = { kind: 'team', userId: 'director-1' };
const ctx = testReadContext();

let client: FakeSupabaseClient;

function campaigns() {
  return createSupabaseRepositories(client as unknown as PlatformSupabaseClient, principal)
    .campaigns;
}

beforeEach(() => {
  client = createFakeSupabase();
});

describe('listOverview', () => {
  it('camel-cases the view row', async () => {
    client.__setResponse('v_campaign_overview', {
      data: [
        {
          id: 'camp-1',
          slug: 'q3-treasury',
          name: 'Q3 treasury series',
          objective: 'Educate CFOs',
          status: 'active',
          start_date: '2026-09-01',
          duration_weeks: 6,
          end_date: '2026-10-13',
          days_remaining: 12,
          total_variants: 24,
          published_count: 8,
          approved_count: 4,
          pending_count: 10,
          flagged_count: 2,
        },
      ],
      error: null,
    });

    expect(await campaigns().listOverview(ctx)).toEqual([
      {
        id: 'camp-1',
        slug: 'q3-treasury',
        name: 'Q3 treasury series',
        objective: 'Educate CFOs',
        status: 'active',
        startDate: '2026-09-01',
        durationWeeks: 6,
        endDate: '2026-10-13',
        daysRemaining: 12,
        totalVariants: 24,
        publishedCount: 8,
        approvedCount: 4,
        pendingCount: 10,
        flaggedCount: 2,
      },
    ]);
  });
});

describe('listAccounts', () => {
  it('offers only active accounts, by display name', async () => {
    client.__setResponse('social_accounts', {
      data: [{ id: 'acc-1', platform: 'linkedin', account_type: 'company', display_name: 'BTS' }],
      error: null,
    });

    expect(await campaigns().listAccounts(ctx)).toEqual([
      { id: 'acc-1', platform: 'linkedin', accountType: 'company', displayName: 'BTS' },
    ]);

    const builder = client.__buildersFor('social_accounts')[0];
    expect(builder.eq).toHaveBeenCalledWith('is_active', true);
    expect(builder.order).toHaveBeenCalledWith('display_name', { ascending: true });
  });
});

describe('getDetail', () => {
  function campaignRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'camp-1',
      slug: 'q3-treasury',
      name: 'Q3 treasury series',
      objective: 'Educate CFOs',
      status: 'draft',
      strategy: null,
      schedule_plan: null,
      gate_state: { gate: 'gate1', campaignId: 'camp-1', strategy: {} },
      pending_decision: null,
      workflow_run_id: 'run-1',
      ...overrides,
    };
  }

  it('reads nothing downstream before the plan is approved', async () => {
    // The beats live transiently in gate_state and no variants exist yet, so
    // three of the page's four queries had nothing to return.
    client.__setResponse('campaigns', { data: campaignRow({ status: 'draft' }), error: null });

    const detail = await campaigns().getDetail(ctx, 'q3-treasury');

    expect(detail).toMatchObject({ planLocked: false, beats: [], matrix: [], published: [] });
    expect(client.__buildersFor('campaign_beats')).toHaveLength(0);
    expect(client.__buildersFor('v_campaign_matrix')).toHaveLength(0);
  });

  it.each(['plan_approved', 'active', 'completed'])(
    'reads the locked canvas when the status is %s',
    async (status) => {
      client.__setResponse('campaigns', { data: campaignRow({ status }), error: null });
      client.__setResponse('campaign_beats', {
        data: [
          {
            id: 'b1',
            sequence: 1,
            title: 'Custody',
            core_message: 'Self-custody is the default.',
            rationale: 'Leads the series.',
            prefer_thread: true,
          },
        ],
        error: null,
      });
      client.__setResponse('v_campaign_matrix', { data: [], error: null });
      client.__setResponse('content_items', { data: [], error: null });

      const detail = await campaigns().getDetail(ctx, 'q3-treasury');

      expect(detail?.planLocked).toBe(true);
      expect(detail?.beats).toEqual([
        {
          id: 'b1',
          sequence: 1,
          title: 'Custody',
          coreMessage: 'Self-custody is the default.',
          rationale: 'Leads the series.',
          preferThread: true,
        },
      ]);
    },
  );

  it('flattens the to-many post_metrics relation to one row', async () => {
    // PostgREST returns an embedded to-many as an array even where the table
    // has one row per content item. The page used to unwrap this.
    client.__setResponse('campaigns', { data: campaignRow({ status: 'active' }), error: null });
    client.__setResponse('campaign_beats', { data: [], error: null });
    client.__setResponse('v_campaign_matrix', { data: [], error: null });
    client.__setResponse('content_items', {
      data: [
        {
          id: 'ci-1',
          title: 'A post',
          body: 'Body.',
          type: 'linkedin',
          is_thread: false,
          published_url: 'https://li.test/p/1',
          social_accounts: { display_name: 'BTS' },
          post_metrics: [{ impressions: 1200, reactions: 34, comments: 2, reposts: 1, clicks: 8 }],
        },
      ],
      error: null,
    });

    const [post] = (await campaigns().getDetail(ctx, 'q3-treasury'))!.published;

    expect(post.metrics).toEqual({
      impressions: 1200,
      reactions: 34,
      comments: 2,
      reposts: 1,
      clicks: 8,
    });
    expect(post.accountName).toBe('BTS');
  });

  it('reports no metrics for a post nobody has recorded any against', async () => {
    client.__setResponse('campaigns', { data: campaignRow({ status: 'active' }), error: null });
    client.__setResponse('campaign_beats', { data: [], error: null });
    client.__setResponse('v_campaign_matrix', { data: [], error: null });
    client.__setResponse('content_items', {
      data: [
        {
          id: 'ci-1',
          title: null,
          body: null,
          type: 'linkedin',
          is_thread: false,
          published_url: null,
          social_accounts: null,
          post_metrics: [],
        },
      ],
      error: null,
    });

    const [post] = (await campaigns().getDetail(ctx, 'q3-treasury'))!.published;

    expect(post.metrics).toBeNull();
    expect(post.accountName).toBeNull();
  });

  it('is null for a campaign that is gone', async () => {
    client.__setResponse('campaigns', { data: null, error: null });

    expect(await campaigns().getDetail(ctx, 'nope')).toBeNull();
  });
});

describe('getReadyToPost', () => {
  const queueRow = {
    id: 'ci-1',
    slug: 'a-post',
    title: 'A post',
    body: 'Body.',
    type: 'linkedin',
    is_thread: false,
    account_name: 'BTS',
    platform: 'linkedin',
    profile_url: null,
    scheduled_for: '2026-09-01T09:00:00Z',
    disclaimer_text: 'Not advice.',
  };

  beforeEach(() => {
    client.__setResponse('campaigns', {
      data: { id: 'camp-1', slug: 'q3-treasury', name: 'Q3 treasury series' },
      error: null,
    });
  });

  it('attaches each thread its own segments, in one query for all of them', async () => {
    client.__setResponse('v_ready_to_post', {
      data: [
        { ...queueRow, id: 'ci-1', is_thread: true },
        { ...queueRow, id: 'ci-2', is_thread: true },
        { ...queueRow, id: 'ci-3', is_thread: false },
      ],
      error: null,
    });
    client.__setResponse('thread_segments', {
      data: [
        { content_item_id: 'ci-1', sequence: 1, body: 'One.' },
        { content_item_id: 'ci-1', sequence: 2, body: 'Two.' },
        { content_item_id: 'ci-2', sequence: 1, body: 'Only.' },
      ],
      error: null,
    });

    const queue = await campaigns().getReadyToPost(ctx, 'q3-treasury');

    expect(queue?.items.map((item) => item.segments)).toEqual([['One.', 'Two.'], ['Only.'], []]);
    // One query, not one per thread.
    expect(client.__buildersFor('thread_segments')).toHaveLength(1);
    expect(client.__buildersFor('thread_segments')[0].in).toHaveBeenCalledWith(
      'content_item_id',
      ['ci-1', 'ci-2'],
    );
  });

  it('asks for no segments at all when nothing in the queue is a thread', async () => {
    client.__setResponse('v_ready_to_post', { data: [queueRow], error: null });

    await campaigns().getReadyToPost(ctx, 'q3-treasury');

    expect(client.__buildersFor('thread_segments')).toHaveLength(0);
  });

  it('is null for a campaign that is gone', async () => {
    client.__setResponse('campaigns', { data: null, error: null });

    expect(await campaigns().getReadyToPost(ctx, 'nope')).toBeNull();
  });
});

describe('getVariantReview', () => {
  it('resolves the parent campaign slug for the back link', async () => {
    client.__setResponse('content_items', {
      data: {
        id: 'ci-1',
        status: 'review',
        workflow_run_id: 'run-1',
        gate_state: { gate: 'variant' },
        campaign_id: 'camp-1',
      },
      error: null,
    });
    client.__setResponse('campaigns', { data: { slug: 'q3-treasury' }, error: null });

    expect(await campaigns().getVariantReview(ctx, 'ci-1')).toEqual({
      id: 'ci-1',
      status: 'review',
      gateState: { gate: 'variant' },
      campaignSlug: 'q3-treasury',
    });
  });

  it('leaves the slug null for a variant with no campaign', async () => {
    // The page links up to the campaigns list instead.
    client.__setResponse('content_items', {
      data: {
        id: 'ci-1',
        status: 'review',
        workflow_run_id: null,
        gate_state: null,
        campaign_id: null,
      },
      error: null,
    });

    const review = await campaigns().getVariantReview(ctx, 'ci-1');

    expect(review?.campaignSlug).toBeNull();
    expect(client.__buildersFor('campaigns')).toHaveLength(0);
  });
});

describe('getGate', () => {
  it('reports the open gate from gate_state', async () => {
    client.__setResponse('campaigns', {
      data: { status: 'draft', gate_state: { gate: 'strategy' }, workflow_run_id: 'run-1' },
      error: null,
    });

    expect(await campaigns().getGate(ctx, 'camp-1')).toEqual({
      status: 'draft',
      workflowRunId: 'run-1',
      openGate: 'strategy',
    });
  });

  it('reports no open gate when the run is not suspended', async () => {
    // "No run in flight" and "run in flight with no gate open" are different
    // states, and the action refuses on either — but it has to see both.
    client.__setResponse('campaigns', {
      data: { status: 'plan_approved', gate_state: null, workflow_run_id: 'run-1' },
      error: null,
    });

    expect(await campaigns().getGate(ctx, 'camp-1')).toMatchObject({
      workflowRunId: 'run-1',
      openGate: null,
    });
  });

  it('is null for a campaign that is gone', async () => {
    client.__setResponse('campaigns', { data: null, error: null });

    expect(await campaigns().getGate(ctx, 'nope')).toBeNull();
  });
});

describe('the decision handoff', () => {
  it('writes a campaign decision to pending_decision', async () => {
    client.__setResponse('campaigns', { data: null, error: null });

    await campaigns().setCampaignDecision('camp-1', {
      decision: 'request_change',
      instruction: 'Lead with the custody angle.',
    });

    const builder = client.__buildersFor('campaigns')[0];
    expect(builder.update).toHaveBeenCalledWith({
      pending_decision: { decision: 'request_change', instruction: 'Lead with the custody angle.' },
    });
    expect(builder.eq).toHaveBeenCalledWith('id', 'camp-1');
  });

  it('writes a variant decision against the content item', async () => {
    client.__setResponse('content_items', { data: null, error: null });

    await campaigns().setVariantDecision('ci-1', { decision: 'approve' });

    expect(client.__buildersFor('content_items')[0].update).toHaveBeenCalledWith({
      pending_decision: { decision: 'approve' },
    });
  });
});

describe('createDraft', () => {
  it('returns the new id the wizard needs to advance', async () => {
    client.__setResponse('campaigns', { data: { id: 'camp-new' }, error: null });

    expect(
      await campaigns().createDraft({
        name: 'Q3 treasury series',
        objective: 'Educate CFOs',
        audienceFilter: { industry: ['mining'] },
        audiencePersona: null,
      }),
    ).toBe('camp-new');

    expect(client.__buildersFor('campaigns')[0].insert).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Q3 treasury series', status: 'draft' }),
    );
  });
});

describe('saveCadenceAndLaunch', () => {
  const cadence = {
    accountIds: ['acc-1', 'acc-2'],
    postsPerWeek: 3,
    slots: [{ day: 'MO', time: '09:00' }],
    durationWeeks: 6,
    startDate: '2026-09-01',
  };

  beforeEach(() => {
    client.__setResponse('campaigns', { data: null, error: null });
    client.__setResponse('campaign_accounts', { data: null, error: null });
  });

  it('signals the launch last, after the campaign is fully built', async () => {
    await campaigns().saveCadenceAndLaunch('camp-1', cadence);

    // The listener reacts to pending_decision, so it must be the final write —
    // otherwise the strategy run can start against a campaign with no accounts.
    const campaignWrites = client.__buildersFor('campaigns');
    expect(campaignWrites).toHaveLength(2);
    expect(campaignWrites[0].update).toHaveBeenCalledWith(
      expect.objectContaining({ posts_per_week: 3, duration_weeks: 6 }),
    );
    expect(campaignWrites[1].update).toHaveBeenCalledWith({
      pending_decision: { decision: 'start' },
    });
  });

  it('replaces the participating accounts wholesale', async () => {
    await campaigns().saveCadenceAndLaunch('camp-1', cadence);

    const [clear, insert] = client.__buildersFor('campaign_accounts');
    expect(clear.delete).toHaveBeenCalled();
    expect(clear.eq).toHaveBeenCalledWith('campaign_id', 'camp-1');
    expect(insert.insert).toHaveBeenCalledWith([
      { campaign_id: 'camp-1', social_account_id: 'acc-1' },
      { campaign_id: 'camp-1', social_account_id: 'acc-2' },
    ]);
  });

  it('does not signal a launch when the accounts insert fails', async () => {
    // There is no transaction here, so the campaign is left without accounts —
    // pre-existing. What must not happen on top of that is the run starting.
    client.__setResponse('campaign_accounts', { data: null, error: { message: 'denied' } });

    await expect(campaigns().saveCadenceAndLaunch('camp-1', cadence)).rejects.toMatchObject({
      message: 'denied',
    });
    expect(client.__buildersFor('campaigns')).toHaveLength(1);
  });
});

describe('markVariantPosted', () => {
  it('rides the approved check on the update rather than reading first', async () => {
    client.__setResponse('content_items', { data: [{ id: 'ci-1' }], error: null });

    expect(await campaigns().markVariantPosted('ci-1', 'https://li.test/p/1')).toBe(true);

    const builder = client.__buildersFor('content_items')[0];
    expect(builder.eq).toHaveBeenCalledWith('id', 'ci-1');
    // Two submits racing must not both find the row approved and both write.
    expect(builder.eq).toHaveBeenCalledWith('status', 'approved');
    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({ published_url: 'https://li.test/p/1', status: 'published' }),
    );
  });

  it('reports false when the row had already moved on', async () => {
    client.__setResponse('content_items', { data: [], error: null });

    expect(await campaigns().markVariantPosted('ci-1', 'https://li.test/p/1')).toBe(false);
  });
});

describe('saveVariantCopy', () => {
  function withGateState(gateState: unknown) {
    client.__queueResponses('content_items', [
      { data: { gate_state: gateState }, error: null },
      { data: null, error: null },
    ]);
    client.__setResponse('thread_segments', { data: null, error: null });
  }

  it('resets compliance, because a cleared verdict must not survive an edit', async () => {
    withGateState(null);

    await campaigns().saveVariantCopy('ci-1', { isThread: false, body: 'Edited.', segments: [] });

    expect(client.__buildersFor('content_items')[1].update).toHaveBeenCalledWith(
      expect.objectContaining({ compliance_status: 'pending', compliance_checked_at: null }),
    );
  });

  it('patches the suspended preview so the editor shows the edit at once', async () => {
    withGateState({ gate: 'variant', preview: { body: 'Old copy.', charCount: 9, extra: 'kept' } });

    await campaigns().saveVariantCopy('ci-1', { isThread: false, body: 'New copy.', segments: [] });

    const [update] = client.__buildersFor('content_items')[1].update.mock.calls[0];
    expect(update.gate_state).toEqual({
      gate: 'variant',
      preview: {
        body: 'New copy.',
        isThread: false,
        segments: [],
        charCount: 9,
        // Everything else in the preview survives the patch.
        extra: 'kept',
      },
    });
  });

  it('leaves gate_state alone when there is no preview to patch', async () => {
    withGateState({ gate: 'variant' });

    await campaigns().saveVariantCopy('ci-1', { isThread: false, body: 'New.', segments: [] });

    const [update] = client.__buildersFor('content_items')[1].update.mock.calls[0];
    expect(update.gate_state).toEqual({ gate: 'variant' });
  });

  it('counts a thread the way the platform renders it', async () => {
    withGateState({ preview: {} });

    await campaigns().saveVariantCopy('ci-1', {
      isThread: true,
      body: '',
      segments: ['One', 'Two'],
    });

    // '1/ One\n\n2/ Two' — the numbering is part of what gets posted.
    const [update] = client.__buildersFor('content_items')[1].update.mock.calls[0];
    expect(update.gate_state.preview.charCount).toBe(14);
    // A thread's length lives on its segments, so the row's own count is null.
    expect(update.char_count).toBeNull();
  });

  it('counts codepoints rather than UTF-16 units', async () => {
    withGateState(null);

    await campaigns().saveVariantCopy('ci-1', { isThread: false, body: '🧡🧡', segments: [] });

    // `.length` would say 4 and overstate the post against the platform limit.
    expect(client.__buildersFor('content_items')[1].update).toHaveBeenCalledWith(
      expect.objectContaining({ char_count: 2 }),
    );
  });

  it('replaces the thread segments, numbered from one', async () => {
    withGateState(null);

    await campaigns().saveVariantCopy('ci-1', {
      isThread: true,
      body: '',
      segments: ['First', 'Second'],
    });

    const [clear, insert] = client.__buildersFor('thread_segments');
    expect(clear.delete).toHaveBeenCalled();
    expect(insert.insert).toHaveBeenCalledWith([
      { content_item_id: 'ci-1', sequence: 1, body: 'First', char_count: 5 },
      { content_item_id: 'ci-1', sequence: 2, body: 'Second', char_count: 6 },
    ]);
  });

  it('clears the segments of a thread turned back into a single post', async () => {
    withGateState(null);

    await campaigns().saveVariantCopy('ci-1', { isThread: false, body: 'One post.', segments: [] });

    const segmentWrites = client.__buildersFor('thread_segments');
    expect(segmentWrites).toHaveLength(1);
    expect(segmentWrites[0].delete).toHaveBeenCalled();
  });

  it('reports false for a variant that is gone', async () => {
    client.__setResponse('content_items', { data: null, error: null });

    expect(
      await campaigns().saveVariantCopy('nope', { isThread: false, body: 'x', segments: [] }),
    ).toBe(false);
  });
});

describe('savePostMetrics', () => {
  it('records the actor from the bound principal, not from an argument', async () => {
    client.__setResponse('post_metrics', { data: null, error: null });

    await campaigns().savePostMetrics('ci-1', 'linkedin', {
      impressions: 1200,
      reactions: 34,
      comments: null,
      reposts: null,
      clicks: 8,
    });

    expect(client.__buildersFor('post_metrics')[0].upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        content_item_id: 'ci-1',
        platform: 'linkedin',
        impressions: 1200,
        recorded_by: 'director-1',
      }),
      { onConflict: 'content_item_id' },
    );
  });
});

describe('promoteToVoiceSnippet', () => {
  const snippet = {
    body: 'A strong opener.',
    curatorNote: 'Shows the plain register.',
    snippetType: 'opener',
    topicTags: ['custody'],
  };

  it('anchors the snippet to the post account and the bound principal', async () => {
    client.__setResponse('content_items', {
      data: { social_account_id: 'acc-1', type: 'linkedin' },
      error: null,
    });
    client.__setResponse('voice_snippets', { data: null, error: null });

    await campaigns().promoteToVoiceSnippet('ci-1', snippet);

    expect(client.__buildersFor('voice_snippets')[0].insert).toHaveBeenCalledWith(
      expect.objectContaining({
        social_account_id: 'acc-1',
        platform: 'linkedin',
        source: 'promoted_from_post',
        source_content_item_id: 'ci-1',
        created_by: 'director-1',
      }),
    );
  });

  it('stores no platform for a post that has no platform voice', async () => {
    // `voice_snippets.platform` only recognises the two social platforms; a
    // newsletter has no platform voice to anchor to.
    client.__setResponse('content_items', {
      data: { social_account_id: null, type: 'newsletter' },
      error: null,
    });
    client.__setResponse('voice_snippets', { data: null, error: null });

    await campaigns().promoteToVoiceSnippet('ci-1', snippet);

    expect(client.__buildersFor('voice_snippets')[0].insert).toHaveBeenCalledWith(
      expect.objectContaining({ platform: null, social_account_id: null }),
    );
  });
});
