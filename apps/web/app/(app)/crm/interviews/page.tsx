import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { InterviewsList } from '@/components/crm/InterviewsList';
import { getInterviews } from '@/app/actions/interviews';

export default async function InterviewsPage() {
  const supabase = await createClient();

  const [interviews, companiesResult, contactsResult] = await Promise.all([
    getInterviews(),
    supabase.from('companies').select('id, name').order('name'),
    supabase.from('contacts').select('id, first_name, last_name').order('last_name'),
  ]);

  return (
    <>
      <PageHeader title="Interviews" />
      <InterviewsList
        initialInterviews={interviews}
        companies={companiesResult.data ?? []}
        contacts={contactsResult.data ?? []}
      />
    </>
  );
}
