import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { PersonasList } from '@/components/crm/PersonasList';
import type { Persona } from '@platform/shared';

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
        initialPersonas={(personas || []) as Persona[]}
        totalCount={count || 0}
      />
    </>
  );
}
