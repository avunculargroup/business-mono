import { getRepositories } from '@/lib/repositories';
import { resolveReadContext } from '@platform/data-supabase';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { CompaniesList } from '@/components/crm/CompaniesList';

export default async function CompaniesPage() {
  const { companies } = await getRepositories();
  const { items, total } = await companies.listCompanies(resolveReadContext());

  return (
    <>
      <PageHeader title="Companies" />
      <CompaniesList initialCompanies={items} totalCount={total} />
    </>
  );
}
