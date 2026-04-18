import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { PipelineBoard } from '@/components/discovery/PipelineBoard';
import { getPipelineItems, getPainPointsForPicker } from '@/app/actions/pipeline';

export default async function PipelinePage() {
  const supabase = await createClient();

  const [items, painPoints, teamResult] = await Promise.all([
    getPipelineItems(),
    getPainPointsForPicker(),
    supabase.from('team_members').select('id, full_name').order('full_name'),
  ]);

  return (
    <>
      <PageHeader title="Insight Pipeline" />
      <PipelineBoard
        initialItems={items}
        painPoints={painPoints}
        teamMembers={teamResult.data ?? []}
      />
    </>
  );
}
