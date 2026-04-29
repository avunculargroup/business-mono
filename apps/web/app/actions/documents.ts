'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const docs = (supabase: Awaited<ReturnType<typeof createClient>>) =>
  (supabase as any).from('documents');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const vers = (supabase: Awaited<ReturnType<typeof createClient>>) =>
  (supabase as any).from('document_versions');

const documentSchema = z.object({
  type:        z.enum(['report', 'proposal', 'brief', 'memo', 'strategy']),
  title:       z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  tags:        z.string().optional(),
});

const versionSchema = z.object({
  content: z.string().min(1, 'Content is required'),
});

export async function createDocument(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = documentSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const tags = parseTags(parsed.data.tags);

  const { data: document, error: docErr } = await docs(supabase)
    .insert({
      type:        parsed.data.type,
      title:       parsed.data.title,
      description: parsed.data.description || null,
      tags,
      created_by:  user?.id ?? null,
    })
    .select()
    .single();

  if (docErr) return { error: docErr.message };

  const { error: verErr } = await vers(supabase).insert({
    document_id:    document.id,
    version_number: 1,
    status:         'draft',
    content:        { markdown: '' },
    created_by:     user?.id ?? null,
  });

  if (verErr) return { error: verErr.message };

  revalidatePath('/docs');
  return { success: true, document };
}

export async function updateDocument(id: string, formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = documentSchema.partial().safeParse(raw);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const supabase = await createClient();
  const updateData: Record<string, unknown> = {};

  if (parsed.data.type        !== undefined) updateData.type        = parsed.data.type;
  if (parsed.data.title       !== undefined) updateData.title       = parsed.data.title;
  if (parsed.data.description !== undefined) updateData.description = parsed.data.description || null;
  if (parsed.data.tags        !== undefined) updateData.tags        = parseTags(parsed.data.tags);

  const { error } = await docs(supabase).update(updateData).eq('id', id);
  if (error) return { error: error.message };

  revalidatePath('/docs');
  return { success: true };
}

export async function createDocumentVersion(documentId: string, formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = versionSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  let content: Record<string, unknown>;
  try {
    content = JSON.parse(parsed.data.content);
  } catch {
    return { error: 'Content must be valid JSON' };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: versions } = await vers(supabase)
    .select('version_number')
    .eq('document_id', documentId)
    .order('version_number', { ascending: false })
    .limit(1);

  const nextVersion = ((versions?.[0]?.version_number as number) ?? 0) + 1;

  const { error } = await vers(supabase).insert({
    document_id:    documentId,
    version_number: nextVersion,
    status:         'draft',
    content,
    created_by:     user?.id ?? null,
  });

  if (error) return { error: error.message };

  revalidatePath('/docs');
  return { success: true, version_number: nextVersion };
}

export async function updateDocumentVersion(versionId: string, content: Record<string, unknown>) {
  if (typeof content !== 'object' || content === null || Array.isArray(content)) {
    return { error: 'Content must be an object' };
  }

  const supabase = await createClient();

  const { error } = await vers(supabase)
    .update({ content })
    .eq('id', versionId)
    .eq('status', 'draft');

  if (error) return { error: error.message };

  revalidatePath('/docs');
  return { success: true };
}

export async function approveDocumentVersion(documentId: string, versionId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  await vers(supabase)
    .update({ status: 'deprecated' })
    .eq('document_id', documentId)
    .eq('status', 'approved');

  const { error } = await vers(supabase)
    .update({ status: 'approved', approved_by: user?.id ?? null })
    .eq('id', versionId);

  if (error) return { error: error.message };

  revalidatePath('/docs');
  return { success: true };
}

export async function getDocuments() {
  const supabase = await createClient();
  const { data, error } = await docs(supabase)
    .select('*, document_versions(*)')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getDocument(id: string) {
  const supabase = await createClient();
  const { data, error } = await docs(supabase)
    .select('*, document_versions(*)')
    .eq('id', id)
    .order('version_number', { referencedTable: 'document_versions', ascending: false })
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function importDocxDocument(formData: FormData) {
  const file = formData.get('file') as File | null;
  if (!file || file.size === 0) return { error: 'No file selected' };
  if (!file.name.toLowerCase().endsWith('.docx')) return { error: 'File must be a .docx' };

  const raw = {
    type:        formData.get('type'),
    title:       formData.get('title'),
    description: formData.get('description'),
    tags:        formData.get('tags'),
  };

  const parsed = documentSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
  const mammoth = require('mammoth') as any;
  const { value: markdown } = await mammoth.convertToMarkdown({ buffer }) as { value: string };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const tags = parseTags(parsed.data.tags);

  const { data: document, error: docErr } = await docs(supabase)
    .insert({
      type:        parsed.data.type,
      title:       parsed.data.title,
      description: parsed.data.description || null,
      tags,
      created_by:  user?.id ?? null,
    })
    .select()
    .single();

  if (docErr) return { error: docErr.message };

  const { error: verErr } = await vers(supabase).insert({
    document_id:    document.id,
    version_number: 1,
    status:         'draft',
    content:        { markdown },
    created_by:     user?.id ?? null,
  });

  if (verErr) return { error: verErr.message };

  revalidatePath('/docs');
  return { success: true, document };
}

function parseTags(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t) => typeof t === 'string' && t.trim()) : [];
  } catch {
    return raw.split(',').map((t) => t.trim()).filter(Boolean);
  }
}
