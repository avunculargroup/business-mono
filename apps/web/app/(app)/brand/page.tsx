import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { BrandHubTabs } from '@/components/brand/BrandHubTabs';
import type { BrandVoiceRow, SocialAccountRow, VoiceSnippetRow } from '@/components/brand/voiceTypes';
import type { AccountGuidelinesRow, ContentFeedbackRow } from '@/components/brand/FeedbackGuidelinesPanel';

export default async function BrandPage() {
  const supabase = await createClient();

  const [
    { data: assets },
    { data: voice },
    { data: snippets },
    { data: accounts },
    { data: guidelines },
    { data: feedback },
  ] = await Promise.all([
    supabase.from('brand_assets').select('*').order('name'),
    supabase
      .from('brand_voice')
      .select('id, profile, mission_summary, bitcoin_capitalisation_rule, content_policy, version')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle(),
    supabase
      .from('voice_snippets')
      .select('id, snippet_type, body, curator_note, platform, topic_tags, is_starred, social_account_id')
      .order('is_starred', { ascending: false })
      .order('created_at', { ascending: true }),
    supabase
      .from('social_accounts')
      .select('id, platform, account_type, display_name, handle, profile_url, voice_profile')
      .eq('is_active', true)
      // Company accounts first, then founders; stable within group.
      .order('account_type', { ascending: true })
      .order('display_name', { ascending: true }),
    supabase.from('account_feedback_guidelines').select('social_account_id, guidelines'),
    supabase
      .from('content_feedback')
      .select('id, social_account_id, verdict, feedback, created_at')
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  return (
    <>
      <PageHeader title="Brand Hub" />
      <BrandHubTabs
        voice={(voice as BrandVoiceRow) ?? null}
        snippets={(snippets as VoiceSnippetRow[]) ?? []}
        accounts={(accounts as SocialAccountRow[]) ?? []}
        assets={assets || []}
        guidelines={(guidelines as AccountGuidelinesRow[]) ?? []}
        feedback={(feedback as ContentFeedbackRow[]) ?? []}
      />
    </>
  );
}
