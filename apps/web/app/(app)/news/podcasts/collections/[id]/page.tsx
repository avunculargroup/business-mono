import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { idColumn } from '@/lib/utils';
import { CollectionEditor } from './CollectionEditor';
import type {
  PodcastCollection,
  PodcastCollectionEpisode,
  PodcastCollectionPickerEpisode,
} from '@platform/shared';

export const dynamic = 'force-dynamic';

// The client-safe library payload each member/picker episode is rendered from.
// v_episode_library is approved-episodes-only, so a pack never carries an
// unapproved brief or an ops internal.
interface LibraryRow {
  id: string;
  slug: string;
  title: string;
  source_name: string | null;
  image_url: string | null;
  duration_seconds: number | null;
  published_at: string | null;
  relevance_score: number | null;
  category: PodcastCollectionEpisode['category'];
  episode_summary: string | null;
}

export default async function CollectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  // Post-migration tables aren't in the generated types — boundary cast, the
  // same pattern the rest of the podcast intelligence code uses.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as unknown as { from: (t: string) => any };

  const { data: collectionRow } = await db
    .from('podcast_collections')
    .select('*')
    .eq(idColumn(id), id)
    .maybeSingle();
  if (!collectionRow) notFound();
  const collection = collectionRow as PodcastCollection;

  const [{ data: itemRows }, { data: libraryRows }] = await Promise.all([
    db
      .from('podcast_collection_items')
      .select('id, episode_id, position')
      .eq('collection_id', collection.id)
      .order('position', { ascending: true }),
    // The whole client-safe library — the members join against it and the picker
    // offers whatever isn't already in the pack.
    db.from('v_episode_library').select('*'),
  ]);

  const items = (itemRows ?? []) as { id: string; episode_id: string; position: number }[];
  const libraryById = new Map(((libraryRows ?? []) as LibraryRow[]).map((r) => [r.id, r]));

  // Members, in curated order. An item whose episode is no longer approved
  // (brief rejected after it was added) drops out of the library view and so
  // isn't rendered — the publish-wall holds even inside a pack.
  const episodes: PodcastCollectionEpisode[] = items
    .map((item) => {
      const ep = libraryById.get(item.episode_id);
      if (!ep) return null;
      return {
        item_id: item.id,
        position: item.position,
        episode_id: ep.id,
        slug: ep.slug,
        title: ep.title,
        source_name: ep.source_name,
        image_url: ep.image_url,
        duration_seconds: ep.duration_seconds,
        published_at: ep.published_at,
        relevance_score: ep.relevance_score,
        category: ep.category,
        episode_summary: ep.episode_summary,
      } satisfies PodcastCollectionEpisode;
    })
    .filter((e): e is PodcastCollectionEpisode => e !== null);

  const memberIds = new Set(items.map((i) => i.episode_id));
  const pickerEpisodes: PodcastCollectionPickerEpisode[] = ((libraryRows ?? []) as LibraryRow[])
    .filter((r) => !memberIds.has(r.id))
    .map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      source_name: r.source_name,
      published_at: r.published_at,
    }));

  return (
    <>
      <PageHeader title="Collection" backHref="/news/podcasts/collections" backLabel="Collections" />
      <CollectionEditor collection={collection} episodes={episodes} pickerEpisodes={pickerEpisodes} />
    </>
  );
}
