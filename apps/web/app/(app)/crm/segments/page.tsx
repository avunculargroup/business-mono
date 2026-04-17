import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { SegmentsList } from '@/components/crm/SegmentsList';

export default async function SegmentsPage() {
  const supabase = await createClient();
  const { data: segments } = await supabase
    .from('segment_scorecards')
    .select('*')
    .order('created_at', { ascending: true });

  return (
    <>
      <PageHeader title="Segments" />
      <SegmentsList initialSegments={segments ?? []} />
    </>
  );
}
