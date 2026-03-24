import { createTool } from '@mastra/core';
import { z } from 'zod';
import { supabase } from '@platform/db';
import { AgentActivityStatus } from '@platform/shared';

export const logActivity = createTool({
  id: 'log_activity',
  description: 'Log an agent action to the agent_activity audit trail',
  inputSchema: z.object({
    agentName: z.string().describe('Name of the agent logging the action'),
    action: z.string().describe('Description of the action taken'),
    status: z.enum(['pending', 'approved', 'rejected', 'auto']).default('auto'),
    triggerType: z.string().optional().describe('What triggered this action'),
    workflowRunId: z.string().optional(),
    entityType: z.string().optional().describe('Type of entity acted on'),
    entityId: z.string().optional().describe('ID of entity acted on'),
    proposedActions: z.array(z.record(z.unknown())).optional(),
    approvedActions: z.array(z.record(z.unknown())).optional(),
    notes: z.string().optional(),
  }),
  execute: async ({ context }) => {
    const { data, error } = await supabase
      .from('agent_activity')
      .insert({
        agent_name: context.agentName,
        action: context.action,
        status: context.status as AgentActivityStatus,
        trigger_type: context.triggerType ?? null,
        workflow_run_id: context.workflowRunId ?? null,
        entity_type: context.entityType ?? null,
        entity_id: context.entityId ?? null,
        proposed_actions: context.proposedActions ?? null,
        approved_actions: context.approvedActions ?? null,
        clarifications: null,
        notes: context.notes ?? null,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to log activity: ${error.message}`);
    return { activityId: (data as { id: string }).id };
  },
});
