import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { PersonaDetail } from '@/components/crm/PersonaDetail';

export default async function PersonaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: persona } = await supabase
    .from('personas')
    .select('*')
    .eq('id', id)
    .single();

  if (!persona) notFound();

  return (
    <>
      <PageHeader title={persona.name} />
      <PersonaDetail persona={persona} />
    </>
  );
}
