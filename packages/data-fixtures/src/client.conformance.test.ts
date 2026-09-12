import { describeClientContract } from '@platform/data/testing';
import { createClientFixtureContext } from './repositories/client';
import { UNCLEARED_FACT_KEY, UNPROMOTED_SIGNAL_ID } from './fixtures/client';

/**
 * The client contract, run against the fixture adapter.
 *
 * The same eight assertions `packages/data-supabase` runs, which is the point:
 * a contract suite that only ever meets one implementation gets shaped around
 * that implementation's habits, and nobody notices until the second one
 * arrives and half the suite turns out to have been describing a mock.
 *
 * Two assertions are stronger here than they can be on the live side. The
 * Supabase suite runs against a canned-response fake that cannot honour a
 * `.eq()` or an `.in()`, so assertions 5 and 7 are each split into "the fake
 * hands back pre-filtered rows" plus "a separate case checks the adapter issues
 * the filter". This adapter holds the unpromoted signal and both client types'
 * templates in its data and filters them in TypeScript, so each is one whole
 * check. See `docs/features/client-app/build-progress.md`.
 */
describeClientContract({
  name: 'fixtures',
  createContext: (clientType) =>
    createClientFixtureContext({ clientType, disclosureCurrent: true }),
  createUndisclosedContext: () =>
    createClientFixtureContext({ clientType: 'corporate', disclosureCurrent: false }),
  scenario: {
    unclearedFactKey: UNCLEARED_FACT_KEY,
    clearedFactKey: 'btc_spot_aud',
    unpromotedSignalIds: [UNPROMOTED_SIGNAL_ID],
  },
});
