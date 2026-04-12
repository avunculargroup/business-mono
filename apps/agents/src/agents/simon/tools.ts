import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { supabase } from '@platform/db';
import type { Json } from '@platform/db';
import { CapacityGapType, AGENT_REGISTRY } from '@platform/shared';
import { archie } from '../archivist/index.js';
import { bruno } from '../ba/index.js';
import { charlie } from '../contentCreator/index.js';
import { rex } from '../researcher/index.js';
import { della } from '../relationshipManager/index.js';
import { roger } from '../recorder/agent.js';
import { petra } from '../pm/agent.js';
import type { Agent } from '@mastra/core/agent';

export const conflictCheck = createTool({
  id: 'conflict_check',
  description: 'Check if any in-flight workflows from the other director are touching the same entity',
  inputSchema: z.object({
    entityType: z.string().describe('Type of entity (e.g. contact, company, project)'),
    entityId: z.string().describe('ID of the entity'),
  }),
  execute: async (context) => {
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
  execute: async (context) => {
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
  execute: async (context) => {
    const { data, error } = await supabase
      .from('capacity_gaps')
      .insert({
        gap_type: context.gapType as CapacityGapType,
        directive_summary: context.directive ?? context.description,
        details: context.description ?? null,
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
    agentName: z.enum(['roger', 'archie', 'petra', 'bruno', 'charlie', 'rex']),
    message: z.string().describe('Instruction or context to send to the specialist'),
    additionalContext: z.record(z.unknown()).optional().describe('Additional structured context'),
  }),
  execute: async (ctx) => {
    // Log the dispatch to agent_activity
    const { data, error } = await supabase
      .from('agent_activity')
      .insert({
        agent_name: 'simon',
        action: `Dispatch to ${ctx.agentName}: ${ctx.message}`,
        status: 'auto',
        trigger_type: 'manual',
        workflow_run_id: null,
        entity_type: null,
        entity_id: null,
        proposed_actions: [{ agent: ctx.agentName, message: ctx.message, context: ctx.additionalContext ?? null }] as Json,
        approved_actions: null,
        clarifications: null,
        notes: null,
      })
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
  execute: async (context) => {
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
  execute: async (context) => {
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
  execute: async (context) => {
    // Placeholder — integrate with Brave Search API or similar
    return {
      results: [],
      note: `Web search for "${context.query}" — integrate search API to enable`,
    };
  },
});

// Map agent names to their Agent instances (excluding simon — he runs the check)
const specialistAgents: Record<string, Agent> = {
  roger: roger as unknown as Agent,
  archie: archie as unknown as Agent,
  petra: petra as unknown as Agent,
  bruno: bruno as unknown as Agent,
  charlie: charlie as unknown as Agent,
  rex: rex as unknown as Agent,
  della: della as unknown as Agent,
};

export const agentHealthCheck = createTool({
  id: 'agent_health_check',
  description:
    'Check the health and recent activity of all agents. Returns last activity timestamps, error counts, and recent error messages. Use deep: true to also ping each agent for a liveness check (slower).',
  inputSchema: z.object({
    deep: z
      .boolean()
      .optional()
      .default(false)
      .describe('Run liveness pings on each specialist agent (slower but thorough)'),
  }),
  execute: async (context) => {
    const agentNames = Object.keys(AGENT_REGISTRY);
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    // Step 1: Query recent activity per agent
    const activityResults = await Promise.all(
      agentNames.map(async (name) => {
        // Last activity
        const { data: lastRow } = await supabase
          .from('agent_activity')
          .select('created_at, action, status')
          .eq('agent_name', name)
          .order('created_at', { ascending: false })
          .limit(1);

        // Actions and errors in last 24h
        const { count: totalActions } = await supabase
          .from('agent_activity')
          .select('*', { count: 'exact', head: true })
          .eq('agent_name', name)
          .gte('created_at', twentyFourHoursAgo);

        const { count: errorCount } = await supabase
          .from('agent_activity')
          .select('*', { count: 'exact', head: true })
          .eq('agent_name', name)
          .eq('status', 'error')
          .gte('created_at', twentyFourHoursAgo);

        // Recent error messages (last 3 within 24h)
        const { data: recentErrors } = await supabase
          .from('agent_activity')
          .select('action, created_at')
          .eq('agent_name', name)
          .eq('status', 'error')
          .gte('created_at', twentyFourHoursAgo)
          .order('created_at', { ascending: false })
          .limit(3);

        const lastActivity = lastRow?.[0]?.created_at ?? null;
        const errors24h = errorCount ?? 0;
        const actions24h = totalActions ?? 0;

        // Classify status
        let status: 'active' | 'idle' | 'silent' | 'error-prone';
        if (errors24h > 3) {
          status = 'error-prone';
        } else if (!lastActivity) {
          status = 'silent';
        } else {
          const lastTime = new Date(lastActivity).getTime();
          const hourAgo = now.getTime() - 60 * 60 * 1000;
          const dayAgo = now.getTime() - 24 * 60 * 60 * 1000;
          if (lastTime >= hourAgo) {
            status = 'active';
          } else if (lastTime >= dayAgo) {
            status = 'idle';
          } else {
            status = 'silent';
          }
        }

        const registry = AGENT_REGISTRY[name]!;

        return {
          name,
          displayName: registry.displayName,
          role: registry.role,
          status,
          lastActivity,
          actions24h,
          errors24h,
          recentErrors: (recentErrors ?? []).map((e) => ({
            message: (e as { action: string }).action,
            at: (e as { created_at: string }).created_at,
          })),
        };
      }),
    );

    // Step 2: Liveness pings (only when deep: true)
    let livenessResults: Record<string, { alive: boolean; responseMs: number; error?: string }> | null =
      null;

    if (context.deep) {
      const PING_TIMEOUT_MS = 30_000;

      const pingResults = await Promise.allSettled(
        Object.entries(specialistAgents).map(async ([name, agent]) => {
          const start = Date.now();
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Timed out after 30s')), PING_TIMEOUT_MS),
          );
          const generatePromise = agent.generate([
            { role: 'user', content: 'Health check: respond with OK and nothing else.' },
          ]);

          await Promise.race([generatePromise, timeoutPromise]);
          return { name, responseMs: Date.now() - start };
        }),
      );

      livenessResults = {};
      for (const result of pingResults) {
        if (result.status === 'fulfilled') {
          livenessResults[result.value.name] = {
            alive: true,
            responseMs: result.value.responseMs,
          };
        } else {
          // Extract agent name from the error — Promise.allSettled loses the name on rejection
          // We match by index since the order is preserved
          const entries = Object.keys(specialistAgents);
          const idx = pingResults.indexOf(result);
          const agentName = entries[idx] ?? 'unknown';
          livenessResults[agentName] = {
            alive: false,
            responseMs: -1,
            error: String(result.reason),
          };
        }
      }
    }

    return {
      checkedAt: now.toISOString(),
      mode: context.deep ? 'deep' : 'quick',
      agents: activityResults,
      liveness: livenessResults,
    };
  },
});
