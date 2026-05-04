import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { supabase } from '@platform/db';
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

// Synchronously invoke a specialist and return their reply text. Errors propagate
// to Simon's tool loop so the model can mention the failure rather than silently
// claiming delegation succeeded. The timeout prevents a stalled specialist from
// pinning the web UI on a forever-typing indicator.
const SPECIALIST_TIMEOUT_MS = 180_000;

type InFlightActivity = {
  action: string;
  ageSeconds: number;
};

// Look up which spans the specialist had open but not yet closed when we gave
// up on it. AgentActivitySpanProcessor writes an `in_progress` row on span
// start and a terminal row (`auto`/`error`) on span end, both with the same
// `spanId` in `notes`. An in-flight span is one whose start row exists but
// whose terminal row doesn't.
async function inFlightSpans(agentName: string, sinceMs: number): Promise<InFlightActivity[]> {
  const since = new Date(Date.now() - sinceMs).toISOString();
  const [startedRes, endedRes] = await Promise.all([
    supabase
      .from('agent_activity')
      .select('action, notes, created_at')
      .eq('agent_name', agentName)
      .eq('status', 'in_progress')
      .gte('created_at', since)
      .order('created_at', { ascending: false }),
    supabase
      .from('agent_activity')
      .select('notes')
      .eq('agent_name', agentName)
      .neq('status', 'in_progress')
      .gte('created_at', since),
  ]);

  const started = (startedRes.data ?? []) as Array<{
    action: string;
    notes: string | null;
    created_at: string;
  }>;
  if (!started.length) return [];

  const endedSpanIds = new Set<string>();
  for (const row of (endedRes.data ?? []) as Array<{ notes: string | null }>) {
    if (!row.notes) continue;
    try {
      const parsed = JSON.parse(row.notes) as { spanId?: string };
      if (parsed.spanId) endedSpanIds.add(parsed.spanId);
    } catch {
      // Malformed notes — skip. We'd rather drop a row than crash the timeout path.
    }
  }

  const now = Date.now();
  const out: InFlightActivity[] = [];
  for (const row of started) {
    if (!row.notes) continue;
    let parsed: { spanId?: string; spanType?: string };
    try {
      parsed = JSON.parse(row.notes) as { spanId?: string; spanType?: string };
    } catch {
      continue;
    }
    if (!parsed.spanId || endedSpanIds.has(parsed.spanId)) continue;
    // The agent's own AGENT_RUN being open is implicit from the timeout — only
    // the nested tool calls / workflow steps tell us where it actually stalled.
    if (parsed.spanType === 'agent_run') continue;
    out.push({
      action: row.action,
      ageSeconds: Math.round((now - new Date(row.created_at).getTime()) / 1000),
    });
  }
  return out;
}

async function runSpecialist(agent: Agent, prompt: string): Promise<{ reply: string }> {
  const startMs = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Specialist ${agent.name} timed out after ${SPECIALIST_TIMEOUT_MS / 1000}s`)),
      SPECIALIST_TIMEOUT_MS,
    );
  });
  try {
    const result = await Promise.race([
      agent.generate([{ role: 'user', content: prompt }]),
      timeout,
    ]);
    return { reply: result.text };
  } catch (err) {
    if (err instanceof Error && /timed out/i.test(err.message)) {
      // Pad the lookup window slightly so spans started just before the timer
      // fired aren't missed. Failures here are non-fatal — we'd rather throw
      // the original opaque timeout than swallow it.
      const inFlight = await inFlightSpans(agent.name, Date.now() - startMs + 5_000).catch(
        () => [] as InFlightActivity[],
      );
      if (inFlight.length) {
        const summary = inFlight
          .slice(0, 3)
          .map((s) => `${s.action} (running ${s.ageSeconds}s)`)
          .join('; ');
        throw new Error(`${err.message}. Last in-flight: ${summary}`);
      }
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export const delegateToCharlie = createTool({
  id: 'delegate_to_charlie',
  description:
    'Delegate a content-drafting task to Charlie (Content Creator). Use for emails, ' +
    'newsletters, LinkedIn/Twitter, blog posts. Pass the directive verbatim plus any ' +
    'context (audience, tone). For revisions, include the prior contentItemId so Charlie ' +
    'updates the existing draft. Returns Charlie\'s reply, which includes a contentItemId ' +
    'and excerpt to quote back to the director.',
  inputSchema: z.object({
    directive: z.string().min(1).describe('Full instruction for Charlie'),
    contentItemId: z.string().uuid().optional().describe('Existing draft to revise in place'),
  }),
  execute: async (context) => {
    const prompt = context.contentItemId
      ? `${context.directive}\n\n(Revision — pass contentItemId ${context.contentItemId} to persist_content_draft so the existing row is updated.)`
      : context.directive;
    return runSpecialist(charlie as unknown as Agent, prompt);
  },
});

export const delegateToRex = createTool({
  id: 'delegate_to_rex',
  description:
    'Delegate web research, fact verification, URL ingestion, or contact/company briefings ' +
    'to Rex (Researcher). Pass a ResearchBrief-shaped directive (purpose, subject, context).',
  inputSchema: z.object({
    directive: z.string().min(1).describe('Research brief or directive for Rex'),
  }),
  execute: async (context) => runSpecialist(rex as unknown as Agent, context.directive),
});

export const delegateToArchie = createTool({
  id: 'delegate_to_archie',
  description:
    'Delegate knowledge-base work to Archie (Archivist) — saving URLs, embedding research, ' +
    'or answering questions from the knowledge base.',
  inputSchema: z.object({
    directive: z.string().min(1).describe('Instruction for Archie'),
  }),
  execute: async (context) => runSpecialist(archie as unknown as Agent, context.directive),
});

export const delegateToPetra = createTool({
  id: 'delegate_to_petra',
  description:
    'Delegate to Petra (PM) for risk reasoning or portfolio status. Note: task creation ' +
    'goes through the PM workflow (recorder → pm listener), not direct delegation.',
  inputSchema: z.object({
    directive: z.string().min(1).describe('Instruction for Petra'),
  }),
  execute: async (context) => runSpecialist(petra as unknown as Agent, context.directive),
});

export const delegateToBruno = createTool({
  id: 'delegate_to_bruno',
  description:
    'Delegate requirements gathering or clarification loops to Bruno (BA).',
  inputSchema: z.object({
    directive: z.string().min(1).describe('Instruction for Bruno'),
  }),
  execute: async (context) => runSpecialist(bruno as unknown as Agent, context.directive),
});

export const delegateToDella = createTool({
  id: 'delegate_to_della',
  description:
    'Delegate CRM hygiene, contact assessments, or pipeline advice to Della ' +
    '(Relationship Manager).',
  inputSchema: z.object({
    directive: z.string().min(1).describe('Instruction for Della'),
  }),
  execute: async (context) => runSpecialist(della as unknown as Agent, context.directive),
});

export const delegateToRoger = createTool({
  id: 'delegate_to_roger',
  description:
    'Delegate transcript reasoning (speaker ID, entity extraction) to Roger (Recorder). ' +
    'Most recording flows are triggered by webhooks, not by you — only call this for ' +
    'follow-up reasoning over an existing transcript.',
  inputSchema: z.object({
    directive: z.string().min(1).describe('Instruction for Roger'),
  }),
  execute: async (context) => runSpecialist(roger as unknown as Agent, context.directive),
});

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
