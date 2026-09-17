import { describe, expect, it } from 'vitest';
import { testReadContext } from '@platform/data/testing';
import type { Principal } from '@platform/data';
import { createFakeSupabase, type FakeSupabaseClient } from '../../test/mocks/supabase';
import { createClientRepositories } from './bundle';
import type { ClientSupabaseClient } from './context';

/**
 * A failed query is not an empty result.
 *
 * Every read in this adapter used to destructure `data` and drop `error`, so a
 * denied RLS policy, a dropped column and a network failure all rendered as the
 * same thing a quiet day renders as: nothing. That is how two live `/prepare`
 * templates and an empty `/prepare` page stayed unexplained — the app could not
 * have told anyone which of the two it was, because the distinction never left
 * the adapter.
 *
 * The internal adapter in `src/repositories/` has always thrown. These tests
 * hold the client one to the same rule, across the read shapes it uses: a list,
 * a `maybeSingle`, a `Promise.all` pair, and the ungated disclosure probe.
 */

const principal: Extract<Principal, { kind: 'client' }> = {
  kind: 'client',
  userId: 'client-user-1',
  accountId: 'account-1',
};

const FAILURE = { message: 'permission denied for table' };

/** Acknowledged, and every table empty — so only the failure under test differs. */
function seed(client: FakeSupabaseClient): void {
  client.__setResponse('compliance_documents', { data: { version: '2.1' }, error: null });
  client.__setResponse('client_disclosures', { data: { id: 'ack-1' }, error: null });

  for (const table of [
    'prepare_templates',
    'market_reports',
    'ecosystem_changes',
    'onchain_indicators',
    'economic_indicators',
    'research_companies',
    'field_source_minimums',
    'products_services',
    'advisors_partners',
    'commercial_relationships',
    'client_library_sections',
    'client_library_entries',
    'client_users',
    'client_accounts',
    'company_profile',
  ]) {
    client.__setResponse(table, { data: [], error: null });
  }
}

function context() {
  const client = createFakeSupabase();
  seed(client);
  return {
    client,
    ctx: createClientRepositories(client as unknown as ClientSupabaseClient, principal),
  };
}

const ctxArg = testReadContext();

describe('client adapter error surfacing', () => {
  it('throws rather than returning no templates when the template read fails', async () => {
    const { client, ctx } = context();
    client.__setResponse('prepare_templates', { data: null, error: FAILURE });

    await expect(ctx.prepare.templates(ctxArg, 'smsf')).rejects.toThrow(/permission denied/);
  });

  it('throws rather than returning null when a single-template read fails', async () => {
    const { client, ctx } = context();
    client.__setResponse('prepare_templates', { data: null, error: FAILURE });

    await expect(ctx.prepare.template(ctxArg, 'trustee-minute')).rejects.toThrow(
      /permission denied/,
    );
  });

  it('throws rather than returning a quiet day when the brief read fails', async () => {
    const { client, ctx } = context();
    client.__setResponse('market_reports', { data: null, error: FAILURE });

    await expect(ctx.brief.latest(ctxArg)).rejects.toThrow(/permission denied/);
  });

  it('throws rather than returning no signals when the signal read fails', async () => {
    const { client, ctx } = context();
    client.__setResponse('ecosystem_changes', { data: null, error: FAILURE });

    await expect(ctx.signals.list(ctxArg)).rejects.toThrow(/permission denied/);
  });

  /** The `Promise.all` shape — the error is on one arm of a destructured pair. */
  it('throws when the register read fails', async () => {
    const { client, ctx } = context();
    client.__setResponse('research_companies', { data: null, error: FAILURE });

    await expect(ctx.register.list(ctxArg)).rejects.toThrow(/permission denied/);
  });

  it('throws rather than reporting an empty library when the section read fails', async () => {
    const { client, ctx } = context();
    client.__setResponse('client_library_sections', { data: null, error: FAILURE });

    await expect(ctx.library.sections(ctxArg, 'smsf')).rejects.toThrow(/permission denied/);
  });

  /**
   * The gate's own probe. `false` here means "has not acknowledged", which is a
   * statement about the subscriber — so a failed read must not produce it, or a
   * subscriber gets sent to re-acknowledge a statement they already signed.
   */
  it('throws rather than reporting an unacknowledged disclosure when the probe fails', async () => {
    const { client, ctx } = context();
    client.__setResponse('client_disclosures', { data: null, error: FAILURE });

    await expect(ctx.prepare.templates(ctxArg, 'smsf')).rejects.toThrow(/permission denied/);
  });
});
