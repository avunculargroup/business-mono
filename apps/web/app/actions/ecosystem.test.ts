import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabaseClient } from '@/test/mocks/supabase';

const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath }));

let client: FakeSupabaseClient;
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => client),
}));

import { createWatch, flagClientRelevant, acknowledgeChange } from './ecosystem';

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

const baseWatch = {
  product_service_id: '11111111-1111-1111-1111-111111111111',
  watch_type: 'github_release',
  label: 'Coldcard firmware',
};

beforeEach(() => {
  client = createFakeSupabase();
  revalidatePath.mockClear();
});

describe('createWatch', () => {
  it('rejects a missing label without touching the database', async () => {
    const result = await createWatch(form({ ...baseWatch, label: '' }));

    expect(result).toEqual({ error: 'Label is required' });
    expect(client.from).not.toHaveBeenCalled();
  });

  it('refuses a watch with two parents', async () => {
    const result = await createWatch(
      form({
        ...baseWatch,
        advisor_partner_id: '22222222-2222-2222-2222-222222222222',
      }),
    );

    expect(result).toEqual({ error: 'A watch must belong to exactly one product or advisor.' });
    expect(client.from).not.toHaveBeenCalled();
  });

  it('refuses a watch with no parent', async () => {
    const result = await createWatch(
      form({ watch_type: 'rss', label: 'Orphan', product_service_id: '', advisor_partner_id: '' }),
    );

    expect(result).toEqual({ error: 'A watch must belong to exactly one product or advisor.' });
    expect(client.from).not.toHaveBeenCalled();
  });

  it('builds config from only the fields its watch_type uses', async () => {
    client.__setResponse('ecosystem_watches', { data: { id: 'w1' }, error: null });

    // feed_url is a leftover from an abandoned RSS draft — it must not survive.
    const result = await createWatch(
      form({
        ...baseWatch,
        owner: 'Coldcard',
        repo: 'firmware',
        feed_url: 'https://leftover.example/rss.xml',
        enabled: 'on',
        centrality: '1.5',
      }),
    );

    expect(result).toEqual({ success: true, watch: { id: 'w1' } });
    expect(client.__buildersFor('ecosystem_watches')[0].insert).toHaveBeenCalledWith(
      expect.objectContaining({
        product_service_id: baseWatch.product_service_id,
        advisor_partner_id: null,
        watch_type: 'github_release',
        enabled: true,
        centrality: 1.5,
        config: { owner: 'Coldcard', repo: 'firmware', include_prereleases: false, track: 'releases' },
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith(`/products/${baseWatch.product_service_id}`);
  });

  it('returns the auth error when signed out', async () => {
    client.__setUser(null);

    const result = await createWatch(form(baseWatch));

    expect(result).toEqual({ error: 'You need to be signed in to do that.' });
    expect(client.from).not.toHaveBeenCalled();
  });
});

// The dormant Lex gate. These are the cases that must never regress: a change
// only reaches a client surface when Lex has explicitly cleared it.
describe('flagClientRelevant', () => {
  it('promotes a change Lex classified neutral', async () => {
    client.__setResponse('ecosystem_changes', { data: { compliance_class: 'neutral' }, error: null });

    const result = await flagClientRelevant('ch1', true);

    expect(result).toEqual({ success: true });
    const builders = client.__buildersFor('ecosystem_changes');
    expect(builders[builders.length - 1].update).toHaveBeenCalledWith({ client_relevant: true });
  });

  it.each([
    'solvency_adjacent',
    'advice_adjacent',
    'valuation_adjacent',
  ])('refuses a change classified %s, and does not write', async (complianceClass) => {
    client.__setResponse('ecosystem_changes', { data: { compliance_class: complianceClass }, error: null });

    const result = await flagClientRelevant('ch1', true);

    expect(result).toEqual({
      error:
        'This change is classified as compliance-sensitive and needs a compliance review before it can go to clients.',
    });
    for (const builder of client.__buildersFor('ecosystem_changes')) {
      expect(builder.update).not.toHaveBeenCalled();
    }
  });

  // The failure that matters most: enrichment died, so nobody has judged this
  // change. Unclassified must be as restrictive as compliance-sensitive.
  it('refuses an unclassified change rather than treating NULL as safe', async () => {
    client.__setResponse('ecosystem_changes', { data: { compliance_class: null }, error: null });

    const result = await flagClientRelevant('ch1', true);

    expect(result).toEqual({
      error: 'This change has not been classified for compliance yet, so it cannot be flagged for clients.',
    });
    for (const builder of client.__buildersFor('ecosystem_changes')) {
      expect(builder.update).not.toHaveBeenCalled();
    }
  });

  it('allows un-flagging without a compliance read — withdrawing creates no exposure', async () => {
    client.__setResponse('ecosystem_changes', { data: null, error: null });

    const result = await flagClientRelevant('ch1', false);

    expect(result).toEqual({ success: true });
    const builders = client.__buildersFor('ecosystem_changes');
    expect(builders).toHaveLength(1);
    expect(builders[0].select).not.toHaveBeenCalled();
    expect(builders[0].update).toHaveBeenCalledWith({ client_relevant: false });
  });

  it('surfaces a read failure instead of promoting', async () => {
    client.__setResponse('ecosystem_changes', { data: null, error: { message: 'boom' } });

    const result = await flagClientRelevant('ch1', true);

    expect(result).toHaveProperty('error');
    expect(result).not.toHaveProperty('success');
  });
});

describe('acknowledgeChange', () => {
  it('records who acknowledged it', async () => {
    client.__setUser({ id: 'user-1' });
    client.__setResponse('ecosystem_changes', { data: null, error: null });

    const result = await acknowledgeChange('ch1');

    expect(result).toEqual({ success: true });
    expect(client.__buildersFor('ecosystem_changes')[0].update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'acknowledged', acknowledged_by: 'user-1' }),
    );
  });
});
