'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { CompanyRecord, CompanyRecordType } from '@platform/shared';

const BUCKET = 'company-assets';

// ──────────────────────────────────────────────────────────
// Record Types
// ──────────────────────────────────────────────────────────

export async function getCompanyRecordTypes(): Promise<CompanyRecordType[]> {
  const supabase = await createClient();
  const { data, error } = await (supabase as any)
    .from('company_record_types')
    .select('*')
    .order('category')
    .order('sort_order');
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createCompanyRecordType(params: {
  label: string;
  content_type: string;
  category: string;
  is_singleton: boolean;
}): Promise<{ error: string } | { success: true; key: string }> {
  const supabase = await createClient();
  const key = params.label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

  const { data, error } = await (supabase as any)
    .from('company_record_types')
    .insert({
      key,
      label: params.label,
      content_type: params.content_type,
      category: params.category,
      is_singleton: params.is_singleton,
      is_builtin: false,
      sort_order: 0,
    })
    .select('key')
    .single();

  if (error) return { error: error.message };
  return { success: true, key: data.key };
}

export async function deleteCompanyRecordType(
  key: string,
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient();

  const { data: type } = await (supabase as any)
    .from('company_record_types')
    .select('is_builtin')
    .eq('key', key)
    .single();

  if (type?.is_builtin) return { error: 'Built-in types cannot be deleted.' };

  const { count } = await (supabase as any)
    .from('company_records')
    .select('*', { count: 'exact', head: true })
    .eq('type_key', key);

  if (count && count > 0) return { error: 'Remove all records of this type before deleting it.' };

  const { error } = await (supabase as any)
    .from('company_record_types')
    .delete()
    .eq('key', key);

  if (error) return { error: error.message };
  return { success: true };
}

// ──────────────────────────────────────────────────────────
// Records
// ──────────────────────────────────────────────────────────

export async function getCompanyRecords(): Promise<CompanyRecord[]> {
  const supabase = await createClient();
  const { data, error } = await (supabase as any)
    .from('company_records')
    .select('*, type:company_record_types(*)')
    .order('display_order')
    .order('created_at');
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createCompanyRecord(params: {
  type_key: string;
  value?: string;
  storage_path?: string;
  filename?: string;
  mime_type?: string;
  is_pinned?: boolean;
}): Promise<{ error: string } | { success: true; id: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: type } = await (supabase as any)
    .from('company_record_types')
    .select('is_singleton, label')
    .eq('key', params.type_key)
    .single();

  if (type?.is_singleton) {
    const { count } = await (supabase as any)
      .from('company_records')
      .select('*', { count: 'exact', head: true })
      .eq('type_key', params.type_key);
    if (count && count > 0)
      return { error: `Only one "${type.label}" record is allowed.` };
  }

  const { data, error } = await (supabase as any)
    .from('company_records')
    .insert({
      type_key:     params.type_key,
      value:        params.value        ?? null,
      storage_path: params.storage_path ?? null,
      filename:     params.filename     ?? null,
      mime_type:    params.mime_type    ?? null,
      is_pinned:    params.is_pinned    ?? false,
      created_by:   user?.id            ?? null,
    })
    .select('id')
    .single();

  if (error) return { error: error.message };
  revalidatePath('/company');
  return { success: true, id: data.id };
}

export async function updateCompanyRecord(
  id: string,
  params: {
    value?: string;
    storage_path?: string;
    filename?: string;
    mime_type?: string;
    is_pinned?: boolean;
    display_order?: number;
  },
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient();
  const { error } = await (supabase as any)
    .from('company_records')
    .update({
      ...(params.value        !== undefined && { value:        params.value }),
      ...(params.storage_path !== undefined && { storage_path: params.storage_path }),
      ...(params.filename     !== undefined && { filename:     params.filename }),
      ...(params.mime_type    !== undefined && { mime_type:    params.mime_type }),
      ...(params.is_pinned    !== undefined && { is_pinned:    params.is_pinned }),
      ...(params.display_order !== undefined && { display_order: params.display_order }),
    })
    .eq('id', id);

  if (error) return { error: error.message };
  revalidatePath('/company');
  return { success: true };
}

export async function deleteCompanyRecord(
  id: string,
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient();
  const { error } = await (supabase as any)
    .from('company_records')
    .delete()
    .eq('id', id);

  if (error) return { error: error.message };
  revalidatePath('/company');
  return { success: true };
}

// ──────────────────────────────────────────────────────────
// Storage
// ──────────────────────────────────────────────────────────

export async function createCompanyUploadSignedUrl(
  filename: string,
  _mimeType: string,
): Promise<{ error: string } | { success: true; signedUrl: string; path: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthenticated' };

  const ext = filename.split('.').pop() ?? 'bin';
  const id = crypto.randomUUID();
  const path = `${id}/original.${ext}`;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(path);

  if (error) return { error: error.message };
  return { success: true, signedUrl: data.signedUrl, path };
}

export async function getCompanyAssetUrl(path: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}
