import { beforeEach, describe, expect, it } from 'vitest';
import { expectPaginationContract, testReadContext } from '@platform/data/testing';
import type { Principal } from '@platform/data';
import { createFakeSupabase, type FakeSupabaseClient } from '../../test/mocks/supabase';
import { createSupabaseRepositories } from '../bundle';
import type { PlatformSupabaseClient } from '../adapterContext';

const principal: Principal = { kind: 'team', userId: 'director-1' };
const ctx = testReadContext();

let client: FakeSupabaseClient;

function content() {
  return createSupabaseRepositories(client as unknown as PlatformSupabaseClient, principal)
    .content;
}

function cardRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    slug: 'why-treasuries-hold-bitcoin',
    title: 'Why treasuries hold Bitcoin',
    type: 'linkedin',
    status: 'draft',
    scheduled_for: null,
    publish_error: null,
    created_by: null,
    campaigns: null,
    social_accounts: null,
    ...overrides,
  };
}

beforeEach(() => {
  client = createFakeSupabase();
});

describe('listCards', () => {
  it('satisfies the pagination contract', async () => {
    client.__setRows('content_items', [
      cardRow({ id: 'c' }),
      cardRow({ id: 'b' }),
      cardRow({ id: 'a' }),
    ]);

    await expectPaginationContract((readCtx, opts) => content().listCards(readCtx, opts), {
      total: 3,
      ctx,
    });
  });

  it('flattens the embedded campaign and account names', async () => {
    client.__setRows('content_items', [
      cardRow({
        campaigns: { name: 'Q3 treasury series' },
        social_accounts: { display_name: 'BTS on LinkedIn', platform: 'linkedin' },
      }),
    ]);

    const [card] = (await content().listCards(ctx)).items;

    expect(card).toMatchObject({
      campaignName: 'Q3 treasury series',
      accountName: 'BTS on LinkedIn',
      platform: 'linkedin',
    });
  });

  it('leaves the names null for an unlinked draft', async () => {
    client.__setRows('content_items', [cardRow()]);

    const [card] = (await content().listCards(ctx)).items;

    expect(card).toMatchObject({ campaignName: null, accountName: null, platform: null });
  });

  it('orders newest first, in the query', async () => {
    client.__setRows('content_items', [cardRow()]);

    await content().listCards(ctx);

    expect(client.__buildersFor('content_items')[0].order).toHaveBeenCalledWith('created_at', {
      ascending: false,
    });
  });
});

describe('getPublishGate', () => {
  function gateRow(overrides: Record<string, unknown> = {}) {
    return {
      status: 'approved',
      type: 'linkedin',
      body: 'A post body.',
      approved_by: 'director-1',
      compliance_status: 'cleared',
      is_thread: false,
      social_account_id: 'acct-1',
      ...overrides,
    };
  }

  it('gathers the item, its credential and the platform limit into one answer', async () => {
    client.__setResponse('content_items', { data: gateRow(), error: null });
    client.__setResponse('social_credentials', {
      data: { expires_at: '2027-01-01T00:00:00Z' },
      error: null,
    });
    client.__setResponse('platform_specs', { data: { max_chars: 3000 }, error: null });

    expect(await content().getPublishGate(ctx, 'c1')).toEqual({
      status: 'approved',
      type: 'linkedin',
      body: 'A post body.',
      isThread: false,
      approvedBy: 'director-1',
      complianceStatus: 'cleared',
      socialAccountId: 'acct-1',
      credentialExpiresAt: '2027-01-01T00:00:00Z',
      maxChars: 3000,
    });
  });

  it('looks the spec up by the item type, not by a hardcoded platform', async () => {
    // The action only schedules LinkedIn today, but a gate that always asked
    // for LinkedIn's limit would silently pass the wrong one the day it does not.
    client.__setResponse('content_items', { data: gateRow({ type: 'twitter_x' }), error: null });

    await content().getPublishGate(ctx, 'c1');

    expect(client.__buildersFor('platform_specs')[0].eq).toHaveBeenCalledWith(
      'platform',
      'twitter_x',
    );
  });

  it('does not ask for a credential when the post has no account', async () => {
    client.__setResponse('content_items', {
      data: gateRow({ social_account_id: null }),
      error: null,
    });

    const gate = await content().getPublishGate(ctx, 'c1');

    expect(gate?.credentialExpiresAt).toBeNull();
    expect(client.__buildersFor('social_credentials')).toHaveLength(0);
  });

  it('reports a missing credential as null rather than failing', async () => {
    // "Not connected" and "connected but expired" are different messages to a
    // director, so the gate has to be able to tell them apart.
    client.__setResponse('content_items', { data: gateRow(), error: null });
    client.__setResponse('social_credentials', { data: null, error: null });

    const gate = await content().getPublishGate(ctx, 'c1');

    expect(gate?.credentialExpiresAt).toBeNull();
  });

  it('is null for an item that is gone, so the caller can word it', async () => {
    client.__setResponse('content_items', { data: null, error: null });

    expect(await content().getPublishGate(ctx, 'nope')).toBeNull();
  });
});

describe('getEditGuard', () => {
  it('reports the publish lock as a boolean, not a timestamp', async () => {
    client.__setResponse('content_items', {
      data: {
        status: 'draft',
        is_thread: false,
        campaign_id: null,
        social_account_id: null,
        publish_locked_at: '2026-08-19T00:00:00Z',
      },
      error: null,
    });

    expect(await content().getEditGuard(ctx, 'c1')).toEqual({
      status: 'draft',
      isThread: false,
      isPublishLocked: true,
    });
  });

  it('is not locked when the poller does not hold the row', async () => {
    client.__setResponse('content_items', {
      data: {
        status: 'draft',
        is_thread: true,
        campaign_id: null,
        social_account_id: null,
        publish_locked_at: null,
      },
      error: null,
    });

    expect(await content().getEditGuard(ctx, 'c1')).toMatchObject({
      isPublishLocked: false,
      isThread: true,
    });
  });

  it('is null for an item that is gone', async () => {
    client.__setResponse('content_items', { data: null, error: null });

    expect(await content().getEditGuard(ctx, 'nope')).toBeNull();
  });
});

describe('updateBody', () => {
  it('stores the body and its character count', async () => {
    client.__queueResponses('content_items', [
      { data: { campaign_id: null, social_account_id: null }, error: null },
      { data: null, error: null },
    ]);

    await content().updateBody('c1', { body: 'Twelve chars' });

    expect(client.__buildersFor('content_items')[1].update).toHaveBeenCalledWith({
      body: 'Twelve chars',
      char_count: 12,
    });
  });

  it('resets compliance on an account-linked draft', async () => {
    // A cleared verdict must not survive an edit. Decided from the row, not
    // from a caller-supplied flag, so a caller cannot forget it.
    client.__queueResponses('content_items', [
      { data: { campaign_id: null, social_account_id: 'acct-1' }, error: null },
      { data: null, error: null },
    ]);

    await content().updateBody('c1', { body: 'Edited.' });

    expect(client.__buildersFor('content_items')[1].update).toHaveBeenCalledWith(
      expect.objectContaining({ compliance_status: 'pending', compliance_checked_at: null }),
    );
  });

  it('resets compliance on a campaign-linked draft too', async () => {
    client.__queueResponses('content_items', [
      { data: { campaign_id: 'camp-1', social_account_id: null }, error: null },
      { data: null, error: null },
    ]);

    await content().updateBody('c1', { body: 'Edited.' });

    expect(client.__buildersFor('content_items')[1].update).toHaveBeenCalledWith(
      expect.objectContaining({ compliance_status: 'pending' }),
    );
  });

  it('leaves compliance alone on an unlinked draft', async () => {
    client.__queueResponses('content_items', [
      { data: { campaign_id: null, social_account_id: null }, error: null },
      { data: null, error: null },
    ]);

    await content().updateBody('c1', { body: 'Edited.' });

    const [update] = client.__buildersFor('content_items')[1].update.mock.calls[0];
    expect(update).not.toHaveProperty('compliance_status');
  });

  it('only touches the title when one is given', async () => {
    client.__queueResponses('content_items', [
      { data: { campaign_id: null, social_account_id: null }, error: null },
      { data: null, error: null },
    ]);

    await content().updateBody('c1', { title: 'A title', body: 'Edited.' });

    expect(client.__buildersFor('content_items')[1].update).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'A title' }),
    );
  });

  it('stores an empty body as null rather than an empty string', async () => {
    client.__queueResponses('content_items', [
      { data: { campaign_id: null, social_account_id: null }, error: null },
      { data: null, error: null },
    ]);

    await content().updateBody('c1', { body: '' });

    expect(client.__buildersFor('content_items')[1].update).toHaveBeenCalledWith(
      expect.objectContaining({ body: null, char_count: 0 }),
    );
  });
});

describe('schedule', () => {
  it('queues the post and clears the previous failure', async () => {
    client.__setResponse('content_items', { data: null, error: null });

    await content().schedule('c1', new Date('2026-09-01T09:00:00Z'));

    expect(client.__buildersFor('content_items')[0].update).toHaveBeenCalledWith({
      status: 'scheduled',
      scheduled_for: '2026-09-01T09:00:00.000Z',
      // A re-schedule that left publish_error set would keep showing an error
      // for an attempt that is no longer pending.
      publish_error: null,
      publish_attempts: 0,
      publish_locked_at: null,
    });
  });

  it('throws so the action can humanise it', async () => {
    client.__setResponse('content_items', { data: null, error: { message: 'nope' } });

    await expect(content().schedule('c1', new Date())).rejects.toMatchObject({
      message: 'nope',
    });
  });
});

describe('getDetail', () => {
  function detailRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'c1',
      title: 'Why treasuries hold Bitcoin',
      type: 'linkedin',
      status: 'draft',
      body: 'A draft body.',
      is_thread: false,
      social_account_id: null,
      scheduled_for: null,
      published_at: null,
      publish_error: null,
      created_at: '2026-08-19T00:00:00Z',
      updated_at: '2026-08-19T00:00:00Z',
      ...overrides,
    };
  }

  it('matches by id when given a uuid and by slug otherwise', async () => {
    client.__setResponse('content_items', { data: detailRow(), error: null });

    await content().getDetail(ctx, '2b8f4c1a-0000-4000-8000-000000000001');
    expect(client.__buildersFor('content_items')[0].eq).toHaveBeenCalledWith(
      'id',
      '2b8f4c1a-0000-4000-8000-000000000001',
    );

    client = createFakeSupabase();
    client.__setResponse('content_items', { data: detailRow(), error: null });

    // A board card links by slug, the social-draft email links by id. Which
    // column that is, is the adapter's business now.
    await content().getDetail(ctx, 'why-treasuries-hold-bitcoin');
    expect(client.__buildersFor('content_items')[0].eq).toHaveBeenCalledWith(
      'slug',
      'why-treasuries-hold-bitcoin',
    );
  });

  it('reads no segments and no feedback for a plain unlinked draft', async () => {
    client.__setResponse('content_items', { data: detailRow(), error: null });

    const detail = await content().getDetail(ctx, 'c1');

    expect(detail).toMatchObject({ threadSegments: [], priorFeedback: [] });
    expect(client.__buildersFor('thread_segments')).toHaveLength(0);
    expect(client.__buildersFor('content_feedback')).toHaveLength(0);
  });

  it('reads segments for a thread and feedback for a social draft', async () => {
    client.__setResponse('content_items', {
      data: detailRow({ is_thread: true, social_account_id: 'acc-1' }),
      error: null,
    });
    client.__setResponse('thread_segments', {
      data: [{ id: 's1', body: 'One.' }],
      error: null,
    });
    client.__setResponse('content_feedback', {
      data: [
        { id: 'f1', verdict: 'negative', feedback: 'Too preachy.', created_at: '2026-08-18T00:00:00Z' },
      ],
      error: null,
    });

    const detail = await content().getDetail(ctx, 'c1');

    expect(detail?.threadSegments).toEqual([{ id: 's1', body: 'One.' }]);
    expect(detail?.priorFeedback).toEqual([
      { id: 'f1', verdict: 'negative', feedback: 'Too preachy.', createdAt: '2026-08-18T00:00:00Z' },
    ]);
  });

  it('is null for a draft that is gone', async () => {
    client.__setResponse('content_items', { data: null, error: null });

    expect(await content().getDetail(ctx, 'nope')).toBeNull();
  });
});

describe('getSocialDraftCopy', () => {
  it('restricts the surface to the two social platforms', async () => {
    client.__setResponse('content_items', {
      data: {
        id: 'c1',
        title: 'A post',
        body: 'Body.',
        type: 'linkedin',
        is_thread: false,
        social_account_id: null,
        disclaimer_snippet_id: null,
      },
      error: null,
    });

    await content().getSocialDraftCopy(ctx, 'c1');

    // A newsletter has no copy surface; it reads as not found rather than
    // rendering an empty copy box.
    expect(client.__buildersFor('content_items')[0].in).toHaveBeenCalledWith('type', [
      'linkedin',
      'twitter_x',
    ]);
  });

  it('assembles the account name, segments and disclaimer', async () => {
    client.__setResponse('content_items', {
      data: {
        id: 'c1',
        title: 'A thread',
        body: null,
        type: 'twitter_x',
        is_thread: true,
        social_account_id: 'acc-1',
        disclaimer_snippet_id: 'snip-1',
      },
      error: null,
    });
    client.__setResponse('social_accounts', { data: { display_name: 'BTS on X' }, error: null });
    client.__setResponse('thread_segments', { data: [{ body: 'One.' }, { body: 'Two.' }], error: null });
    client.__setResponse('compliance_snippets', { data: { body: 'Not advice.' }, error: null });

    expect(await content().getSocialDraftCopy(ctx, 'c1')).toEqual({
      title: 'A thread',
      platform: 'twitter_x',
      accountName: 'BTS on X',
      body: null,
      isThread: true,
      segments: ['One.', 'Two.'],
      disclaimerText: 'Not advice.',
    });
  });
});

describe('addDraftFeedback', () => {
  const socialItem = {
    id: 'c1',
    type: 'linkedin',
    body: 'The RBA held rates at 4.35%.',
    is_thread: false,
    social_account_id: 'acc-li',
    post_form: 'teach',
  };

  it('denormalises the platform and post form onto the row', async () => {
    // The distiller reads this row and must not need joins — the insert itself
    // is what wakes it, through Realtime.
    client.__setResponse('content_items', { data: socialItem, error: null });
    client.__setResponse('content_feedback', { data: null, error: null });

    expect(await content().addDraftFeedback('c1', { feedback: 'Too preachy.', verdict: 'negative' })).toBe(
      true,
    );

    expect(client.__buildersFor('content_feedback')[0].insert).toHaveBeenCalledWith(
      expect.objectContaining({
        content_item_id: 'c1',
        social_account_id: 'acc-li',
        platform: 'linkedin',
        post_form: 'teach',
        verdict: 'negative',
        feedback: 'Too preachy.',
        draft_excerpt: 'The RBA held rates at 4.35%.',
        created_by: 'director-1',
      }),
    );
  });

  it('snapshots a thread as its joined segments, not its lead', async () => {
    client.__setResponse('content_items', {
      data: { ...socialItem, is_thread: true, body: 'Lead.' },
      error: null,
    });
    client.__setResponse('thread_segments', {
      data: [{ id: 's1', body: 'One.' }, { id: 's2', body: 'Two.' }],
      error: null,
    });
    client.__setResponse('content_feedback', { data: null, error: null });

    await content().addDraftFeedback('c1', { feedback: 'Good thread.' });

    expect(client.__buildersFor('content_feedback')[0].insert).toHaveBeenCalledWith(
      expect.objectContaining({ draft_excerpt: 'One. Two.', verdict: null }),
    );
  });

  it('caps the excerpt so a long draft does not become the row', async () => {
    client.__setResponse('content_items', {
      data: { ...socialItem, body: 'x'.repeat(900) },
      error: null,
    });
    client.__setResponse('content_feedback', { data: null, error: null });

    await content().addDraftFeedback('c1', { feedback: 'Note.' });

    const [row] = client.__buildersFor('content_feedback')[0].insert.mock.calls[0];
    expect(row.draft_excerpt).toHaveLength(500);
  });

  it('reports false for a draft with no social account', async () => {
    client.__setResponse('content_items', {
      data: { ...socialItem, social_account_id: null },
      error: null,
    });

    expect(await content().addDraftFeedback('c1', { feedback: 'Note.' })).toBe(false);
    expect(client.__buildersFor('content_feedback')).toHaveLength(0);
  });
});

describe('createItem and setStatus', () => {
  it('inserts a new item with the pipeline defaults', async () => {
    client.__setResponse('content_items', { data: null, error: null });

    await content().createItem({
      title: 'A draft',
      type: 'linkedin',
      body: null,
      status: 'idea',
      scheduledFor: null,
      authorId: null,
    });

    expect(client.__buildersFor('content_items')[0].insert).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'A draft',
        status: 'idea',
        published_at: null,
        iteration_count: 0,
      }),
    );
  });

  it('moves an item between columns', async () => {
    client.__setResponse('content_items', { data: null, error: null });

    await content().setStatus('c1', 'review');

    const builder = client.__buildersFor('content_items')[0];
    expect(builder.update).toHaveBeenCalledWith({ status: 'review' });
    expect(builder.eq).toHaveBeenCalledWith('id', 'c1');
  });
});
