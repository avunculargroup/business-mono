import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { supabase } from '@platform/db';

export const supabaseQuery = createTool({
  id: 'supabase_query',
  description: 'Query a Supabase table with optional filters',
  inputSchema: z.object({
    table: z.string().describe('Table name'),
    select: z.string().default('*').describe('Columns to select'),
    filters: z.record(z.unknown()).optional().describe('Key-value filters'),
    limit: z.number().optional().describe('Max rows to return'),
    orderBy: z.string().optional().describe('Column to order by'),
    ascending: z.boolean().optional().describe('Sort ascending'),
  }),
  execute: async (context) => {
    let query = supabase.from(context.table as never).select(context.select);

    if (context.filters) {
      for (const [key, value] of Object.entries(context.filters)) {
        query = (query as unknown as { eq: (k: string, v: unknown) => typeof query }).eq(key, value) as typeof query;
      }
    }
    if (context.orderBy) {
      query = (query as unknown as { order: (col: string, opts: { ascending: boolean }) => typeof query })
        .order(context.orderBy, { ascending: context.ascending ?? false }) as typeof query;
    }
    if (context.limit) {
      query = (query as unknown as { limit: (n: number) => typeof query }).limit(context.limit) as typeof query;
    }

    const { data, error } = await query;
    if (error) throw new Error(`Query failed: ${error.message}`);
    return { rows: data ?? [] };
  },
});

export const supabaseInsert = createTool({
  id: 'supabase_insert',
  description: 'Insert a row into a Supabase table',
  inputSchema: z.object({
    table: z.string().describe('Table name'),
    record: z.record(z.unknown()).describe('Record to insert'),
  }),
  execute: async (context) => {
    const { data, error } = await supabase
      .from(context.table as never)
      .insert(context.record as never)
      .select()
      .single();

    if (error) throw new Error(`Insert failed: ${error.message}`);
    return { record: data };
  },
});

export const supabaseUpdate = createTool({
  id: 'supabase_update',
  description: 'Update rows in a Supabase table matching a filter',
  inputSchema: z.object({
    table: z.string().describe('Table name'),
    id: z.string().describe('Row ID to update'),
    updates: z.record(z.unknown()).describe('Fields to update'),
  }),
  execute: async (context) => {
    const { data, error } = await supabase
      .from(context.table as never)
      .update(context.updates as never)
      .eq('id', context.id)
      .select()
      .single();

    if (error) throw new Error(`Update failed: ${error.message}`);
    return { record: data };
  },
});
