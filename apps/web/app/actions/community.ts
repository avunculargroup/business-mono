'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cw = (supabase: Awaited<ReturnType<typeof createClient>>) =>
  (supabase as any).from('community_watchlist');

const communitySchema = z.object({
  type:              z.enum(['linkedin_group', 'association', 'conference']),
  name:              z.string().min(1, 'Name is required'),
  url:               z.string().optional(),
  description:       z.string().optional(),
  role_tags:         z.string().optional(),   // JSON array
  industry_tags:     z.string().optional(),   // JSON array
  membership_size:   z.coerce.number().int().positive().optional().or(z.literal('')),
  activity_level:    z.coerce.number().int().min(1).max(5).optional().or(z.literal('')),
  location:          z.string().optional(),
  start_date:        z.string().optional(),
  end_date:          z.string().optional(),
  timezone:          z.string().optional(),
  engagement_status: z.enum(['not_joined', 'joined', 'attended', 'sponsor']).default('not_joined'),
  notes:             z.string().optional(),
});

function parseTags(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t) => typeof t === 'string' && t.trim()) : [];
  } catch {
    return raw.split(',').map((t) => t.trim()).filter(Boolean);
  }
}

export async function getCommunityEntries(filters?: {
  type?: string;
  engagement_status?: string;
  role_tag?: string;
  industry_tag?: string;
}) {
  const supabase = await createClient();
  let query = cw(supabase)
    .select('*')
    .is('deleted_at', null)
    .order('start_date', { ascending: true, nullsFirst: false });

  if (filters?.type)              query = query.eq('type', filters.type);
  if (filters?.engagement_status) query = query.eq('engagement_status', filters.engagement_status);
  if (filters?.role_tag)          query = query.contains('role_tags', [filters.role_tag]);
  if (filters?.industry_tag)      query = query.contains('industry_tags', [filters.industry_tag]);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createCommunityEntry(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = communitySchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const supabase = await createClient();
  const d = parsed.data;

  const { error } = await cw(supabase).insert({
    type:              d.type,
    name:              d.name,
    url:               d.url               || null,
    description:       d.description       || null,
    role_tags:         parseTags(d.role_tags),
    industry_tags:     parseTags(d.industry_tags),
    membership_size:   d.membership_size   === '' || d.membership_size === undefined ? null : Number(d.membership_size),
    activity_level:    d.activity_level    === '' || d.activity_level  === undefined ? null : Number(d.activity_level),
    location:          d.location          || null,
    start_date:        d.start_date        || null,
    end_date:          d.end_date          || null,
    timezone:          d.timezone          || null,
    engagement_status: d.engagement_status,
    notes:             d.notes             || null,
  });

  if (error) return { error: error.message };
  revalidatePath('/crm/community');
  return { success: true };
}

export async function updateCommunityEntry(id: string, formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = communitySchema.partial().safeParse(raw);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const supabase = await createClient();
  const updateData: Record<string, unknown> = {};
  const d = parsed.data;

  if (d.type              !== undefined) updateData.type              = d.type;
  if (d.name              !== undefined) updateData.name              = d.name;
  if (d.url               !== undefined) updateData.url               = d.url               || null;
  if (d.description       !== undefined) updateData.description       = d.description       || null;
  if (d.role_tags         !== undefined) updateData.role_tags         = parseTags(d.role_tags);
  if (d.industry_tags     !== undefined) updateData.industry_tags     = parseTags(d.industry_tags);
  if (d.membership_size   !== undefined) updateData.membership_size   = d.membership_size   === '' ? null : Number(d.membership_size);
  if (d.activity_level    !== undefined) updateData.activity_level    = d.activity_level    === '' ? null : Number(d.activity_level);
  if (d.location          !== undefined) updateData.location          = d.location          || null;
  if (d.start_date        !== undefined) updateData.start_date        = d.start_date        || null;
  if (d.end_date          !== undefined) updateData.end_date          = d.end_date          || null;
  if (d.timezone          !== undefined) updateData.timezone          = d.timezone          || null;
  if (d.engagement_status !== undefined) updateData.engagement_status = d.engagement_status;
  if (d.notes             !== undefined) updateData.notes             = d.notes             || null;

  const { error } = await cw(supabase).update(updateData).eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/crm/community');
  return { success: true };
}

export async function deleteCommunityEntry(id: string) {
  const supabase = await createClient();
  const { error } = await cw(supabase).update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/crm/community');
  return { success: true };
}
