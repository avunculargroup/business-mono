import { toBrandVisual, type BrandVisual } from '@platform/shared';
import type { ContentImage } from '@platform/data';
import type { createClient } from '@/lib/supabase/server';

// Server-side inputs for the image slot on /content/[id]: short-lived signed
// URLs for the selected image and the run's other candidates, and the active
// visual canon (for the layout list, the brief linter and the prompt preview).
// Kept out of the page so it can be tested with the chainable fake.

type Supabase = Awaited<ReturnType<typeof createClient>>;

const BUCKET = 'platform-files';
/** Long enough to read the page; the slot re-reads it while a render runs. */
const PREVIEW_TTL_S = 60 * 60;

type Signed = ContentImage & { url: string | null };

export interface ImageSlotData {
  image: Signed | null;
  candidates: Signed[];
  canon: BrandVisual | null;
}

export async function loadImageSlotData(
  supabase: Supabase,
  image: ContentImage | null,
  candidates: ContentImage[] = [],
): Promise<ImageSlotData> {
  const all = [...(image ? [image] : []), ...candidates];
  const [{ data: canonRow }, signed] = await Promise.all([
    supabase.from('brand_visual').select('*').eq('is_active', true).limit(1).maybeSingle(),
    all.length > 0
      ? supabase.storage.from(BUCKET).createSignedUrls(
          all.map((i) => i.storagePath),
          PREVIEW_TTL_S,
        )
      : Promise.resolve(null),
  ]);
  const urlByPath = new Map((signed?.data ?? []).map((s) => [s.path, s.signedUrl]));
  const sign = (i: ContentImage): Signed => ({ ...i, url: urlByPath.get(i.storagePath) ?? null });
  return {
    image: image ? sign(image) : null,
    candidates: candidates.map(sign),
    canon: canonRow ? toBrandVisual(canonRow) : null,
  };
}

/** Images are made for the two social platforms only. */
export function hasImageSlot(type: string): boolean {
  return type === 'linkedin' || type === 'twitter_x';
}
