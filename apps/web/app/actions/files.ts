'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

const ORG_ID = 'bts';
const FILES_BUCKET = 'platform-files';

export type PlatformFile = {
  id: string;
  name: string;
  original_filename: string;
  bucket: string;
  storage_path: string;
  mime_type: string;
  byte_size: number | null;
  tags: string[];
  is_public: boolean;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
  signed_url?: string;
};

export type FileFilters = {
  search?: string;
  tags?: string[];
  is_public?: boolean;
  type?: 'images' | 'documents' | 'all';
};

// ── Read ──────────────────────────────────────────────────

export async function getFiles(filters?: FileFilters): Promise<{ files: PlatformFile[]; error?: string }> {
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from('platform_files')
    .select('*')
    .eq('org_id', ORG_ID)
    .order('created_at', { ascending: false });

  if (filters?.search) {
    query = query.ilike('name', `%${filters.search}%`);
  }
  if (filters?.is_public !== undefined) {
    query = query.eq('is_public', filters.is_public);
  }
  if (filters?.tags?.length) {
    query = query.overlaps('tags', filters.tags);
  }
  if (filters?.type === 'images') {
    query = query.like('mime_type', 'image/%');
  } else if (filters?.type === 'documents') {
    query = query.eq('mime_type', 'application/pdf');
  }

  const { data, error } = await query;
  if (error) return { files: [], error: error.message };
  if (!data?.length) return { files: [] };

  // Batch-generate signed URLs for display (1 hour)
  const paths: string[] = data.map((f: PlatformFile) => f.storage_path);
  const { data: urlData } = await supabase.storage.from(FILES_BUCKET).createSignedUrls(paths, 3600);

  const urlMap = new Map<string, string>();
  urlData?.forEach((item: { path: string | null; signedUrl: string }) => {
    if (item.path && item.signedUrl) urlMap.set(item.path, item.signedUrl);
  });

  const files: PlatformFile[] = data.map((f: PlatformFile) => ({
    ...f,
    signed_url: urlMap.get(f.storage_path),
  }));

  return { files };
}

// ── Upload ────────────────────────────────────────────────

export async function createFileUploadUrl(
  filename: string,
): Promise<{ error: string } | { success: true; signedUrl: string; token: string; path: string; fileId: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthenticated' };

  const ext = filename.split('.').pop()?.toLowerCase() ?? 'bin';
  const fileId = crypto.randomUUID();
  const path = `${ORG_ID}/${fileId}/original.${ext}`;

  const { data, error } = await supabase.storage.from(FILES_BUCKET).createSignedUploadUrl(path);
  if (error) return { error: error.message };

  return { success: true, signedUrl: data.signedUrl, token: data.token, path, fileId };
}

export async function registerFile(params: {
  fileId: string;
  name: string;
  originalFilename: string;
  storagePath: string;
  mimeType: string;
  byteSize?: number;
  tags?: string[];
  isPublic?: boolean;
}): Promise<{ error: string } | { success: true; id: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('platform_files')
    .insert({
      id: params.fileId,
      org_id: ORG_ID,
      name: params.name,
      original_filename: params.originalFilename,
      bucket: FILES_BUCKET,
      storage_path: params.storagePath,
      mime_type: params.mimeType,
      byte_size: params.byteSize ?? null,
      tags: params.tags ?? [],
      is_public: params.isPublic ?? false,
      uploaded_by: user?.id ?? null,
    })
    .select('id')
    .single();

  if (error) return { error: error.message };
  revalidatePath('/files');
  return { success: true, id: data.id };
}

// ── Update ────────────────────────────────────────────────

export async function renameFile(
  id: string,
  name: string,
): Promise<{ error?: string; success?: boolean }> {
  if (!name.trim()) return { error: 'Name is required' };
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('platform_files').update({ name: name.trim() }).eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/files');
  return { success: true };
}

export async function updateFileTags(
  id: string,
  tags: string[],
): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('platform_files').update({ tags }).eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/files');
  return { success: true };
}

export async function updateFileVisibility(
  id: string,
  isPublic: boolean,
): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('platform_files').update({ is_public: isPublic }).eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/files');
  return { success: true };
}

// ── Delete ────────────────────────────────────────────────

export async function deleteFile(id: string): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: file } = await (supabase as any)
    .from('platform_files')
    .select('storage_path')
    .eq('id', id)
    .single();

  if (file?.storage_path) {
    await supabase.storage.from(FILES_BUCKET).remove([file.storage_path]);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('platform_files').delete().eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/files');
  return { success: true };
}

// ── Download ──────────────────────────────────────────────

export async function getFileDownloadUrl(
  id: string,
): Promise<{ error: string } | { url: string }> {
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: file } = await (supabase as any)
    .from('platform_files')
    .select('storage_path, name, original_filename')
    .eq('id', id)
    .single();

  if (!file) return { error: 'File not found' };

  const { data, error } = await supabase.storage.from(FILES_BUCKET).createSignedUrl(
    file.storage_path,
    300,
    { download: file.name || file.original_filename },
  );

  if (error) return { error: error.message };
  return { url: data.signedUrl };
}
