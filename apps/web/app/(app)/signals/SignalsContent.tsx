import { getRepositories } from '@/lib/repositories';
import { resolveReadContext } from '@platform/data-supabase';
import { SignalsView } from '@/components/ecosystem/SignalsView';

/**
 * Both surfaces read views, never the base tables: `v_ecosystem_feed` already
 * excludes dismissed and archived changes and carries the entity context and
 * slugs the rows need, and `v_ecosystem_watch_health` already sorts
 * failing-then-stale. Which view that is, is now the adapter's business.
 */
export async function SignalsContent() {
  const repositories = await getRepositories();
  const ctx = resolveReadContext();

  const [changes, watchHealth] = await Promise.all([
    repositories.ecosystem.listFeed(ctx),
    repositories.ecosystem.listWatchHealth(ctx),
  ]);

  return <SignalsView changes={changes} watchHealth={watchHealth} />;
}
