import { supabase } from '../client.js';

export interface GraphTraverseResult {
  id: string;
  title: string;
  relationship: string;
  depth: number;
}

export async function graphTraverse(
  startItemId: string,
  options: {
    relationshipFilter?: string;
    maxDepth?: number;
  } = {}
): Promise<GraphTraverseResult[]> {
  const { relationshipFilter = null, maxDepth = 3 } = options;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)('graph_traverse', {
    start_item_id: startItemId,
    relationship_filter: relationshipFilter,
    max_depth: maxDepth,
  });

  if (error) throw new Error(`Graph traversal failed: ${error.message}`);
  return data ?? [];
}
