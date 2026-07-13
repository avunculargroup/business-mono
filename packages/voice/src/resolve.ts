import { mergeVoice } from './merge.js';
import { defaultDeps, type VoiceResolverDeps } from './deps.js';
import type { Platform, ResolvedVoiceContext } from './types.js';

export interface ResolveVoiceParams {
  /**
   * Target account. Omit (or null) for non-account content such as a newsletter
   * or blog post — the company canon plus company-canon snippets are the voice.
   */
  accountId?: string | null;
  /**
   * Platform to write for. Defaults to the account's platform when an account
   * is given; required (or snippets go unfiltered) for non-account content.
   */
  platform?: Platform | null;
  /**
   * Text to retrieve exemplars against — typically the beat's `core_message`.
   * When omitted, no snippets are retrieved (merge-only resolution).
   */
  query?: string | null;
  /** Number of exemplars to retrieve. */
  snippetCount?: number;
  /** Starred-snippet ranking bonus, forwarded to retrieval. */
  starBoost?: number;
  /**
   * Restrict retrieval to these snippet_type values (e.g. opener/closer, for a
   * cadence pass). Omit for no type filter. Only meaningful with a `query`.
   */
  snippetTypes?: string[] | null;
}

/**
 * Resolve the complete voice context for one generation in a single call:
 *
 *   1. load the active company `brand_voice` (the umbrella),
 *   2. load the account `voice_profile` (the override), if an account is given,
 *   3. merge them (account wins on overlap; `vocabulary_avoid` unioned),
 *   4. retrieve top-N exemplars by similarity to `query`, platform-matched and
 *      starred-weighted. Account snippets take precedence — when the account has
 *      any of its own, the company canon is ignored and serves only as a
 *      fallback for accounts with no snippets.
 *
 * The Bitcoin capitalisation rule is carried through untouched from the canon —
 * always applied, never overridable. Deps are injectable for testing.
 */
export async function resolveVoiceContext(
  params: ResolveVoiceParams,
  deps: VoiceResolverDeps = defaultDeps,
): Promise<ResolvedVoiceContext> {
  const { accountId = null, query = null, snippetCount = 5, starBoost = 0.05, snippetTypes = null } = params;

  const brand = await deps.loadActiveBrandVoice();

  const account = accountId ? await deps.loadAccount(accountId) : null;
  if (accountId && !account) {
    throw new Error(`social_account ${accountId} not found`);
  }

  // Explicit platform wins; otherwise fall back to the account's platform.
  const platform: Platform | null = params.platform ?? account?.platform ?? null;

  const profile = mergeVoice(brand?.profile, account?.voice_profile);

  const snippets =
    query && query.trim().length > 0
      ? await deps.retrieve({
          queryEmbedding: await deps.embed(query),
          accountId,
          platform,
          count: snippetCount,
          starBoost,
          snippetTypes,
        })
      : [];

  return {
    profile,
    bitcoinCapitalisationRule: brand?.bitcoin_capitalisation_rule ?? null,
    missionSummary: brand?.mission_summary ?? null,
    contentPolicy: brand?.content_policy ?? {},
    snippets,
  };
}
