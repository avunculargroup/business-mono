import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { FeedbackList } from '@/components/discovery/FeedbackList';
import { getFeedback } from '@/app/actions/feedback';

export default async function FeedbackPage() {
  const supabase = await createClient();

  const [entries, contactsResult, companiesResult, painPointsResult] = await Promise.all([
    getFeedback(),
    supabase.from('contacts').select('id, first_name, last_name').order('last_name'),
    supabase.from('companies').select('id, name').order('name'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('pain_points').select('id, content, interview_id').order('created_at', { ascending: false }),
  ]);

  return (
    <>
      <PageHeader title="Feedback Repository" />
      <FeedbackList
        initialEntries={entries}
        contacts={contactsResult.data ?? []}
        companies={companiesResult.data ?? []}
        painPoints={painPointsResult.data ?? []}
      />
    </>
  );
}
