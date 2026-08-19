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
