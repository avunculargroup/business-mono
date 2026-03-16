import { createTool } from '@mastra/core';
import { z } from 'zod';
import { supabase } from '@platform/db';
import { CapacityGapType } from '@platform/shared';

export const conflictCheck = createTool({
  id: 'conflict_check',
  description: 'Check if any in-flight workflows from the other director are touching the same entity',
  inputSchema: z.object({
    entityType: z.string().describe('Type of entity (e.g. contact, company, project)'),
    entityId: z.string().describe('ID of the entity'),
  }),
  execute: async ({ context }) => {
    const { data, error } = await supabase
      .from('agent_activity')
      .select('id, agent_name, action, created_at')
      .eq('entity_type', context.entityType)
      .eq('entity_id', context.entityId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) throw new Error(`Conflict check failed: ${error.message}`);
    const conflicts = data ?? [];
    return { hasConflict: conflicts.length > 0, conflicts };
  },
});

export const capacityCheck = createTool({
  id: 'capacity_check',
  description: 'Check if the platform has the capability to handle a directive',
  inputSchema: z.object({
    directive: z.string().describe('The directive to check'),
    agentName: z.string().optional().describe('Specific agent to check workload for'),
  }),
  execute: async ({ context }) => {
    // Fetch active capabilities
    const { data: capabilities } = await supabase
      .from('platform_capabilities')
      .select('agent_name, capability, status, phase, tools_required')
      .eq('status', 'active');

    // Check open task count if agent specified (workload check)
    let workloadOverloaded = false;
    if (context.agentName) {
      const { count } = await supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('assigned_to', context.agentName)
        .not('status', 'in', '("done","cancelled")');

      workloadOverloaded = (count ?? 0) >= 8;
    }

    return {
      capabilities: capabilities ?? [],
      workloadOverloaded,
    };
  },
});

export const logCapacityGap = createTool({
  id: 'log_capacity_gap',
  description: 'Log a capability gap when Simon cannot fulfil a directive',
  inputSchema: z.object({
    gapType: z.enum(['no_agent', 'missing_tool', 'workload', 'broken_chain']),
    description: z.string().describe('What gap was found'),
    directive: z.string().optional().describe('The original directive that exposed the gap'),
    agentName: z.string().optional().describe('Agent involved in the gap'),
  }),
  execute: async ({ context }) => {
    const { data, error } = await supabase
      .from('capacity_gaps')
      .insert({
        gap_type: context.gapType as CapacityGapType,
        description: context.description,
        directive: context.directive ?? null,
        agent_name: context.agentName ?? null,
        resolved: false,
      } as never)
      .select()
      .single();

    if (error) throw new Error(`Failed to log capacity gap: ${error.message}`);
    return { gapId: (data as { id: string }).id };
  },
});

export const notifySpecialist = createTool({
  id: 'notify_specialist',
  description: 'Dispatch a task or context to a specialist agent',
  inputSchema: z.object({
    agentName: z.enum(['recorder', 'archivist', 'pm', 'ba', 'content_creator']),
    message: z.string().describe('Instruction or context to send to the specialist'),
    context: z.record(z.unknown()).optional().describe('Additional structured context'),
  }),
  execute: async ({ context: ctx }) => {
    // Log the dispatch to agent_activity
    const { data, error } = await supabase
      .from('agent_activity')
      .insert({
        agent_name: 'simon',
        action: `Dispatch to ${ctx.agentName}: ${ctx.message}`,
        status: 'auto',
        trigger_type: 'signal_message',
        proposed_actions: [{ agent: ctx.agentName, message: ctx.message, context: ctx.context }],
      } as never)
      .select()
      .single();

    if (error) throw new Error(`Failed to notify specialist: ${error.message}`);
    return { dispatched: true, activityId: (data as { id: string }).id };
  },
});

export const emailDraft = createTool({
  id: 'email_draft',
  description: 'Draft an email for human review before sending',
  inputSchema: z.object({
    to: z.string().describe('Recipient email address'),
    subject: z.string().describe('Email subject'),
    body: z.string().describe('Email body (plain text or HTML)'),
    replyToInteractionId: z.string().optional().describe('Interaction ID this email relates to'),
  }),
  execute: async ({ context }) => {
    // Save draft to content_items for approval
    const { data, error } = await supabase
      .from('content_items')
      .insert({
        title: context.subject,
        type: 'email',
        status: 'review',
        body: `To: ${context.to}\n\n${context.body}`,
      } as never)
      .select()
      .single();

    if (error) throw new Error(`Failed to save email draft: ${error.message}`);
    return {
      draftId: (data as { id: string }).id,
      requiresApproval: true,
      message: 'Email draft saved — awaiting director approval before send',
    };
  },
});

export const createReminder = createTool({
  id: 'create_reminder',
  description: 'Create a reminder to fire at a specific time',
  inputSchema: z.object({
    body: z.string().describe('Reminder message'),
    remindAt: z.string().describe('ISO 8601 datetime when reminder should fire'),
    contactId: z.string().optional().describe('Contact this reminder relates to'),
    taskId: z.string().optional().describe('Task this reminder relates to'),
  }),
  execute: async ({ context }) => {
    const { data, error } = await supabase
      .from('reminders')
      .insert({
        body: context.body,
        remind_at: context.remindAt,
        status: 'pending',
        contact_id: context.contactId ?? null,
        task_id: context.taskId ?? null,
      } as never)
      .select()
      .single();

    if (error) throw new Error(`Failed to create reminder: ${error.message}`);
    return { reminderId: (data as { id: string }).id };
  },
});

export const webSearch = createTool({
  id: 'web_search',
  description: 'Perform a lightweight web search',
  inputSchema: z.object({
    query: z.string().describe('Search query'),
  }),
  execute: async ({ context }) => {
    // Placeholder — integrate with Brave Search API or similar
    return {
      results: [],
      note: `Web search for "${context.query}" — integrate search API to enable`,
    };
  },
});
