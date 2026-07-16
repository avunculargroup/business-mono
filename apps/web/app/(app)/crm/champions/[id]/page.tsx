import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { ChampionDetail } from '@/components/crm/ChampionDetail';
import { getChampion, getChampionEvents } from '@/app/actions/champions';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ChampionDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const champion = await getChampion(id).catch(() => null);
  if (!champion) notFound();

  // Events key off the resolved champion UUID (the route param may be a slug).
  const [events, contactsResult, companiesResult] = await Promise.all([
    getChampionEvents(champion.id),
    supabase.from('contacts').select('id, first_name, last_name, company_id').order('last_name'),
    supabase.from('companies').select('id, name').order('name'),
  ]);

  const contactName = `${champion.contacts.first_name} ${champion.contacts.last_name}`;

  return (
    <>
      <PageHeader title={contactName} backHref="/crm/champions" />
      <ChampionDetail
        champion={champion}
        events={events}
        contacts={contactsResult.data ?? []}
        companies={companiesResult.data ?? []}
      />
    </>
  );
}
