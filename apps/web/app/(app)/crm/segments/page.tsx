import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { SegmentsList } from '@/components/crm/SegmentsList';

export default async function SegmentsPage() {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: segments } = await (supabase as any)
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
