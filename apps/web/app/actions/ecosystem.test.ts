import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeRepositories, type FakeRepositories } from '@/test/mocks/repositories';

const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath }));

// Converted to the seam in vertical 4.5. The compliance gate below is the one
// that matters: `compliance-as-alignment` is the principle this surface carries
// into the demo, and it is a real gate in code rather than an annotation over a
// diagram.
let repositories: FakeRepositories;
let authed: boolean;

vi.mock('@/lib/action', () => ({
  getAuthedRepositories: vi.fn(async () =>
    authed
      ? { ok: true, repositories, user: { id: 'director-1' } }
      : { ok: false, error: 'You need to be signed in to do that.' },
  ),
}));

import {
  createWatch,
  flagClientRelevant,
  acknowledgeChange,
  setCuratorNote,
} from './ecosystem';

const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';
const ADVISOR_ID = '22222222-2222-4222-8222-222222222222';

// `null` omits a field, as the form does when it never renders that input;
// `''` submits it empty, as a browser does for a field left blank. The two
// produce different validation messages, so the distinction has to be explicit.
function watchForm(fields: Record<string, string | null> = {}): FormData {
  const form = new FormData();
  form.set('watch_type', 'github_release');
  form.set('label', 'Core releases');
  form.set('product_service_id', PRODUCT_ID);
  for (const [key, value] of Object.entries(fields)) {
    if (value === null) form.delete(key);
    else form.set(key, value);
  }
  return form;
}

beforeEach(() => {
  repositories = createFakeRepositories();
  authed = true;
  revalidatePath.mockClear();
});

describe('createWatch', () => {
  it('rejects a missing label without touching the repository', async () => {
    const result = await createWatch(watchForm({ label: '' }));

    expect(result).toEqual({ error: 'Label is required' });
    expect(repositories.ecosystem.createWatch).not.toHaveBeenCalled();
  });

  it('refuses a watch with two parents', async () => {
    // The database enforces num_nonnulls(...) = 1; failing here says why.
    const result = await createWatch(watchForm({ advisor_partner_id: ADVISOR_ID }));

    expect(result).toEqual({ error: 'A watch must belong to exactly one product or advisor.' });
    expect(repositories.ecosystem.createWatch).not.toHaveBeenCalled();
  });

  it('refuses a watch with no parent', async () => {
    const result = await createWatch(watchForm({ product_service_id: null }));

    expect(result).toEqual({ error: 'A watch must belong to exactly one product or advisor.' });
  });

  it('builds config from only the fields its watch_type uses', async () => {
    // A stale field left in the DOM by a type switch must never land in config.
    const form = watchForm({ owner: 'bitcoin', repo: 'bitcoin', feed_url: 'https://stale.test' });

    const result = await createWatch(form);

    expect(result).toMatchObject({ success: true });
    const [input] = repositories.ecosystem.createWatch.mock.calls[0];
    expect(input.config).toEqual({
      owner: 'bitcoin',
      repo: 'bitcoin',
      include_prereleases: false,
      track: 'releases',
    });
    expect(input.config).not.toHaveProperty('feed_url');
  });

  it('hands the created watch back for the list to render', async () => {
    const result = await createWatch(watchForm());

    expect(result).toMatchObject({ success: true, watch: { id: 'w1', label: 'Core releases' } });
  });

  it('returns the auth error when signed out', async () => {
    authed = false;

    expect(await createWatch(watchForm())).toEqual({
      error: 'You need to be signed in to do that.',
    });
    expect(repositories.ecosystem.createWatch).not.toHaveBeenCalled();
  });
});

describe('flagClientRelevant', () => {
  it('promotes a change Lex classified neutral', async () => {
    const result = await flagClientRelevant('ch-1', true);

    expect(result).toEqual({ success: true });
    expect(repositories.ecosystem.setClientRelevant).toHaveBeenCalledWith('ch-1', true);
  });

  it('refuses a compliance-sensitive change', async () => {
    repositories = createFakeRepositories({
      promotionGate: { complianceClass: 'general_advice' },
    });

    expect(await flagClientRelevant('ch-1', true)).toEqual({
      error:
        'This change is classified as compliance-sensitive and needs a compliance review before it can go to clients.',
    });
    expect(repositories.ecosystem.setClientRelevant).not.toHaveBeenCalled();
  });

  it('refuses an unclassified change rather than treating NULL as safe', async () => {
    // The classifier failing must never become an accidental promotion. This is
    // the whole gate: it fails closed.
    repositories = createFakeRepositories({ promotionGate: { complianceClass: null } });

    expect(await flagClientRelevant('ch-1', true)).toEqual({
      error:
        'This change has not been classified for compliance yet, so it cannot be flagged for clients.',
    });
    expect(repositories.ecosystem.setClientRelevant).not.toHaveBeenCalled();
  });

  it('says so when the change is gone', async () => {
    repositories = createFakeRepositories({ promotionGate: null });

    expect(await flagClientRelevant('ch-1', true)).toEqual({
      error: 'That change no longer exists.',
    });
  });

  it('allows un-flagging without a compliance read — withdrawing creates no exposure', async () => {
    const result = await flagClientRelevant('ch-1', false);

    expect(result).toEqual({ success: true });
    expect(repositories.ecosystem.getPromotionGate).not.toHaveBeenCalled();
    expect(repositories.ecosystem.setClientRelevant).toHaveBeenCalledWith('ch-1', false);
  });

  it('surfaces a read failure instead of promoting', async () => {
    repositories.ecosystem.getPromotionGate.mockRejectedValueOnce(new Error('offline'));

    expect(await flagClientRelevant('ch-1', true)).toHaveProperty('error');
    expect(repositories.ecosystem.setClientRelevant).not.toHaveBeenCalled();
  });
});

describe('acknowledgeChange', () => {
  it('records the acknowledgement and refreshes the feed', async () => {
    // Who acknowledged it is the bundle's principal, so the action does not
    // pass it — and cannot pass the wrong one.
    expect(await acknowledgeChange('ch-1')).toEqual({ success: true });
    expect(repositories.ecosystem.acknowledgeChange).toHaveBeenCalledWith('ch-1');
    expect(revalidatePath).toHaveBeenCalledWith('/signals');
  });
});

describe('setCuratorNote', () => {
  it('clears the note rather than storing an empty string', async () => {
    const form = new FormData();
    form.set('note', '');

    await setCuratorNote('ch-1', form);

    expect(repositories.ecosystem.setCuratorNote).toHaveBeenCalledWith('ch-1', null);
  });

  it('stores a note that was written', async () => {
    const form = new FormData();
    form.set('note', 'Matters for the custody review.');

    await setCuratorNote('ch-1', form);

    expect(repositories.ecosystem.setCuratorNote).toHaveBeenCalledWith(
      'ch-1',
      'Matters for the custody review.',
    );
  });
});
