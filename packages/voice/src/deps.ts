import { supabase } from '@platform/db';
import { embedVoiceText } from './embed.js';
import { retrieveVoiceSnippets, type RetrieveSnippetsParams } from './retrieve.js';
import type {
  BrandVoice,
  ContentPolicy,
  SocialAccountVoice,
  VoiceProfile,
  VoiceSnippet,
} from './types.js';

// The resolver's IO surface, injected so resolveVoiceContext is testable with
// plain fakes — no module mocking. defaultDeps wires the real Supabase + OpenAI
// implementations; tests pass their own.

export interface VoiceResolverDeps {
  loadActiveBrandVoice: () => Promise<BrandVoice | null>;
  loadAccount: (accountId: string) => Promise<SocialAccountVoice | null>;
  embed: (text: string) => Promise<number[]>;
  retrieve: (params: RetrieveSnippetsParams) => Promise<VoiceSnippet[]>;
}

// brand_voice / social_accounts are not in the generated Database types until
// `pnpm --filter @platform/db generate-types` runs post-migration. Cast at the
// boundary, asserting the row shape we read — same pattern as contentEmbeddings.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

async function loadActiveBrandVoice(): Promise<BrandVoice | null> {
  const { data, error } = await db
    .from('brand_voice')
    .select('profile, mission_summary, bitcoin_capitalisation_rule, content_policy, version')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Loading brand_voice failed: ${error.message}`);
  if (!data) return null;
  return {
    profile: (data.profile ?? {}) as VoiceProfile,
    mission_summary: data.mission_summary ?? null,
    bitcoin_capitalisation_rule: data.bitcoin_capitalisation_rule ?? null,
    content_policy: (data.content_policy ?? {}) as ContentPolicy,
    version: data.version ?? '1.0',
  };
}

async function loadAccount(accountId: string): Promise<SocialAccountVoice | null> {
  const { data, error } = await db
    .from('social_accounts')
    .select('id, platform, voice_profile')
    .eq('id', accountId)
    .maybeSingle();

  if (error) throw new Error(`Loading social_account failed: ${error.message}`);
  if (!data) return null;
  return {
    id: data.id,
    platform: data.platform,
    voice_profile: (data.voice_profile ?? {}) as VoiceProfile,
  };
}

export const defaultDeps: VoiceResolverDeps = {
  loadActiveBrandVoice,
  loadAccount,
  embed: embedVoiceText,
  retrieve: retrieveVoiceSnippets,
};
