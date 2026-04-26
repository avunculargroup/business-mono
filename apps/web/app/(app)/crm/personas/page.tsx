import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { PersonasList } from '@/components/crm/PersonasList';

export default async function PersonasPage() {
  const supabase = await createClient();

  const { data: personas, count } = await supabase
    .from('personas')
    .select('*', { count: 'exact' })
    .order('market_segment')
    .order('name');

  return (
    <>
      <PageHeader title="Personas" />
      <PersonasList
        initialPersonas={personas || []}
        totalCount={count || 0}
      />
    </>
  );
}
