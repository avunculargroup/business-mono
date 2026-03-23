import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { ContentBoard } from '@/components/content/ContentBoard';
import { Button } from '@/components/ui/Button';
import { Plus } from 'lucide-react';

export default async function ContentPage() {
  const supabase = await createClient();

  const { data: items } = await supabase
    .from('content_items')
    .select('*')
    .order('created_at', { ascending: false });

  const { data: teamMembers } = await supabase
    .from('team_members')
    .select('id, name');

  return (
    <>
      <PageHeader title="Content Pipeline">
        <Button variant="primary" size="sm">
          <Plus size={16} strokeWidth={1.5} />
          New content
        </Button>
      </PageHeader>
      <ContentBoard items={items || []} teamMembers={teamMembers || []} />
    </>
  );
}
