import { createClient } from '@/lib/supabase/server';
import { getRepositories } from '@/lib/repositories';
import { resolveReadContext } from '@platform/data-supabase';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { ContentBoard } from '@/components/content/ContentBoard';

export default async function ContentPage() {
  const repositories = await getRepositories();

  // `team_members` belongs to the settings vertical (4.11) and is still read on
  // the raw client here, as it is in the app layout. A page holding both is the
  // accepted intermediate state while the app is part-converted.
  const supabase = await createClient();

  const [cards, { data: teamMembers }] = await Promise.all([
    repositories.content.listCards(resolveReadContext()),
    supabase.from('team_members').select('id, full_name'),
  ]);

  return (
    <>
      <PageHeader title="Content Pipeline" />
      <ContentBoard items={cards.items} teamMembers={teamMembers || []} />
    </>
  );
}
