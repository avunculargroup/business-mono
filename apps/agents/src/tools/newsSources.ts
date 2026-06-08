import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { supabase } from '@platform/db';
import { resolveFeedUrl } from '@platform/shared';
import { validateFeed } from '../lib/validateFeed.js';

export const manageNewsSources = createTool({
  id: 'manage_news_sources',
  description:
    'Manage the list of sources scanned for content. Three source types: ' +
    '"rss" (article publications, the default), "podcast" (audio feeds whose episodes are transcribed and embedded), ' +
    'and "youtube" (a channel/playlist). ' +
    'Actions: "list" all sources, "add" a source, "set_active" to enable/disable, "remove" a source. ' +
    'For rss/podcast pass feed_url (or a Substack site_url so the feed is derived). For youtube pass youtube_channel_url. ' +
    'Podcasts and youtube sources accept transcript settings; transcribe_with_deepgram is the paid fallback and is OFF unless explicitly enabled.',
  inputSchema: z.object({
    action: z.enum(['list', 'add', 'set_active', 'remove']),
    name: z.string().optional().describe('Display name — required for add, e.g. "What Bitcoin Did"'),
    source_type: z
      .enum(['rss', 'podcast', 'youtube'])
      .optional()
      .describe('Source type for add — "rss" (default), "podcast", or "youtube".'),
    site_url: z.string().optional().describe('Homepage URL. For Substack, the feed is derived as <site>/feed when feed_url is omitted.'),
    feed_url: z.string().optional().describe('Direct RSS/Atom (rss) or podcast (podcast) feed URL. Not used for youtube.'),
    youtube_channel_url: z
      .string()
      .optional()
      .describe('Channel/playlist URL — required for youtube; optional for podcast (aids the YouTube transcript fallback).'),
    transcribe_with_deepgram: z
      .boolean()
      .optional()
      .describe('Podcast/youtube only. Paid per-minute Deepgram transcription used only when no free transcript exists. Default false.'),
    preferred_transcript_lang: z
      .string()
      .optional()
      .describe('Podcast/youtube only. Preferred transcript language (default "en").'),
    max_backfill_episodes: z
      .number()
      .optional()
      .describe('Podcast/youtube only. Cap on episodes ingested on first fetch (default 25).'),
    max_episode_age_days: z
      .number()
      .optional()
      .describe('Podcast/youtube only. Skip Deepgram on episodes older than this (no cap by default).'),
    id: z.string().optional().describe('news_sources row id — required for set_active and remove'),
    is_active: z.boolean().optional().describe('Desired active state — required for set_active'),
  }),
  execute: async (ctx) => {
    if (ctx.action === 'list') {
      const { data, error } = await supabase
        .from('news_sources')
        .select(
          'id, name, source_type, site_url, feed_url, youtube_channel_url, transcribe_with_deepgram, ' +
            'preferred_transcript_lang, max_backfill_episodes, max_episode_age_days, is_active, ' +
            'last_scanned_at, last_status, last_error',
        )
        .order('name', { ascending: true });
      if (error) throw new Error(`Failed to list news sources: ${error.message}`);
      return { sources: data ?? [] };
    }

    if (ctx.action === 'add') {
      if (!ctx.name?.trim()) return { error: 'name is required to add a source.' };
      const sourceType = ctx.source_type ?? 'rss';

      // youtube sources have no RSS feed; rss/podcast require one.
      let feedUrl: string | null = null;
      if (sourceType === 'youtube') {
        if (!ctx.youtube_channel_url?.trim()) {
          return { error: 'youtube_channel_url is required for a youtube source.' };
        }
      } else {
        feedUrl = resolveFeedUrl(ctx.site_url, ctx.feed_url);
        if (!feedUrl) {
          return { error: 'Provide feed_url (RSS/Atom URL), or a Substack site_url so the feed can be derived.' };
        }
        // Validate RSS only — podcast feeds vary and the ingest routine is tolerant.
        if (sourceType === 'rss') {
          const validation = await validateFeed(feedUrl);
          if (!validation.ok) {
            return { error: `Could not read an RSS/Atom feed at ${feedUrl} (${validation.error}). The source was not added.` };
          }
        }
      }

      const insert: Record<string, unknown> = {
        name: ctx.name.trim(),
        source_type: sourceType,
        site_url: ctx.site_url?.trim() || null,
        feed_url: feedUrl,
        youtube_channel_url: ctx.youtube_channel_url?.trim() || null,
        is_active: true,
      };
      if (sourceType !== 'rss') {
        insert.transcribe_with_deepgram = ctx.transcribe_with_deepgram ?? false;
        if (ctx.preferred_transcript_lang) insert.preferred_transcript_lang = ctx.preferred_transcript_lang;
        if (typeof ctx.max_backfill_episodes === 'number') insert.max_backfill_episodes = ctx.max_backfill_episodes;
        if (typeof ctx.max_episode_age_days === 'number') insert.max_episode_age_days = ctx.max_episode_age_days;
      }

      const { data, error } = await supabase
        .from('news_sources')
        .insert(insert as never)
        .select('id')
        .single();
      if (error) throw new Error(`Failed to add news source: ${error.message}`);
      return { id: (data as { id: string }).id, source_type: sourceType, feed_url: feedUrl };
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
