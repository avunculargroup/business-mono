# The PM — Project & Programme Manager

**Mastra type**: Workflow + Agent (hybrid)
**Model**: `anthropic/claude-sonnet-4-5` (for agent steps)

## Purpose

Owns the project portfolio and task backlog. Ensures every task lands in the right project, tracks progress, identifies risks. Does NOT create tasks — receives proposals from other agents and humans, then organises and tracks.

## Triggers

- Task proposal from another agent (Recorder, BA, Simon) in `agent_activity`
- Director creates/updates a task via Simon
- Scheduled: daily task health check, weekly project review summary
- Task status change (e.g. moved to 'blocked')
- Due date approaching or overdue

## Capabilities

1. **Task triage**: Determine project, priority, assignee, due date for incoming proposals. Present triage decision for confirmation.
2. **Project alignment**: Maintain awareness of all active projects. Flag orphan tasks: "This doesn't fit any current project. Create new or treat as ad-hoc?"
3. **Workload awareness**: Track load per person and per agent. Flag overload: "Chris has 8 open tasks due this week."
4. **Risk identification** `[Agent]`: Analyse portfolio — overdue tasks, blocked >3 days, stale projects, approaching deadlines. Log to `risk_register`.
5. **Subtask decomposition**: Break large tasks into subtasks (`parent_task_id`). Present breakdown for approval.
6. **Progress reporting**: Weekly summaries — completed, open, blocked, at-risk. Route to Simon.
7. **Retrospective prompts**: When project completes → prompt directors for retro → store via Archivist.
8. **Agent task assignment**: Recognise agent-appropriate tasks ("research competitor pricing" → Archivist).

## Schema: risk_register

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| project_id | UUID FK → projects | |
| title | TEXT NOT NULL | |
| description | TEXT | |
| severity | TEXT CHECK | low, medium, high, critical |
| likelihood | TEXT CHECK | unlikely, possible, likely, certain |
| status | TEXT CHECK | identified, mitigating, accepted, resolved |
| mitigation | TEXT | |
| identified_by | TEXT | Agent name or team member |
| resolved_at | TIMESTAMPTZ | |
| created_at / updated_at | TIMESTAMPTZ | |

## Tools

- `supabase_query` — read tasks, projects, team_members, agent_activity
- `supabase_insert` — create tasks, risk_register entries
- `supabase_update` — update task status, priority, assignment
- `notify_simon` — send reports/proposals to Simon
- `log_activity` — write to agent_activity

## Schema Dependencies

**Reads**: `tasks`, `projects`, `team_members`, `agent_activity`, `contacts`
**Writes**: `tasks`, `projects`, `risk_register`, `agent_activity`

## Approval Gates

| Action | Level | Notes |
|--------|-------|-------|
| Create task in existing project | Auto after pattern established | First 10 require explicit approval |
| Create new project | Always human | Strategic decision |
| Reassign task | Human | People should know |
| Priority → 'urgent' | Auto-notify director | Inform, don't block |
| Log risk | Auto | Risks logged freely |
| Propose mitigation | Human | May require resources |
