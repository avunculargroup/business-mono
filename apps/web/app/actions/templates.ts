'use server';

import type { Json } from '@platform/db';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { humanizeError } from '@/lib/errors';
import { idColumn } from '@/lib/utils';

const tmpl = (supabase: Awaited<ReturnType<typeof createClient>>) =>
  supabase.from('mvp_templates');

const ver = (supabase: Awaited<ReturnType<typeof createClient>>) =>
  supabase.from('mvp_template_versions');

const templateSchema = z.object({
  type:        z.enum(['one_pager', 'briefing_deck']),
  title:       z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  tags:        z.string().optional(), // JSON array string from form
});

const versionSchema = z.object({
  content: z.string().min(1, 'Content is required'), // JSON string
});

export async function createTemplate(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = templateSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const tags = parseTags(parsed.data.tags);

  const { data: template, error: tmplErr } = await tmpl(supabase)
    .insert({
      type:        parsed.data.type,
      title:       parsed.data.title,
      description: parsed.data.description || null,
      tags,
      created_by:  user?.id ?? null,
    })
    .select()
    .single();

  if (tmplErr) return { error: humanizeError(tmplErr) };

  // Create initial draft version with empty content
  const initialContent = parsed.data.type === 'one_pager'
    ? ONE_PAGER_TEMPLATE
    : BRIEFING_DECK_TEMPLATE;

  const { error: verErr } = await ver(supabase).insert({
    template_id:    template.id,
    version_number: 1,
    status:         'draft',
    content:        initialContent,
    created_by:     user?.id ?? null,
  });

  if (verErr) return { error: humanizeError(verErr) };

  revalidatePath('/discovery/templates');
  return { success: true, template };
}

export async function updateTemplate(id: string, formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = templateSchema.partial().safeParse(raw);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const supabase = await createClient();
  const updateData: Record<string, unknown> = {};

  if (parsed.data.title       !== undefined) updateData.title       = parsed.data.title;
  if (parsed.data.description !== undefined) updateData.description = parsed.data.description || null;
  if (parsed.data.tags        !== undefined) updateData.tags        = parseTags(parsed.data.tags);

  const { error } = await tmpl(supabase).update(updateData).eq('id', id);
  if (error) return { error: humanizeError(error) };

  revalidatePath('/discovery/templates');
  return { success: true };
}

export async function createTemplateVersion(templateId: string, formData: FormData) {
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

  // Get current max version
  const { data: versions } = await ver(supabase)
    .select('version_number')
    .eq('template_id', templateId)
    .order('version_number', { ascending: false })
    .limit(1);

  const nextVersion = ((versions?.[0]?.version_number as number) ?? 0) + 1;

  const { error } = await ver(supabase).insert({
    template_id:    templateId,
    version_number: nextVersion,
    status:         'draft',
    content:        content as Json,
    created_by:     user?.id ?? null,
  });

  if (error) return { error: humanizeError(error) };

  revalidatePath('/discovery/templates');
  return { success: true, version_number: nextVersion };
}

export async function updateTemplateVersion(versionId: string, content: Record<string, unknown>) {
  if (typeof content !== 'object' || content === null || Array.isArray(content)) {
    return { error: 'Content must be an object' };
  }

  const supabase = await createClient();

  const { error } = await ver(supabase)
    .update({ content: content as Json })
    .eq('id', versionId)
    .eq('status', 'draft');

  if (error) return { error: humanizeError(error) };

  revalidatePath('/discovery/templates');
  return { success: true };
}

export async function approveTemplateVersion(templateId: string, versionId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Deprecate any currently approved version for this template
  await ver(supabase)
    .update({ status: 'deprecated' })
    .eq('template_id', templateId)
    .eq('status', 'approved');

  const { error } = await ver(supabase)
    .update({ status: 'approved', approved_by: user?.id ?? null })
    .eq('id', versionId);

  if (error) return { error: humanizeError(error) };

  revalidatePath('/discovery/templates');
  return { success: true };
}

export async function getTemplates() {
  const supabase = await createClient();
  const { data, error } = await tmpl(supabase)
    .select('*, mvp_template_versions(*)')
    .order('created_at', { ascending: false });

  if (error) throw new Error(humanizeError(error));
  // tags is a nullable text[] (normalise null → []); each version's content is a
  // jsonb column typed loosely as Json — assert the object shape the view uses.
  return (data ?? []).map((row) => ({
    ...row,
    tags: row.tags ?? [],
    mvp_template_versions: row.mvp_template_versions.map((v) => ({
      ...v,
      content: (v.content ?? {}) as Record<string, unknown>,
    })),
  }));
}

export async function getTemplate(id: string) {
  const supabase = await createClient();
  const { data, error } = await tmpl(supabase)
    .select('*, mvp_template_versions(*)')
    .eq(idColumn(id), id)
    .order('version_number', { referencedTable: 'mvp_template_versions', ascending: false })
    .single();

  if (error) throw new Error(humanizeError(error));
  return {
    ...data,
    tags: data.tags ?? [],
    mvp_template_versions: data.mvp_template_versions.map((v) => ({
      ...v,
      content: (v.content ?? {}) as Record<string, unknown>,
    })),
  };
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

// Default content for new templates

const ONE_PAGER_TEMPLATE = {
  sections: [
    { id: 'header',    title: 'Header',            content: 'Title · Author · Date · Status' },
    { id: 'problem',   title: 'Problem Statement', content: 'Describe the customer pain point. Include one data point as evidence.' },
    { id: 'solution',  title: 'Proposed Solution', content: 'High-level description of the product or service. Limit to 2–3 sentences.' },
    { id: 'impact',    title: 'Impact & Metrics',  content: 'Quantify expected impact with numbers (e.g. reduce cost by X%, save Y hours).' },
    { id: 'effort',    title: 'Effort & Timeline', content: 'Estimate effort and timeline. List dependencies and risks.' },
    { id: 'proof',     title: 'Proof & Social Evidence', content: 'Include customer quotes or testimonials. Link to feedback repository.' },
    { id: 'cta',       title: 'Call to Action',    content: 'Define the ask. Ensure clear next steps.' },
  ],
};

const BRIEFING_DECK_TEMPLATE = {
  slides: [
    { id: 'title',      title: 'Title slide',          content: 'Company name · Presenter · Date' },
    { id: 'agenda',     title: 'Agenda',                content: 'Overview of session structure (2–3 bullets).' },
    { id: 'problem',    title: 'The Problem',           content: 'State the customer pain point clearly. Back it with one data point.' },
    { id: 'pain',       title: 'Why it matters',        content: 'Cost of inaction. Quantify the pain.' },
    { id: 'solution',   title: 'Our Solution',          content: 'High-level description. One visual or diagram.' },
    { id: 'benefits',   title: 'Key Benefits',          content: '3\u20135 benefits aligned to the audience\u2019s priorities.' },
    { id: 'proof',      title: 'Proof of Competence',   content: 'Testimonials, pilot results, or relevant credentials.' },
    { id: 'plan',       title: 'Implementation Plan',   content: 'Phased approach. Timeline. Who does what.' },
    { id: 'next_steps', title: 'Next Steps',            content: 'Clear ask. Date for follow-up. Contact info.' },
  ],
};
