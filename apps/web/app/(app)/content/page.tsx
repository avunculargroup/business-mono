import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { ContentBoard } from '@/components/content/ContentBoard';

export default async function ContentPage() {
  const supabase = await createClient();

  const { data: items } = await supabase
    .from('content_items')
    .select(
      'id, slug, title, type, status, scheduled_for, created_by, campaign_id, social_account_id, campaigns(name), social_accounts(display_name, platform)'
    )
    .order('created_at', { ascending: false });

  const { data: teamMembers } = await supabase
    .from('team_members')
    .select('id, full_name');

  const cards = (items || []).map((item) => ({
    id: item.id,
    slug: item.slug,
    title: item.title,
    type: item.type,
    status: item.status,
    scheduled_for: item.scheduled_for,
    created_by: item.created_by,
    campaign_name: item.campaigns?.name ?? null,
    account_name: item.social_accounts?.display_name ?? null,
    platform: item.social_accounts?.platform ?? null,
  }));

  return (
    <>
      <PageHeader title="Content Pipeline" />
      <ContentBoard items={cards} teamMembers={teamMembers || []} />
    </>
  );
}
