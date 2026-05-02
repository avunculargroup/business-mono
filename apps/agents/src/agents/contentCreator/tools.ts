import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { supabase } from '@platform/db';

export const brandLookup = createTool({
  id: 'brand_lookup',
  description: 'Fetch brand guidelines from brand_assets table',
  inputSchema: z.object({
    type: z.string().optional().describe('Filter by asset type (e.g. tone_of_voice, style_guide, template)'),
  }),
  execute: async (context) => {
    let query = supabase.from('brand_assets').select('name, type, content');

    if (context.type) {
      query = query.eq('type', context.type) as typeof query;
    }

    const { data, error } = await query;
    if (error) throw new Error(`Failed to fetch brand assets: ${error.message}`);
    return { assets: data ?? [] };
  },
});

export const persistContentDraft = createTool({
  id: 'persist_content_draft',
  description:
    'Persist a finished draft to content_items. Call this exactly once per completed draft, before producing the <content_output> block. For revisions, pass contentItemId to update the existing row in place.',
  inputSchema: z.object({
    title: z.string().min(1).max(200).describe('Concise descriptive title for the draft'),
    body: z.string().min(1).describe('Full draft body'),
    type: z
      .enum(['email', 'newsletter', 'linkedin', 'twitter_x', 'blog'])
      .default('email')
      .describe('Content channel/format'),
    contentItemId: z
      .string()
      .uuid()
      .optional()
      .describe('Existing draft ID — pass when revising to update in place'),
  }),
  execute: async (context) => {
    if (context.contentItemId) {
      const { data, error } = await supabase
        .from('content_items')
        .update({ body: context.body, updated_at: new Date().toISOString() })
        .eq('id', context.contentItemId)
        .select('id, title')
        .single();

      if (error) throw new Error(`Failed to update content_items: ${error.message}`);
      return {
        contentItemId: data.id,
        title: data.title,
        excerpt: context.body.slice(0, 240),
      };
    }

    const { data, error } = await supabase
      .from('content_items')
      .insert({
        title: context.title,
        body: context.body,
        type: context.type ?? 'email',
        status: 'draft',
        source: 'content_agent',
      })
      .select('id, title')
      .single();

    if (error) throw new Error(`Failed to insert content_items: ${error.message}`);
    return {
      contentItemId: data.id,
      title: data.title,
      excerpt: context.body.slice(0, 240),
    };
  },
});
