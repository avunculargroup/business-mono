import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { RoutinesClient } from './RoutinesClient';

export default async function RoutinesPage() {
  const supabase = await createClient();

  const [{ data: routines }, { data: teamMembers }] = await Promise.all([
    supabase.from('routines').select('*').order('created_at', { ascending: false }),
    // Backs the founder picker on social_post_from_news routines.
    supabase.from('team_members').select('id, full_name').order('full_name'),
  ]);

  return (
    <>
      <PageHeader title="Routines" />
      <RoutinesClient initialRoutines={routines ?? []} teamMembers={teamMembers ?? []} />
    </>
  );
}
