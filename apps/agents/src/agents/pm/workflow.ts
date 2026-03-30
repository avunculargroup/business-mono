import { createWorkflow, createStep } from '@mastra/core';
import { z } from 'zod';
import { supabase } from '@platform/db';
import { petra } from './agent.js';

// ─── Step 1: Triage incoming task proposal ─────────────────────────────────
const triageTask = createStep({
  id: 'triage_task',
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
    title: z.string(),
    description: z.string().optional(),
    projectId: z.string().nullable(),
    assignee: z.string().nullable(),
    dueDate: z.string().nullable(),
    priority: z.string(),
    sourceActivityId: z.string().optional(),
    requiresApproval: z.boolean(),
  }),
  execute: async ({ inputData }) => {
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

Return JSON: { "project_id": "uuid or null", "assignee": "name or null", "due_date": "ISO date or null", "priority": "low|medium|high|urgent", "requires_approval": true|false }
requires_approval should be true only for the first 10 task creations in each project.`;

    const response = await petra.generate([{ role: 'user', content: prompt }]);
    let triage: Record<string, unknown> = {
      project_id: inputData.suggestedProjectId ?? null,
      assignee: inputData.suggestedAssignee ?? null,
      due_date: inputData.suggestedDueDate ?? null,
      priority: inputData.suggestedPriority ?? 'medium',
      requires_approval: true,
    };

    try {
      const jsonMatch = response.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) triage = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    } catch { /* use defaults */ }

    return {
      title: inputData.title,
      description: inputData.description,
      projectId: (triage['project_id'] as string) ?? null,
      assignee: (triage['assignee'] as string) ?? null,
      dueDate: (triage['due_date'] as string) ?? null,
      priority: (triage['priority'] as string) ?? 'medium',
      sourceActivityId: inputData.sourceActivityId,
      requiresApproval: (triage['requires_approval'] as boolean) ?? true,
    };
  },
});

// ─── Step 2: Create task record ─────────────────────────────────────────────
const createTask = createStep({
  id: 'create_task',
  inputSchema: z.object({
    title: z.string(),
    description: z.string().optional(),
    projectId: z.string().nullable(),
    assignee: z.string().nullable(),
    dueDate: z.string().nullable(),
    priority: z.string(),
    sourceActivityId: z.string().optional(),
    requiresApproval: z.boolean(),
  }),
  outputSchema: z.object({
    taskId: z.string(),
    title: z.string(),
    priority: z.string(),
  }),
  execute: async ({ inputData, suspend }) => {
    if (inputData.requiresApproval) {
      await suspend({ action: 'create_task', task: inputData });
    }

    const { data, error } = await supabase
      .from('tasks')
      .insert({
        title: inputData.title,
        description: inputData.description ?? null,
        project_id: inputData.projectId,
        assigned_to: inputData.assignee,
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
        agent_name: 'pm',
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
  execute: async (_) => {
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

Identify risks and return a JSON array of risk objects.`;

    const response = await petra.generate([{ role: 'user', content: prompt }]);
    let risks: Array<Record<string, unknown>> = [];

    try {
      const jsonMatch = response.text.match(/\[[\s\S]*\]/);
      if (jsonMatch) risks = JSON.parse(jsonMatch[0]) as Array<Record<string, unknown>>;
    } catch { /* no risks */ }

    // Save identified risks
    for (const risk of risks) {
      await supabase.from('risk_register').insert({
        title: risk['title'],
        description: risk['description'],
        severity: risk['severity'] ?? 'low',
        likelihood: risk['likelihood'] ?? 'possible',
        status: 'identified',
        mitigation: risk['mitigation'] ?? null,
        project_id: risk['project_id'] ?? null,
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
