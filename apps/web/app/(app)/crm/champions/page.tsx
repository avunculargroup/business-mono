import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { ChampionsList } from '@/components/crm/ChampionsList';
import { getChampions } from '@/app/actions/champions';
import { getCompanyOptions } from '@/lib/referenceData';

export default async function ChampionsPage() {
  const supabase = await createClient();

  const [champions, contactsResult, companies] = await Promise.all([
    getChampions(),
    supabase.from('contacts').select('id, first_name, last_name, company_id').order('last_name'),
    getCompanyOptions(supabase),
  ]);

  return (
    <>
      <PageHeader title="Champions" />
      <ChampionsList
        initialChampions={champions}
        contacts={contactsResult.data ?? []}
        companies={companies}
      />
    </>
  );
}
