import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { ActivityFeed } from '@/components/agent/ActivityFeed';

export default async function ActivityPage() {
  const supabase = await createClient();

  const { data: activities, count } = await supabase
    .from('agent_activity')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <>
      <PageHeader title="Agent Activity" />
      <ActivityFeed initialActivities={activities || []} totalCount={count || 0} />
    </>
  );
}
