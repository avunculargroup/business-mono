import { createTool } from '@mastra/core';
import { z } from 'zod';
import { supabase } from '@platform/db';

export const brandLookup = createTool({
  id: 'brand_lookup',
  description: 'Fetch brand guidelines from brand_assets table',
  inputSchema: z.object({
    type: z.string().optional().describe('Filter by asset type (e.g. tone_of_voice, style_guide, template)'),
  }),
  execute: async ({ context }) => {
    let query = supabase.from('brand_assets').select('name, type, content');

    if (context.type) {
      query = query.eq('type', context.type) as typeof query;
    }

    const { data, error } = await query;
    if (error) throw new Error(`Failed to fetch brand assets: ${error.message}`);
    return { assets: data ?? [] };
  },
});
