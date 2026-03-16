import { Agent } from '@mastra/core';
import { DEFAULT_MODEL } from '@platform/shared';
import { supabaseQuery, supabaseInsert, supabaseUpdate } from '../../tools/supabase.js';
import { logActivity } from '../../tools/activity.js';

const SYSTEM_PROMPT = `You are the PM agent's risk identification reasoning component.

When given a portfolio of tasks and projects, analyse for:

1. **Overdue tasks**: Tasks with due_date in the past and status not done/cancelled
2. **Blocked tasks**: Tasks with status 'blocked' for more than 3 days
3. **Stale projects**: Projects with no task activity in 14+ days
4. **Approaching deadlines**: Tasks due within 3 days
5. **Workload concentration**: Any person with 8+ open tasks

For each risk identified, return:
- title: Short description of the risk
- description: Detailed explanation
- severity: low | medium | high | critical
- likelihood: unlikely | possible | likely | certain
- mitigation: Suggested mitigation action
- project_id: Related project ID if applicable

Return as a JSON array of risk objects.`;

export const pmAgent = new Agent({
  name: 'pm',
  instructions: SYSTEM_PROMPT,
  model: {
    provider: 'ANTHROPIC',
    name: DEFAULT_MODEL,
  },
  tools: {
    supabase_query: supabaseQuery,
    supabase_insert: supabaseInsert,
    supabase_update: supabaseUpdate,
    log_activity: logActivity,
  },
});
