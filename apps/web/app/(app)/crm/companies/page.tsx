import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { CompaniesList } from '@/components/crm/CompaniesList';

export default async function CompaniesPage() {
  const supabase = await createClient();

  const { data: companies, count } = await supabase
    .from('companies')
    .select('*', { count: 'exact' })
    .order('name')
    .limit(25);

  return (
    <>
      <PageHeader title="Companies" />
      <CompaniesList initialCompanies={companies || []} totalCount={count || 0} />
    </>
  );
}
