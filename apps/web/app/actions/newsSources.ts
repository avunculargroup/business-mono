'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { resolveFeedUrl } from '@platform/shared';
import { validateFeedUrl } from '@/lib/news/validateFeed';

const REVALIDATE = '/news/sources';

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  site_url: z.string().trim().url('Site URL must be a valid URL').optional().or(z.literal('')),
  feed_url: z.string().trim().url('Feed URL must be a valid URL').optional().or(z.literal('')),
  is_active: z.coerce.boolean().optional().default(true),
});

function parse(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  return schema.safeParse(raw);
}

export async function createNewsSource(formData: FormData) {
  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? 'Invalid input' };

  const input = parsed.data;
  const feedUrl = resolveFeedUrl(input.site_url || null, input.feed_url || null);
  if (!feedUrl) {
    return { error: 'Provide a feed URL (RSS/Atom), or a Substack site URL so the feed can be derived.' };
  }

  const feedCheck = await validateFeedUrl(feedUrl);
  if (!feedCheck.ok) return { error: feedCheck.error };

  const supabase = await createClient();
  const { error } = await supabase.from('news_sources').insert({
    name: input.name,
    site_url: input.site_url || null,
    feed_url: feedUrl,
    is_active: input.is_active,
  });

  if (error) return { error: error.message };
  revalidatePath(REVALIDATE);
  return { success: true };
}

export async function updateNewsSource(id: string, formData: FormData) {
  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? 'Invalid input' };

  const input = parsed.data;
  const feedUrl = resolveFeedUrl(input.site_url || null, input.feed_url || null);
  if (!feedUrl) {
    return { error: 'Provide a feed URL (RSS/Atom), or a Substack site URL so the feed can be derived.' };
  }

  const feedCheck = await validateFeedUrl(feedUrl);
  if (!feedCheck.ok) return { error: feedCheck.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from('news_sources')
    .update({
      name: input.name,
      site_url: input.site_url || null,
      feed_url: feedUrl,
      is_active: input.is_active,
    })
    .eq('id', id);

  if (error) return { error: error.message };
  revalidatePath(REVALIDATE);
  return { success: true };
}

export async function deleteNewsSource(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('news_sources').delete().eq('id', id);
  if (error) return { error: error.message };
  revalidatePath(REVALIDATE);
  return { success: true };
}

export async function toggleNewsSourceActive(id: string, isActive: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.from('news_sources').update({ is_active: isActive }).eq('id', id);
  if (error) return { error: error.message };
  revalidatePath(REVALIDATE);
  return { success: true };
}
