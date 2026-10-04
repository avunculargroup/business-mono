import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabaseClient } from '@/test/mocks/supabase';

const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath }));

let supabase: FakeSupabaseClient;
let authed: boolean;

vi.mock('@/lib/action', () => ({
  getAuthedClient: vi.fn(async () =>
    authed
      ? { ok: true, supabase, user: { id: 'director-1' } }
      : { ok: false, error: 'You need to be signed in to do that.' },
  ),
}));

import {
  approveDraftRows,
  classifyProduct,
  setClientNote,
  setRegisterClearance,
  setReviewState,
} from './clientPromotion';

function patch(table: string): Record<string, unknown> {
  return supabase.__buildersFor(table)[0]!.update.mock.calls[0]![0] as Record<string, unknown>;
}

beforeEach(() => {
  supabase = createFakeSupabase();
  for (const t of [
    'ecosystem_changes',
    'research_companies',
    'products_services',
    'treasury_events',
    'research_findings',
    'research_company_facts',
  ]) {
    supabase.__setResponse(t, { data: null, error: null });
  }
  authed = true;
  revalidatePath.mockClear();
});

describe('setClientNote', () => {
  it('writes the client-safe note, which is authored and never copied', async () => {
    // The internal curator_note is allowed to editorialise. A programmatic copy
    // would eventually carry "we would move off this custodian" onto a
    // subscriber's screen, and it only has to escape once.
    const result = await setClientNote('c1', '  The attestation is out.  ');

    expect(result).toEqual({ success: true });
    expect(patch('ecosystem_changes')).toEqual({ client_note: 'The attestation is out.' });
  });

  it('clears the note to null rather than an empty string', async () => {
    await setClientNote('c1', '   ');

    expect(patch('ecosystem_changes')).toEqual({ client_note: null });
  });

  it('does not touch curator_note', async () => {
    await setClientNote('c1', 'x');

    expect(patch('ecosystem_changes')).not.toHaveProperty('curator_note');
  });
});

describe('setReviewState', () => {
  it('records who reviewed the record and when', async () => {
    const result = await setReviewState('co-1', 'internal');

    expect(result).toEqual({ success: true });
    expect(patch('research_companies')).toMatchObject({
      review_state: 'internal',
      reviewed_by: 'director-1',
    });
    expect(patch('research_companies')).toHaveProperty('reviewed_at');
  });

  it('leaves clearance alone when marking a record reviewed', async () => {
    await setReviewState('co-1', 'internal');

    expect(patch('research_companies')).not.toHaveProperty('client_cleared');
  });

  it.each(['draft', 'retired'] as const)(
    'withholds from subscribers in the same write when moving to %s',
    async (state) => {
      // Only a reviewed record can be cleared. Leaving `internal` while cleared
      // would otherwise fail the constraint with nothing the person can do.
      await setReviewState('co-1', state);

      expect(patch('research_companies')).toMatchObject({
        review_state: state,
        client_cleared: false,
      });
    },
  );

  it('refuses when nobody is signed in', async () => {
    authed = false;

    expect(await setReviewState('co-1', 'internal')).toEqual({
      error: 'You need to be signed in to do that.',
    });
  });
});

describe('approveDraftRows', () => {
  it('approves the draft rows on all three row tables, and records who did', async () => {
    const result = await approveDraftRows('co-1');

    expect(result).toEqual({ success: true });
    for (const table of ['treasury_events', 'research_findings', 'research_company_facts']) {
      const [builder] = supabase.__buildersFor(table);
      expect(builder!.update.mock.calls[0]![0]).toMatchObject({
        review_state: 'internal',
        reviewed_by: 'director-1',
      });
      expect(builder!.eq).toHaveBeenCalledWith('company_id', 'co-1');
      // Drafts only: a retired row stays retired.
      expect(builder!.eq).toHaveBeenCalledWith('review_state', 'draft');
    }
  });

  it('leaves the record itself alone', async () => {
    await approveDraftRows('co-1');

    expect(supabase.__buildersFor('research_companies')).toHaveLength(0);
  });
});

describe('setRegisterClearance', () => {
  it('records the approver and the subscriber summary when clearing', async () => {
    await setRegisterClearance('co-1', true, '  Holds bitcoin directly.  ');

    expect(patch('research_companies')).toMatchObject({
      client_cleared: true,
      client_cleared_by: 'director-1',
      client_summary: 'Holds bitcoin directly.',
    });
  });

  it('refuses to clear without a summary, ahead of the constraint', async () => {
    const result = await setRegisterClearance('co-1', true, '   ');

    expect(result.error).toMatch(/summary/);
    expect(supabase.__buildersFor('research_companies')).toHaveLength(0);
  });

  it('only flips the flag when un-clearing, keeping the summary', async () => {
    await setRegisterClearance('co-1', false);

    expect(patch('research_companies')).toEqual({ client_cleared: false });
  });

  it('does not touch review_state, which is a different question', async () => {
    await setRegisterClearance('co-1', true, 'x');

    expect(patch('research_companies')).not.toHaveProperty('review_state');
  });
});

describe('classifyProduct', () => {
  it('records the classification, its reasoning and its author', async () => {
    const result = await classifyProduct({
      productId: 'p1',
      isFinancialProduct: true,
      note: 'DAP: the operator holds client tokens.',
    });

    expect(result).toEqual({ success: true });
    expect(patch('products_services')).toMatchObject({
      is_financial_product: true,
      product_classification_note: 'DAP: the operator holds client tokens.',
      classified_by: 'director-1',
    });
  });

  it('can classify a row as not a financial product', async () => {
    await classifyProduct({ productId: 'p1', isFinancialProduct: false, note: 'A device.' });

    expect(patch('products_services').is_financial_product).toBe(false);
  });

  it('refuses without reasoning, ahead of the constraint', async () => {
    const result = await classifyProduct({ productId: 'p1', isFinancialProduct: true, note: '' });

    expect(result.error).toMatch(/reasoning/);
    expect(supabase.__buildersFor('products_services')).toHaveLength(0);
  });

  it('refuses when nobody is signed in', async () => {
    authed = false;

    expect(await classifyProduct({ productId: 'p1', isFinancialProduct: true, note: 'x' })).toEqual(
      { error: 'You need to be signed in to do that.' },
    );
  });
});
