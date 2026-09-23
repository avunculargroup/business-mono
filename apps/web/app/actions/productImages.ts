'use server';

import { revalidatePath } from 'next/cache';
import { getAuthedClient } from '@/lib/action';
import { humanizeError } from '@/lib/errors';
import { ACCEPTED_IMAGE_TYPES, MAX_IMAGE_BYTES, clampFocal } from '@/lib/products/images';
import { PRODUCT_IMAGES_BUCKET as BUCKET, PRODUCT_IMAGE_COLUMNS, type ProductImageRow } from '@/lib/products/signImages';

function revalidateProduct(productId: string) {
  revalidatePath('/products');
  revalidatePath(`/products/${productId}`);
}

// ──────────────────────────────────────────────────────────
// Upload (client uploads straight to Storage, then registers)
// ──────────────────────────────────────────────────────────

export async function createProductImageUploadUrl(
  productId: string,
  filename: string,
  mimeType: string,
  byteSize: number,
): Promise<{ error: string } | { success: true; signedUrl: string; path: string }> {
  if (!ACCEPTED_IMAGE_TYPES.includes(mimeType)) {
    return { error: `${filename} isn't a supported image. Use JPEG, PNG, WebP, GIF or AVIF.` };
  }
  if (byteSize > MAX_IMAGE_BYTES) {
    return { error: `${filename} is over 10 MB.` };
  }

  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const ext = (filename.split('.').pop() ?? 'img').toLowerCase().replace(/[^a-z0-9]/g, '') || 'img';
  const path = `${productId}/${crypto.randomUUID()}.${ext}`;

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error) return { error: humanizeError(error) };
  return { success: true, signedUrl: data.signedUrl, path };
}

export async function registerProductImage(params: {
  productId: string;
  path: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  width?: number;
  height?: number;
}): Promise<{ error: string } | { success: true; image: ProductImageRow }> {
  // The path is minted by createProductImageUploadUrl under the product's
  // folder; refuse one that points anywhere else.
  if (!params.path.startsWith(`${params.productId}/`)) {
    return { error: 'That upload does not belong to this product.' };
  }

  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user } = auth;

  // Append to the end of the gallery.
  const { data: last } = await supabase
    .from('product_images')
    .select('sort_order')
    .eq('product_service_id', params.productId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from('product_images')
    .insert({
      product_service_id: params.productId,
      storage_path: params.path,
      filename: params.filename,
      mime_type: params.mimeType,
      byte_size: params.byteSize,
      width: params.width ?? null,
      height: params.height ?? null,
      sort_order: last ? last.sort_order + 1 : 0,
      created_by: user.id,
    })
    .select(PRODUCT_IMAGE_COLUMNS)
    .single();

  if (error) {
    await supabase.storage.from(BUCKET).remove([params.path]);
    return { error: humanizeError(error) };
  }

  revalidateProduct(params.productId);
  return { success: true, image: data };
}

// ──────────────────────────────────────────────────────────
// Feature, position, remove
// ──────────────────────────────────────────────────────────

export async function setFeaturedProductImage(
  productId: string,
  imageId: string,
): Promise<{ error: string } | { success: true }> {
  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  // The composite foreign key rejects an image from another product.
  const { error } = await supabase
    .from('products_services')
    .update({ featured_image_id: imageId })
    .eq('id', productId);

  if (error) return { error: humanizeError(error) };
  revalidateProduct(productId);
  return { success: true };
}

export async function updateProductImagePosition(
  productId: string,
  imageId: string,
  focalX: number,
  focalY: number,
): Promise<{ error: string } | { success: true }> {
  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const { error } = await supabase
    .from('product_images')
    .update({ focal_x: clampFocal(focalX), focal_y: clampFocal(focalY) })
    .eq('id', imageId)
    .eq('product_service_id', productId);

  if (error) return { error: humanizeError(error) };
  revalidateProduct(productId);
  return { success: true };
}

export async function deleteProductImage(
  productId: string,
  imageId: string,
): Promise<{ error: string } | { success: true }> {
  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const { data: image, error } = await supabase
    .from('product_images')
    .delete()
    .eq('id', imageId)
    .eq('product_service_id', productId)
    .select('storage_path')
    .single();

  if (error) return { error: humanizeError(error) };

  // Row first, then file: a leftover file is invisible, a row pointing at a
  // missing file is a broken tile.
  await supabase.storage.from(BUCKET).remove([image.storage_path]);

  revalidateProduct(productId);
  return { success: true };
}
