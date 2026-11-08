import { toBrandVisual, type BrandVisual } from '@platform/shared';
import type { ContentImage } from '@platform/data';
import type { createClient } from '@/lib/supabase/server';

// Server-side inputs for the image slot on /content/[id]: a short-lived signed
// URL for the current image, and the active visual canon (for the motif list,
// the brief linter and the prompt preview). Kept out of the page so it can be
// tested with the chainable fake.

type Supabase = Awaited<ReturnType<typeof createClient>>;

const BUCKET = 'platform-files';
/** Long enough to read the page; the slot re-reads it while a render runs. */
const PREVIEW_TTL_S = 60 * 60;

export interface ImageSlotData {
  image: (ContentImage & { url: string | null }) | null;
  canon: BrandVisual | null;
}

export async function loadImageSlotData(supabase: Supabase, image: ContentImage | null): Promise<ImageSlotData> {
  const [{ data: canonRow }, signed] = await Promise.all([
    supabase.from('brand_visual').select('*').eq('is_active', true).limit(1).maybeSingle(),
    image ? supabase.storage.from(BUCKET).createSignedUrl(image.storagePath, PREVIEW_TTL_S) : Promise.resolve(null),
  ]);
  return {
    image: image ? { ...image, url: signed?.data?.signedUrl ?? null } : null,
    canon: canonRow ? toBrandVisual(canonRow) : null,
  };
}

/** Images are made for the two social platforms only. */
export function hasImageSlot(type: string): boolean {
  return type === 'linkedin' || type === 'twitter_x';
}
