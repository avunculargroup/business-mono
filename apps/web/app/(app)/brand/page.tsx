import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { BrandHubTabs } from '@/components/brand/BrandHubTabs';
import type { BrandVoiceRow, SocialAccountRow, VoiceSnippetRow } from '@/components/brand/voiceTypes';

export default async function BrandPage() {
  const supabase = await createClient();
  // brand_voice / voice_snippets are not in the generated Database types yet.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const [{ data: assets }, { data: voice }, { data: snippets }, { data: accounts }] = await Promise.all([
    supabase.from('brand_assets').select('*').order('name'),
    db
      .from('brand_voice')
      .select('id, profile, mission_summary, bitcoin_capitalisation_rule, version')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle(),
    db
      .from('voice_snippets')
      .select('id, snippet_type, body, curator_note, platform, topic_tags, is_starred, social_account_id')
      .order('is_starred', { ascending: false })
      .order('created_at', { ascending: true }),
    db
      .from('social_accounts')
      .select('id, platform, account_type, display_name, handle, profile_url, voice_profile')
      .eq('is_active', true)
      // Company accounts first, then founders; stable within group.
      .order('account_type', { ascending: true })
      .order('display_name', { ascending: true }),
  ]);

  return (
    <>
      <PageHeader title="Brand Hub" />
      <BrandHubTabs
        voice={(voice as BrandVoiceRow) ?? null}
        snippets={(snippets as VoiceSnippetRow[]) ?? []}
        accounts={(accounts as SocialAccountRow[]) ?? []}
        assets={assets || []}
      />
    </>
  );
}
