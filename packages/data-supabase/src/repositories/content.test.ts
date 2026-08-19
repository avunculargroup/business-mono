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
