import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { PersonaDetail } from '@/components/crm/PersonaDetail';
import { idColumn } from '@/lib/utils';
import type { Persona } from '@platform/shared';

export default async function PersonaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: persona } = await supabase
    .from('personas')
    .select('*')
    .eq(idColumn(id), id)
    .single();

  if (!persona) notFound();

  return (
    <>
      <PageHeader title={persona.name} backHref="/crm/personas" />
      <PersonaDetail persona={persona as Persona} />
    </>
  );
}
