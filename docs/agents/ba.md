# The BA — Business Analyst

**Mastra type**: Agent
**Model**: `anthropic/claude-sonnet-4-5`

## Purpose

Takes vague or broad directives and turns them into structured, actionable requirements. The quality gate between "idea" and "committed work." Asks "what exactly do you mean by that?" before anyone builds the wrong thing.

## Triggers

- Simon routes a new initiative or feature request
- PM flags a task lacking sufficient detail
- Director explicitly requests: "flesh out the requirements for X"
- New project creation triggers automatic BA review

## Capabilities

1. **Requirement elicitation** `[Agent]`: Analyse input, identify gaps (who is the user? success criteria? constraints?). Generate clarifying questions.
2. **Clarification rounds**: Route questions to directors via Simon. Accept natural language answers. Iteratively refine. Typically 1–3 rounds.
3. **Requirements structuring**: Produce user stories, acceptance criteria, scope boundaries, assumptions, dependencies. Store in `requirements` table.
4. **Company profile check**: Cross-reference against brand and positioning. Flag misalignment.
5. **Knowledge base consultation**: Query Archivist's hybrid search for precedents and research. Include references.
6. **Task decomposition proposal**: Once requirements are clear, propose task breakdown to PM.
7. **Scope creep detection**: If requirement keeps growing, flag: "This has grown significantly. Split into phases?"

## Clarification Loop (Mastra suspend/resume)

1. BA receives input from Simon or PM
2. BA analyses input, generates clarifying questions
3. **Workflow suspends** — questions sent to Simon for relay
4. Director responds via Signal
5. Simon resumes BA workflow with answers
6. BA incorporates, checks if more clarification needed
7. If yes → repeat from step 2 (max 3 rounds, then best-effort output)
8. If no → produce structured requirements, route to PM

## Schema: requirements

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| project_id | UUID FK → projects | May be null for exploratory work |
| task_id | UUID FK → tasks | Originating task if applicable |
| title | TEXT NOT NULL | |
| description | TEXT | |
| user_stories | JSONB | `Array<{ as_a, i_want, so_that }>` |
| acceptance_criteria | JSONB | Array of testable criteria |
| assumptions | TEXT[] | |
| constraints | TEXT[] | |
| out_of_scope | TEXT[] | |
| dependencies | JSONB | `Array<{ type, description, reference_id? }>` |
| status | TEXT CHECK | draft, in_clarification, reviewed, approved, superseded |
| clarification_rounds | JSONB | `Array<{ questions, answers, round_number, timestamp }>` |
| created_by_agent | TEXT | Always 'ba_agent' |
| approved_by | UUID FK → team_members | |
| created_at / updated_at | TIMESTAMPTZ | |

## Tools

- `supabase_query` — read tasks, projects, brand_assets, knowledge search
- `supabase_insert` — create requirements
- `supabase_update` — update requirement status
- `vector_search` — query Archivist knowledge base (read-only, direct)
- `graph_traverse` — traverse knowledge connections (read-only, direct)
- `notify_simon` — send questions/results to Simon
- `log_activity` — write to agent_activity

## Schema Dependencies

**Reads**: `tasks`, `projects`, `brand_assets`, `knowledge_items`, `knowledge_connections`
**Writes**: `requirements`, `agent_activity`
