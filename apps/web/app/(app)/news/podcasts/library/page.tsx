import { PageHeader } from '@/components/app-shell/PageHeader';
import { createClient } from '@/lib/supabase/server';
import { LibraryBrowse } from './LibraryBrowse';
import type { EpisodeLibraryCard } from '@platform/shared';

export const dynamic = 'force-dynamic';

export default async function LibraryPage() {
  const supabase = await createClient();
  // Read the client-safe view, never podcast_episodes directly — the ops/client
  // boundary is the view (v_episode_library exposes only approved, safe fields).
  // It isn't in the generated Database types, so access goes through a boundary
  // cast, the same pattern the rest of the podcast intelligence code uses.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as unknown as { from: (t: string) => any };
  const { data } = await db.from('v_episode_library').select('*');

  const episodes = (data ?? []) as EpisodeLibraryCard[];

  return (
    <>
      <PageHeader title="Podcast library" backHref="/news/podcasts" backLabel="Podcast ingestion" />
      <LibraryBrowse episodes={episodes} />
    </>
  );
}
