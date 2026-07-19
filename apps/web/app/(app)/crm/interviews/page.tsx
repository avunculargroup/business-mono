import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { InterviewsList } from '@/components/crm/InterviewsList';
import { getInterviews } from '@/app/actions/interviews';
import { getCompanyOptions } from '@/lib/referenceData';

export default async function InterviewsPage() {
  const supabase = await createClient();

  const [interviews, companies, contactsResult] = await Promise.all([
    getInterviews(),
    getCompanyOptions(supabase),
    supabase.from('contacts').select('id, first_name, last_name').order('last_name'),
  ]);

  return (
    <>
      <PageHeader title="Interviews" />
      <InterviewsList
        initialInterviews={interviews}
        companies={companies}
        contacts={contactsResult.data ?? []}
      />
    </>
  );
}
