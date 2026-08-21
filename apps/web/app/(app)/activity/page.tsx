import { getRepositories } from '@/lib/repositories';
import { resolveReadContext } from '@platform/data-supabase';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { ActivityFeed } from '@/components/agent/ActivityFeed';

export default async function ActivityPage() {
  const repositories = await getRepositories();

  const { items, total } = await repositories.agentActivity.listActivity(resolveReadContext());

  return (
    <>
      <PageHeader title="Agent Activity" />
      <ActivityFeed initialActivities={items} totalCount={total} />
    </>
  );
}
