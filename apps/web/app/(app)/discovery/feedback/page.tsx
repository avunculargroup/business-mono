import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { FeedbackList } from '@/components/discovery/FeedbackList';
import { getFeedback } from '@/app/actions/feedback';
import { getCompanyOptions } from '@/lib/referenceData';

export default async function FeedbackPage() {
  const supabase = await createClient();

  const [entries, contactsResult, companies, painPointsResult] = await Promise.all([
    getFeedback(),
    supabase.from('contacts').select('id, first_name, last_name').order('last_name'),
    getCompanyOptions(supabase),
    supabase.from('pain_points').select('id, content, interview_id').order('created_at', { ascending: false }),
  ]);

  return (
    <>
      <PageHeader title="Feedback Repository" />
      <FeedbackList
        initialEntries={entries}
        contacts={contactsResult.data ?? []}
        companies={companies}
        painPoints={painPointsResult.data ?? []}
      />
    </>
  );
}
