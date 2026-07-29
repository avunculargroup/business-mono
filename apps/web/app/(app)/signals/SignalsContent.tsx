import { createClient } from '@/lib/supabase/server';
import { SignalsView } from '@/components/ecosystem/SignalsView';

/**
 * Both surfaces read views, never the base tables: `v_ecosystem_feed` already
 * excludes dismissed and archived changes and carries the entity context and
 * slugs the rows need, and `v_ecosystem_watch_health` already sorts
 * failing-then-stale.
 */
export async function SignalsContent() {
  const supabase = await createClient();

  const [{ data: changes }, { data: watchHealth }] = await Promise.all([
    supabase.from('v_ecosystem_feed').select('*').limit(200),
    supabase.from('v_ecosystem_watch_health').select('*'),
  ]);

  return <SignalsView changes={changes ?? []} watchHealth={watchHealth ?? []} />;
}
