import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { RoutinesClient } from './RoutinesClient';

export default async function RoutinesPage() {
  const supabase = await createClient();

  const { data: routines } = await supabase
    .from('routines')
    .select('*')
    .order('created_at', { ascending: false });

  return (
    <>
      <PageHeader title="Routines" />
      <RoutinesClient initialRoutines={routines ?? []} />
    </>
  );
}
