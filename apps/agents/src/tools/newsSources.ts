import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { supabase } from '@platform/db';
import { resolveFeedUrl } from '@platform/shared';

export const manageNewsSources = createTool({
  id: 'manage_news_sources',
  description:
    'Manage the list of news sources (publications) scanned for new articles. ' +
    'Actions: "list" all sources, "add" a source, "set_active" to enable/disable, "remove" a source. ' +
    'Each source is scanned via its RSS/Atom feed. For Substack blogs, pass site_url and the feed is derived as <site>/feed; ' +
    'for other publications, pass feed_url (the direct RSS/Atom URL).',
  inputSchema: z.object({
    action: z.enum(['list', 'add', 'set_active', 'remove']),
    name: z.string().optional().describe('Display name — required for add, e.g. "Bitcoin Magazine"'),
    site_url: z.string().optional().describe('Homepage URL. For Substack, the feed is derived as <site>/feed when feed_url is omitted.'),
    feed_url: z.string().optional().describe('Direct RSS/Atom feed URL. Required when adding a non-Substack source.'),
    id: z.string().optional().describe('news_sources row id — required for set_active and remove'),
    is_active: z.boolean().optional().describe('Desired active state — required for set_active'),
  }),
  execute: async (ctx) => {
    if (ctx.action === 'list') {
      const { data, error } = await supabase
        .from('news_sources')
        .select('id, name, site_url, feed_url, is_active, last_scanned_at, last_status, last_error')
        .order('name', { ascending: true });
      if (error) throw new Error(`Failed to list news sources: ${error.message}`);
      return { sources: data ?? [] };
    }

    if (ctx.action === 'add') {
      if (!ctx.name?.trim()) return { error: 'name is required to add a source.' };
      const feedUrl = resolveFeedUrl(ctx.site_url, ctx.feed_url);
      if (!feedUrl) {
        return { error: 'Provide feed_url (RSS/Atom URL), or a Substack site_url so the feed can be derived.' };
      }
      const { data, error } = await supabase
        .from('news_sources')
        .insert({
          name: ctx.name.trim(),
          site_url: ctx.site_url?.trim() || null,
          feed_url: feedUrl,
          is_active: true,
        } as never)
        .select('id')
        .single();
      if (error) throw new Error(`Failed to add news source: ${error.message}`);
      return { id: (data as { id: string }).id, feed_url: feedUrl };
    }

    if (ctx.action === 'set_active') {
      if (!ctx.id) return { error: 'id is required to change active state.' };
      if (typeof ctx.is_active !== 'boolean') return { error: 'is_active (true/false) is required.' };
      const { error } = await supabase
        .from('news_sources')
        .update({ is_active: ctx.is_active } as never)
        .eq('id', ctx.id);
      if (error) throw new Error(`Failed to update news source: ${error.message}`);
      return { id: ctx.id, is_active: ctx.is_active };
    }

    // remove
    if (!ctx.id) return { error: 'id is required to remove a source.' };
    const { error } = await supabase.from('news_sources').delete().eq('id', ctx.id);
    if (error) throw new Error(`Failed to remove news source: ${error.message}`);
    return { id: ctx.id, removed: true };
  },
});
