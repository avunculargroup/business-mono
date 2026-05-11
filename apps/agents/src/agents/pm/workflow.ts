import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { supabase } from '@platform/db';
import { petra } from './agent.js';

// Schemas Petra returns via structuredOutput. Replaces the previous pattern
// of asking for JSON in the prompt and regex-extracting it from response.text.
const triageDecisionSchema = z.object({
  project_id: z.string().nullable(),
  assignee: z.string().nullable(),
  due_date: z.string().nullable(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  requires_approval: z.boolean(),
});

const riskSchema = z.object({
  title: z.string(),
  description: z.string(),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  likelihood: z.enum(['unlikely', 'possible', 'likely', 'certain']),
  mitigation: z.string().nullable(),
  project_id: z.string().nullable(),
});

// ─── Step 1: Triage incoming task proposal ─────────────────────────────────
const triageInputSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  sourceActivityId: z.string().optional(),
  suggestedProjectId: z.string().optional(),
  suggestedAssignee: z.string().optional(),
  suggestedDueDate: z.string().optional(),
  suggestedPriority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
});

const triageOutputSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  projectId: z.string().nullable(),
  assignee: z.string().nullable(),
  dueDate: z.string().nullable(),
  priority: z.string(),
  sourceActivityId: z.string().optional(),
  requiresApproval: z.boolean(),
});

type TriageInput = z.infer<typeof triageInputSchema>;

const triageTask = createStep({
  id: 'triage_task',
  inputSchema: triageInputSchema,
  outputSchema: triageOutputSchema,
  execute: async (params) => {
    const inputData = params.inputData as TriageInput;
    // Fetch open projects for context
    const { data: projects } = await supabase
      .from('projects')
      .select('id, name, status')
      .eq('status', 'active');

    const prompt = `You are a PM triaging a new task proposal. Determine the best project, assignee, priority, and due date.

Task: ${inputData.title}
Description: ${inputData.description ?? 'None'}
Suggested project: ${inputData.suggestedProjectId ?? 'None'}
Suggested assignee: ${inputData.suggestedAssignee ?? 'None'}
Suggested due date: ${inputData.suggestedDueDate ?? 'None'}
Suggested priority: ${inputData.suggestedPriority ?? 'None'}

Active projects: ${JSON.stringify(projects)}

requires_approval should be true only for the first 10 task creations in each project.`;

    const triageFallback: z.infer<typeof triageDecisionSchema> = {
      project_id: inputData.suggestedProjectId ?? null,
      assignee: inputData.suggestedAssignee ?? null,
      due_date: inputData.suggestedDueDate ?? null,
      priority: inputData.suggestedPriority ?? 'medium',
      requires_approval: true,
    };

    const response = await petra.generate(
      [{ role: 'user', content: prompt }],
      {
        structuredOutput: {
          schema: triageDecisionSchema,
          errorStrategy: 'fallback',
          fallbackValue: triageFallback,
        },
      },
    );

    const triage = response.object ?? triageFallback;

    return {
      title: inputData.title,
      description: inputData.description,
      projectId: triage.project_id,
      assignee: triage.assignee,
      dueDate: triage.due_date,
      priority: triage.priority,
      sourceActivityId: inputData.sourceActivityId,
      requiresApproval: triage.requires_approval,
    };
  },
});

// ─── Step 2: Create task record ─────────────────────────────────────────────
const createTaskInputSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  projectId: z.string().nullable(),
  assignee: z.string().nullable(),
  dueDate: z.string().nullable(),
  priority: z.string(),
  sourceActivityId: z.string().optional(),
  requiresApproval: z.boolean(),
});

type CreateTaskInput = z.infer<typeof createTaskInputSchema>;

const createTask = createStep({
  id: 'create_task',
  inputSchema: createTaskInputSchema,
  outputSchema: z.object({
    taskId: z.string(),
    title: z.string(),
    priority: z.string(),
  }),
  execute: async (params) => {
    const inputData = params.inputData as CreateTaskInput;
    const suspend = params.suspend;
    if (inputData.requiresApproval) {
      await suspend({ action: 'create_task', task: inputData });
    }

    let assignedToId: string | null = null;
    if (inputData.assignee) {
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (UUID_RE.test(inputData.assignee)) {
        assignedToId = inputData.assignee;
      } else {
        const { data: member } = await supabase
          .from('team_members')
          .select('id')
          .ilike('full_name', inputData.assignee)
          .limit(1)
          .maybeSingle();
        assignedToId = (member as { id: string } | null)?.id ?? null;
      }
    }

    const { data, error } = await supabase
      .from('tasks')
      .insert({
        title: inputData.title,
        description: inputData.description ?? null,
        project_id: inputData.projectId,
        assigned_to: assignedToId,
        due_date: inputData.dueDate,
        priority: inputData.priority,
        status: 'todo',
        source: 'pm_agent',
        source_activity_id: inputData.sourceActivityId ?? null,
      } as never)
      .select()
      .single();

    if (error) throw new Error(`Failed to create task: ${error.message}`);
    const taskId = (data as { id: string }).id;

    // Flag urgent tasks to Simon
    if (inputData.priority === 'urgent') {
      await supabase.from('agent_activity').insert({
        agent_name: 'petra',
        action: `Urgent task created: ${inputData.title}`,
        status: 'auto',
        entity_type: 'task',
        entity_id: taskId,
      } as never);
    }

    return { taskId, title: inputData.title, priority: inputData.priority };
  },
});

// ─── Step 3: Risk scan ───────────────────────────────────────────────────────
const riskScan = createStep({
  id: 'risk_scan',
  inputSchema: z.object({
    taskId: z.string(),
    title: z.string(),
    priority: z.string(),
  }),
  outputSchema: z.object({
    done: z.boolean(),
    risksFound: z.number(),
  }),
  execute: async () => {
    // Fetch all open tasks and projects for risk analysis
    const { data: tasks } = await supabase
      .from('v_open_tasks')
      .select('*')
      .limit(100);

    const { data: projects } = await supabase
      .from('projects')
      .select('id, name, status, target_date')
      .eq('status', 'active');

    const prompt = `Analyse this task portfolio for risks. Today is ${new Date().toISOString().split('T')[0]}.

Open tasks: ${JSON.stringify(tasks)}
Active projects: ${JSON.stringify(projects)}

Identify risks across the categories in your system prompt.`;

    const response = await petra.generate(
      [{ role: 'user', content: prompt }],
      {
        structuredOutput: {
          schema: z.array(riskSchema),
          errorStrategy: 'fallback',
          fallbackValue: [],
        },
      },
    );

    const risks = response.object ?? [];

    // Save identified risks
    for (const risk of risks) {
      await supabase.from('risk_register').insert({
        title: risk.title,
        description: risk.description,
        severity: risk.severity,
        likelihood: risk.likelihood,
        status: 'identified',
        mitigation: risk.mitigation,
        project_id: risk.project_id,
      } as never);
    }

    return { done: true, risksFound: risks.length };
  },
});

// ─── Assemble workflow ───────────────────────────────────────────────────────
export const pmWorkflow = createWorkflow({
  id: 'pm',
  inputSchema: z.object({
    title: z.string(),
    description: z.string().optional(),
    sourceActivityId: z.string().optional(),
    suggestedProjectId: z.string().optional(),
    suggestedAssignee: z.string().optional(),
    suggestedDueDate: z.string().optional(),
    suggestedPriority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  }),
  outputSchema: z.object({
    done: z.boolean(),
    risksFound: z.number(),
  }),
})
  .then(triageTask)
  .then(createTask)
  .then(riskScan)
  .commit();
