'use server';

import { createClient } from '@/lib/supabase/server';
import type { AssetRow } from '@/lib/decks/schema';

const ORG_ID = 'bts';
const BUCKET = 'slide-assets';

// ──────────────────────────────────────────────────────────
// Read
// ──────────────────────────────────────────────────────────

export async function getAssets(): Promise<AssetRow[]> {
  const supabase = await createClient();
  const { data, error } = await (supabase as any)
    .from('assets')
    .select('*')
    .eq('org_id', ORG_ID)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getAsset(id: string): Promise<AssetRow | null> {
  const supabase = await createClient();
  const { data, error } = await (supabase as any)
    .from('assets')
    .select('*')
    .eq('id', id)
    .single();
  if (error) return null;
  return data;
}

// ──────────────────────────────────────────────────────────
// Upload helpers (called from client after direct Storage upload)
// ──────────────────────────────────────────────────────────

export async function createUploadSignedUrl(
  filename: string,
  _mimeType: string,
): Promise<{ error: string } | { success: true; signedUrl: string; path: string; assetId: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthenticated' };

  const ext = filename.split('.').pop() ?? 'bin';
  const assetId = crypto.randomUUID();
  const path = `${ORG_ID}/${assetId}/original.${ext}`;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(path);

  if (error) return { error: error.message };
  return { success: true, signedUrl: data.signedUrl, path, assetId };
}

export async function registerUploadedAsset(params: {
  assetId: string;
  path: string;
  filename: string;
  mimeType: string;
  byteSize?: number;
  width?: number;
  height?: number;
  altText?: string;
}): Promise<{ error: string } | { success: true; id: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await (supabase as any)
    .from('assets')
    .insert({
      id: params.assetId,
      org_id: ORG_ID,
      uploaded_by: user?.id,
      bucket: BUCKET,
      path: params.path,
      filename: params.filename,
      mime_type: params.mimeType,
      byte_size: params.byteSize ?? null,
      width: params.width ?? null,
      height: params.height ?? null,
      alt_text: params.altText ?? null,
    })
    .select('id')
    .single();

  if (error) return { error: error.message };
  return { success: true, id: data.id };
}

// ──────────────────────────────────────────────────────────
// Public URL for rendering
// ──────────────────────────────────────────────────────────

export async function getAssetUrl(path: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}
