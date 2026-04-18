import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { ChampionsList } from '@/components/crm/ChampionsList';
import { getChampions } from '@/app/actions/champions';

export default async function ChampionsPage() {
  const supabase = await createClient();

  const [champions, contactsResult, companiesResult] = await Promise.all([
    getChampions(),
    supabase.from('contacts').select('id, first_name, last_name, company_id').order('last_name'),
    supabase.from('companies').select('id, name').order('name'),
  ]);

  return (
    <>
      <PageHeader title="Champions" />
      <ChampionsList
        initialChampions={champions}
        contacts={contactsResult.data ?? []}
        companies={companiesResult.data ?? []}
      />
    </>
  );
}
