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

import { classifyProduct, setClientNote, setRegisterClearance } from './clientPromotion';

function patch(table: string): Record<string, unknown> {
  return supabase.__buildersFor(table)[0]!.update.mock.calls[0]![0] as Record<string, unknown>;
}

beforeEach(() => {
  supabase = createFakeSupabase();
  for (const t of ['ecosystem_changes', 'research_companies', 'products_services']) {
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

describe('setRegisterClearance', () => {
  it('records the approver when clearing', async () => {
    await setRegisterClearance('co-1', true);

    expect(patch('research_companies')).toMatchObject({
      client_cleared: true,
      client_cleared_by: 'director-1',
    });
  });

  it('only flips the flag when un-clearing', async () => {
    await setRegisterClearance('co-1', false);

    expect(patch('research_companies')).toEqual({ client_cleared: false });
  });

  it('does not touch is_published, which is a different question', async () => {
    await setRegisterClearance('co-1', true);

    expect(patch('research_companies')).not.toHaveProperty('is_published');
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
