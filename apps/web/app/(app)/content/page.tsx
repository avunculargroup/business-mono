import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { ContentBoard } from '@/components/content/ContentBoard';

export default async function ContentPage() {
  const supabase = await createClient();

  const { data: items } = await supabase
    .from('content_items')
    .select('*')
    .order('created_at', { ascending: false });

  const { data: teamMembers } = await supabase
    .from('team_members')
    .select('id, full_name');

  return (
    <>
      <PageHeader title="Content Pipeline" />
      <ContentBoard items={items || []} teamMembers={teamMembers || []} />
    </>
  );
}
