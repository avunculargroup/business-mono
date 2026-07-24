import { PageHeader } from '@/components/app-shell/PageHeader';
import { createClient } from '@/lib/supabase/server';
import { CollectionsIndex } from './CollectionsIndex';
import type { PodcastCollection, PodcastCollectionCard } from '@platform/shared';

export const dynamic = 'force-dynamic';

export default async function CollectionsPage() {
  const supabase = await createClient();
  // podcast_collections / _items are post-migration, so they aren't in the
  // generated Database types — access through a boundary cast (same pattern as
  // the rest of the podcast intelligence code).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as unknown as { from: (t: string) => any };

  const [{ data: collections }, { data: items }] = await Promise.all([
    db.from('podcast_collections').select('*').order('updated_at', { ascending: false }),
    db.from('podcast_collection_items').select('collection_id'),
  ]);

  // Count episodes per pack in code — one small membership scan beats a per-row
  // count query, and the table is tiny.
  const counts = new Map<string, number>();
  for (const row of (items ?? []) as { collection_id: string }[]) {
    counts.set(row.collection_id, (counts.get(row.collection_id) ?? 0) + 1);
  }

  const cards: PodcastCollectionCard[] = ((collections ?? []) as PodcastCollection[]).map((c) => ({
    ...c,
    episode_count: counts.get(c.id) ?? 0,
  }));

  return (
    <>
      <PageHeader title="Collections" backHref="/news/podcasts" backLabel="Podcast ingestion" />
      <CollectionsIndex collections={cards} />
    </>
  );
}
