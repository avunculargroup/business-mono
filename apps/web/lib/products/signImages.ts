import type { createClient } from '@/lib/supabase/server';
import type { ProductImage } from './images';

export const PRODUCT_IMAGES_BUCKET = 'product-images';
export const PRODUCT_IMAGE_COLUMNS =
  'id, storage_path, filename, alt_text, width, height, focal_x, focal_y, sort_order, created_at';

const SIGNED_URL_TTL_SECONDS = 3600;

export type ProductImageRow = Omit<ProductImage, 'url'>;

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Attach signed URLs to gallery rows, one storage round trip for the lot.
 * Server-only: kept out of the actions file so it is not callable as a server
 * action with arbitrary paths.
 */
export async function signProductImages(
  supabase: SupabaseServerClient,
  rows: ProductImageRow[],
): Promise<ProductImage[]> {
  if (rows.length === 0) return [];
  const { data } = await supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .createSignedUrls(rows.map((r) => r.storage_path), SIGNED_URL_TTL_SECONDS);

  const urls = new Map((data ?? []).map((d) => [d.path, d.signedUrl]));
  return rows.map((r) => ({ ...r, url: urls.get(r.storage_path) ?? null }));
}
