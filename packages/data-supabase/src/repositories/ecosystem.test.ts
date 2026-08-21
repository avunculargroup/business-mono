import { beforeEach, describe, expect, it } from 'vitest';
import { testReadContext } from '@platform/data/testing';
import type { NewWatch, Principal } from '@platform/data';
import { createFakeSupabase, type FakeSupabaseClient } from '../../test/mocks/supabase';
import { createSupabaseRepositories } from '../bundle';
import type { PlatformSupabaseClient } from '../adapterContext';

const principal: Principal = { kind: 'team', userId: 'director-1' };
const ctx = testReadContext();

let client: FakeSupabaseClient;

function ecosystem() {
  return createSupabaseRepositories(client as unknown as PlatformSupabaseClient, principal)
    .ecosystem;
}

const feedRow = {
  id: 'ch-1',
  change_type: 'release',
  title: 'Core 29.0 released',
  summary: 'A summary.',
  severity: 'major',
  materiality: 4,
  compliance_class: 'neutral',
  status: 'new',
  pinned: false,
  client_relevant: false,
  curator_note: null,
  occurred_at: '2026-08-18T00:00:00Z',
  detected_at: '2026-08-18T01:00:00Z',
  external_url: 'https://example.test/release',
  entity_name: 'Bitcoin Core',
  product_service_id: 'p1',
  advisor_partner_id: null,
  product_slug: 'bitcoin-core',
  advisor_slug: null,
  watch_label: 'Core releases',
  watch_type: 'github_release',
};

const watchHealthRow = {
  id: 'w1',
  label: 'Core releases',
  watch_type: 'github_release',
  health: 'failing',
  check_frequency: 'daily',
  consecutive_failures: 3,
  last_checked_at: '2026-08-18T00:00:00Z',
  last_change_at: '2026-07-01T00:00:00Z',
  days_since_check: 1,
  entity_name: 'Bitcoin Core',
  owner_name: 'Director One',
};

const createdWatchRow = {
  id: 'w1',
  watch_type: 'github_release',
  label: 'Core releases',
  source_url: null,
  enabled: true,
  check_frequency: 'daily',
  health: 'healthy',
  last_checked_at: null,
  last_change_at: null,
};

function newWatch(overrides: Partial<NewWatch> = {}): NewWatch {
  return {
    productServiceId: 'p1',
    advisorPartnerId: null,
    watchType: 'github_release',
    label: 'Core releases',
    config: { owner: 'bitcoin', repo: 'bitcoin' },
    sourceUrl: null,
    checkFrequency: 'daily',
    enabled: true,
    centrality: 3,
    ownerId: null,
    notes: null,
    createdBy: 'director-1',
    ...overrides,
  };
}

beforeEach(() => {
  client = createFakeSupabase();
  client.__setResponse('v_ecosystem_feed', { data: [feedRow], error: null });
  client.__setResponse('v_ecosystem_watch_health', { data: [watchHealthRow], error: null });
  client.__setResponse('ecosystem_changes', { data: { compliance_class: 'neutral' }, error: null });
  client.__setResponse('ecosystem_watches', { data: createdWatchRow, error: null });
});

describe('listFeed', () => {
  it('camel-cases every column of the feed view', async () => {
    const [change] = await ecosystem().listFeed(ctx);

    expect(change).toEqual({
      id: 'ch-1',
      changeType: 'release',
      title: 'Core 29.0 released',
      summary: 'A summary.',
      severity: 'major',
      materiality: 4,
      complianceClass: 'neutral',
      status: 'new',
      pinned: false,
      clientRelevant: false,
      curatorNote: null,
      occurredAt: '2026-08-18T00:00:00Z',
      detectedAt: '2026-08-18T01:00:00Z',
      externalUrl: 'https://example.test/release',
      entityName: 'Bitcoin Core',
      productServiceId: 'p1',
      advisorPartnerId: null,
      productSlug: 'bitcoin-core',
      advisorSlug: null,
      watchLabel: 'Core releases',
      watchType: 'github_release',
    });
  });

  it('carries no judgement about the change', async () => {
    // Same rule as the indicator deltas: a release is an event, not good news.
    // `severity` is the publisher's own word, which is a fact; anything the data
    // layer added on top of it would be an opinion the AR cannot make.
    const [change] = await ecosystem().listFeed(ctx);

    for (const forbidden of ['direction', 'sentiment', 'colour', 'color', 'good', 'risk']) {
      expect(change).not.toHaveProperty(forbidden);
    }
  });

  it('reads the view rather than the base table, and caps the feed', async () => {
    // The view excludes dismissed and archived changes. Reading
    // `ecosystem_changes` here would put those back on the feed.
    await ecosystem().listFeed(ctx);

    expect(client.__buildersFor('ecosystem_changes')).toHaveLength(0);
    expect(client.__buildersFor('v_ecosystem_feed')[0].limit).toHaveBeenCalledWith(200);
  });

  it('honours a caller-supplied limit', async () => {
    await ecosystem().listFeed(ctx, { limit: 10 });

    expect(client.__buildersFor('v_ecosystem_feed')[0].limit).toHaveBeenCalledWith(10);
  });

  it('throws rather than showing an empty feed on error', async () => {
    client.__setResponse('v_ecosystem_feed', { data: null, error: { message: 'boom' } });

    await expect(ecosystem().listFeed(ctx)).rejects.toMatchObject({ message: 'boom' });
  });
});

describe('listWatchHealth', () => {
  it('camel-cases every column of the health view', async () => {
    const [watch] = await ecosystem().listWatchHealth(ctx);

    expect(watch).toEqual({
      id: 'w1',
      label: 'Core releases',
      watchType: 'github_release',
      health: 'failing',
      checkFrequency: 'daily',
      consecutiveFailures: 3,
      lastCheckedAt: '2026-08-18T00:00:00Z',
      lastChangeAt: '2026-07-01T00:00:00Z',
      daysSinceCheck: 1,
      entityName: 'Bitcoin Core',
      ownerName: 'Director One',
    });
  });

  it('leaves the ordering to the view', async () => {
    // The view sorts failing-then-stale. Re-ordering here would silently
    // disagree with it.
    await ecosystem().listWatchHealth(ctx);

    expect(client.__buildersFor('v_ecosystem_watch_health')[0].order).not.toHaveBeenCalled();
  });
});

describe('getPromotionGate', () => {
  it('reads the classification off the change', async () => {
    expect(await ecosystem().getPromotionGate(ctx, 'ch-1')).toEqual({
      complianceClass: 'neutral',
    });
    expect(client.__buildersFor('ecosystem_changes')[0].eq).toHaveBeenCalledWith('id', 'ch-1');
  });

  it('distinguishes a missing change from an unclassified one', async () => {
    // Both are refusals upstream, but for different reasons and with different
    // copy, so the repository has to keep them apart: null means gone, a null
    // class means present and not yet classified.
    client.__setResponse('ecosystem_changes', { data: null, error: null });
    expect(await ecosystem().getPromotionGate(ctx, 'ch-1')).toBeNull();

    client.__setResponse('ecosystem_changes', {
      data: { compliance_class: null },
      error: null,
    });
    expect(await ecosystem().getPromotionGate(ctx, 'ch-1')).toEqual({ complianceClass: null });
  });

  it('throws on a read failure rather than reporting the change gone', async () => {
    // Returning null here would let a failed read read as "no such change",
    // and the caller's next question is whether to promote it.
    client.__setResponse('ecosystem_changes', { data: null, error: { message: 'offline' } });

    await expect(ecosystem().getPromotionGate(ctx, 'ch-1')).rejects.toMatchObject({
      message: 'offline',
    });
  });
});

describe('acknowledgeChange', () => {
  it('stamps the bound principal, not an argument', async () => {
    await ecosystem().acknowledgeChange('ch-1');

    const [update] = client.__buildersFor('ecosystem_changes')[0].update.mock.calls[0];
    expect(update).toMatchObject({ status: 'acknowledged', acknowledged_by: 'director-1' });
    expect(typeof update.acknowledged_at).toBe('string');
  });

  it('cannot be told to acknowledge as someone else', async () => {
    // There is no parameter for it — the signature is the guarantee. This test
    // exists so that adding one goes red.
    expect(ecosystem().acknowledgeChange).toHaveLength(1);
  });
});

describe('change writes', () => {
  it('sets status, pin, note and client flag on the addressed row', async () => {
    const repo = ecosystem();
    await repo.setChangeStatus('ch-1', 'dismissed');
    await repo.pinChange('ch-1', true);
    await repo.setCuratorNote('ch-1', null);
    await repo.setClientRelevant('ch-1', true);

    const builders = client.__buildersFor('ecosystem_changes');
    expect(builders.map((b) => b.update.mock.calls[0][0])).toEqual([
      { status: 'dismissed' },
      { pinned: true },
      { curator_note: null },
      { client_relevant: true },
    ]);
    for (const builder of builders) {
      expect(builder.eq).toHaveBeenCalledWith('id', 'ch-1');
    }
  });

  it('promotes nothing on its own — the gate is the caller\'s', async () => {
    // setClientRelevant is deliberately unguarded here: the rule lives in
    // `isClientPromotable` and the sentence in the server action. What this
    // proves is that the repository does not quietly read the class itself and
    // hide a refusal as a no-op.
    await ecosystem().setClientRelevant('ch-1', true);

    expect(client.__buildersFor('ecosystem_changes')).toHaveLength(1);
  });
});

describe('createWatch', () => {
  it('maps the watch onto its columns and hands back the created row', async () => {
    const watch = await ecosystem().createWatch(newWatch());

    expect(client.__buildersFor('ecosystem_watches')[0].insert).toHaveBeenCalledWith({
      product_service_id: 'p1',
      advisor_partner_id: null,
      created_by: 'director-1',
      watch_type: 'github_release',
      label: 'Core releases',
      config: { owner: 'bitcoin', repo: 'bitcoin' },
      source_url: null,
      check_frequency: 'daily',
      enabled: true,
      centrality: 3,
      owner_id: null,
      notes: null,
    });
    expect(watch).toEqual({
      id: 'w1',
      watchType: 'github_release',
      label: 'Core releases',
      sourceUrl: null,
      enabled: true,
      checkFrequency: 'daily',
      health: 'healthy',
      lastCheckedAt: null,
      lastChangeAt: null,
    });
  });

  it('stores config as given rather than reshaping it', async () => {
    // Each watch_type has its own config shape and the adapters that read it
    // are on the agents side. The repository is not the place that knows them.
    await ecosystem().createWatch(newWatch({ config: { page_url: 'https://x.test', depth: 2 } }));

    const [row] = client.__buildersFor('ecosystem_watches')[0].insert.mock.calls[0];
    expect(row.config).toEqual({ page_url: 'https://x.test', depth: 2 });
  });

  it('throws when the insert fails instead of returning a half-made watch', async () => {
    client.__setResponse('ecosystem_watches', { data: null, error: { message: 'duplicate' } });

    await expect(ecosystem().createWatch(newWatch())).rejects.toMatchObject({
      message: 'duplicate',
    });
  });
});

describe('updateWatch', () => {
  it('writes the editable columns and leaves the parent entity alone', async () => {
    // A watch that changed entity would orphan the denormalised entity_name on
    // every change it has already produced, so the columns are simply absent.
    await ecosystem().updateWatch('w1', {
      watchType: 'rss',
      label: 'Blog',
      config: { feed_url: 'https://x.test/feed' },
      sourceUrl: 'https://x.test',
      checkFrequency: 'weekly',
      enabled: false,
      centrality: 1,
      ownerId: 'director-1',
      notes: 'Quiet feed.',
    });

    const [update] = client.__buildersFor('ecosystem_watches')[0].update.mock.calls[0];
    expect(update).toEqual({
      watch_type: 'rss',
      label: 'Blog',
      config: { feed_url: 'https://x.test/feed' },
      source_url: 'https://x.test',
      check_frequency: 'weekly',
      enabled: false,
      centrality: 1,
      owner_id: 'director-1',
      notes: 'Quiet feed.',
    });
    expect(update).not.toHaveProperty('product_service_id');
    expect(update).not.toHaveProperty('advisor_partner_id');
    expect(update).not.toHaveProperty('created_by');
  });
});

describe('setWatchEnabled and deleteWatch', () => {
  it('toggles a watch without touching its other columns', async () => {
    await ecosystem().setWatchEnabled('w1', false);

    const builder = client.__buildersFor('ecosystem_watches')[0];
    expect(builder.update).toHaveBeenCalledWith({ enabled: false });
    expect(builder.eq).toHaveBeenCalledWith('id', 'w1');
  });

  it('deletes the addressed watch', async () => {
    await ecosystem().deleteWatch('w1');

    const builder = client.__buildersFor('ecosystem_watches')[0];
    expect(builder.delete).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenCalledWith('id', 'w1');
  });
});
