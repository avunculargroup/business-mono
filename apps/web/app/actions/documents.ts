'use server';

import type { Json } from '@platform/db';
import { createClient } from '@/lib/supabase/server';
import { getAuthedClient } from '@/lib/action';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { humanizeError } from '@/lib/errors';
import { idColumn } from '@/lib/utils';

const docs = (supabase: Awaited<ReturnType<typeof createClient>>) =>
  supabase.from('documents');

const vers = (supabase: Awaited<ReturnType<typeof createClient>>) =>
  supabase.from('document_versions');

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

  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user } = auth;

  const tags = parseTags(parsed.data.tags);

  const { data: document, error: docErr } = await docs(supabase)
    .insert({
      type:        parsed.data.type,
      title:       parsed.data.title,
      description: parsed.data.description || null,
      tags,
      created_by:  user.id,
    })
    .select()
    .single();

  if (docErr) return { error: humanizeError(docErr) };

  const { error: verErr } = await vers(supabase).insert({
    document_id:    document.id,
    version_number: 1,
    status:         'draft',
    content:        { markdown: '' },
    created_by:     user.id,
  });

  if (verErr) return { error: humanizeError(verErr) };

  revalidatePath('/docs');
  return { success: true, document };
}

export async function updateDocument(id: string, formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = documentSchema.partial().safeParse(raw);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;
  const updateData: Record<string, unknown> = {};

  if (parsed.data.type        !== undefined) updateData.type        = parsed.data.type;
  if (parsed.data.title       !== undefined) updateData.title       = parsed.data.title;
  if (parsed.data.description !== undefined) updateData.description = parsed.data.description || null;
  if (parsed.data.tags        !== undefined) updateData.tags        = parseTags(parsed.data.tags);

  const { error } = await docs(supabase).update(updateData).eq('id', id);
  if (error) return { error: humanizeError(error) };

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

  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user } = auth;

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
    content:        content as Json,
    created_by:     user.id,
  });

  if (error) return { error: humanizeError(error) };

  revalidatePath('/docs');
  return { success: true, version_number: nextVersion };
}

export async function updateDocumentVersion(versionId: string, content: Record<string, unknown>) {
  if (typeof content !== 'object' || content === null || Array.isArray(content)) {
    return { error: 'Content must be an object' };
  }

  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const { error } = await vers(supabase)
    .update({ content: content as Json })
    .eq('id', versionId)
    .eq('status', 'draft');

  if (error) return { error: humanizeError(error) };

  revalidatePath('/docs');
  return { success: true };
}

export async function approveDocumentVersion(documentId: string, versionId: string) {
  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user } = auth;

  await vers(supabase)
    .update({ status: 'deprecated' })
    .eq('document_id', documentId)
    .eq('status', 'approved');

  const { error } = await vers(supabase)
    .update({ status: 'approved', approved_by: user.id })
    .eq('id', versionId);

  if (error) return { error: humanizeError(error) };

  revalidatePath('/docs');
  return { success: true };
}

export async function getDocuments() {
  const supabase = await createClient();
  const { data, error } = await docs(supabase)
    .select('*, document_versions(*)')
    .order('created_at', { ascending: false });

  if (error) throw new Error(humanizeError(error));
  // Each version's content is a jsonb column typed loosely as Json — assert the
  // object shape the view uses.
  return (data ?? []).map((row) => ({
    ...row,
    document_versions: row.document_versions.map((v) => ({
      ...v,
      content: (v.content ?? {}) as Record<string, unknown>,
    })),
  }));
}

export async function getDocument(id: string) {
  const supabase = await createClient();
  const { data, error } = await docs(supabase)
    .select('*, document_versions(*)')
    .eq(idColumn(id), id)
    .order('version_number', { referencedTable: 'document_versions', ascending: false })
    .single();

  if (error) throw new Error(humanizeError(error));
  return {
    ...data,
    document_versions: data.document_versions.map((v) => ({
      ...v,
      content: (v.content ?? {}) as Record<string, unknown>,
    })),
  };
}

export async function importDocxDocument(formData: FormData) {
  const file = formData.get('file') as File | null;
  if (!file || file.size === 0) return { error: 'No file selected' };
  if (!file.name.toLowerCase().endsWith('.docx')) return { error: 'File must be a .docx' };

  const raw = {
    type:        formData.get('type'),
    title:       formData.get('title'),
    description: formData.get('description') ?? undefined,
    tags:        formData.get('tags') ?? undefined,
  };

  const parsed = documentSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
  const mammoth = require('mammoth') as any;
  const { value: markdown } = await mammoth.convertToMarkdown({ buffer }) as { value: string };

  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user } = auth;

  const tags = parseTags(parsed.data.tags);

  const { data: document, error: docErr } = await docs(supabase)
    .insert({
      type:        parsed.data.type,
      title:       parsed.data.title,
      description: parsed.data.description || null,
      tags,
      created_by:  user.id,
    })
    .select()
    .single();

  if (docErr) return { error: humanizeError(docErr) };

  const { error: verErr } = await vers(supabase).insert({
    document_id:    document.id,
    version_number: 1,
    status:         'draft',
    content:        { markdown },
    created_by:     user.id,
  });

  if (verErr) return { error: humanizeError(verErr) };

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
