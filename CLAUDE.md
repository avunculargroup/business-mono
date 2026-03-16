# CLAUDE.md — Agent Platform Architecture

This is the internal business platform for Bitcoin Treasury Solutions. Two co-founders, pre-revenue, building an AI-powered operations platform.

## Monorepo Structure

```
├── apps/
│   ├── agents/          # Mastra AI agent server (Railway)
│   └── web/             # Next.js frontend (Vercel) — future
├── packages/
│   ├── db/              # Supabase client, types, migrations, RPC functions
│   └── shared/          # Shared types, constants, utilities
├── docs/
│   ├── agents/          # Individual agent specifications
│   ├── schema-changes.md  # Changelog: what changed from original schema and why
│   └── webhooks.md
├── schema.sql           # Consolidated database schema (source of truth)
├── CLAUDE.md            # This file (auto-read by Claude Code)
├── pnpm-workspace.yaml
└── turbo.json
```

**Package manager**: pnpm workspaces
**Build orchestration**: Turborepo
**Deploy**: `apps/agents` → Railway, `apps/web` → Vercel

### Package naming

- `@platform/db` — database client, generated types, migration SQL, Supabase RPC wrappers
- `@platform/shared` — shared TypeScript types, constants, enums, utility functions
- `@platform/agents` — Mastra agent server (not consumed by other packages)
- `@platform/web` — Next.js frontend (not consumed by other packages)

### Import rules

- `apps/agents` imports from `@platform/db` and `@platform/shared`
- `apps/web` imports from `@platform/db` and `@platform/shared`
- `packages/db` imports from `@platform/shared`
- `packages/shared` imports from nothing (leaf package)
- `apps/*` never import from each other

## Tech Stack

- **Frontend**: Next.js (`apps/web`) → Vercel
- **Agent Server**: Mastra AI (`apps/agents`) → Railway — TypeScript, ES2022 modules
- **Database**: Supabase (Postgres + pgvector + RLS)
- **Communication**: Signal CLI (Simon's dedicated number)
- **Phone Recording**: Telnyx Voice API (dual-channel, auto-record)
- **Video Recording**: Zoom webhooks (recording-ready events)
- **Transcription**: Deepgram Nova-3 (callback/webhook pattern, multichannel)
- **Embeddings**: OpenAI text-embedding-3-small (1536 dimensions)
- **Models**: `anthropic/claude-sonnet-4-5` for all agents

### TypeScript config (all packages)

Mastra requires ES2022 modules. All packages extend `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true
  }
}
```

## Architecture: Hub-and-Spoke

Simon is the central coordinator. All other agents are specialists. Directors interact ONLY with Simon via Signal (future: also via `apps/web`). Specialists never message humans directly.

```
Directors (Signal / Web UI) <-> Simon <-> Specialist Agents
                                              |
                                      Supabase (shared DB)
```

### Inter-agent communication rules

1. **Via Simon**: Simon dispatches work to specialists and relays results to directors. Default path.
2. **Via database events**: Some agent outputs trigger other agents implicitly (e.g. Recorder proposes tasks → PM picks them up from `agent_activity`).
3. **Read-only knowledge queries**: Any agent can query the Archivist's knowledge base directly without going through Simon. Only direct cross-agent call allowed.

### Capacity awareness

Simon maintains awareness of what the platform can and cannot do. Before routing any directive, Simon checks for capacity gaps across four dimensions: no agent for the task, missing tool on an existing agent, workload overload on the assignee, or broken capability chain across multiple agents. When a gap is found, Simon surfaces what CAN be done, what CANNOT, and recommends alternatives (manual workaround, defer, or build new capability). Gaps are logged to `capacity_gaps` table — patterns of recurring gaps tell the directors what to build next. Simon includes unresolved gaps in the morning briefing and proactively suggests new capabilities when gap patterns emerge. See `docs/agents/simon.md` for full spec.

## Agent Roster

| Agent | Mastra Type | Spec | Primary Domain |
|-------|-------------|------|----------------|
| Simon | Agent | `docs/agents/simon.md` | Orchestration, Signal interface, conflict detection, capacity awareness |
| Recorder | Workflow + Agent | `docs/agents/recorder.md` | Transcription, entity extraction, CRM sync |
| Archivist | Agent | `docs/agents/archivist.md` | Knowledge management, hybrid search |
| PM | Workflow + Agent | `docs/agents/pm.md` | Projects, tasks, risk tracking |
| BA | Agent | `docs/agents/ba.md` | Requirements analysis, clarification loops |
| Content Creator | Agent | `docs/agents/content-creator.md` | Content drafting, iteration, brand consistency |

### Agent vs Workflow decision

- **Agent**: Open-ended tasks requiring judgment. Simon, Archivist, BA, Content Creator.
- **Workflow**: Deterministic pipelines with known steps. Recorder's transcription pipeline, PM's task triage.
- **Hybrid** (Workflow + Agent): Core process is a workflow, but specific steps use agent reasoning.

## Approval Philosophy

Every agent starts with maximum guardrails. Approval workflows graduate:
1. **One-at-a-time** → human confirms each action
2. **Batch approval** → human confirms a set of proposed actions
3. **Autonomous** → agent acts, human is notified after

Read-only operations are always auto-approved.
Write operations start as human-confirmed and graduate based on track record.
Emails and public content are ALWAYS human-approved (no graduation).

## Database (`packages/db`)

The consolidated schema is in `schema.sql` at the repo root — this is the **source of truth**. Run it fresh on a new Supabase project to create all tables, indexes, RLS policies, and views. `docs/schema-changes.md` is a changelog explaining what changed from the original schema and why (kept for reference, not for execution).

Key principles:

- All agents log to `agent_activity` — this is the audit trail
- Use `source` columns to identify which agent created a record
- `extracted_data` JSONB fields follow shapes documented in agent specs
- RLS: authenticated team members can read/write everything (two-person team)
- Supabase client initialised in `packages/db/src/client.ts`, imported by both apps
- Generated types from Supabase CLI: `packages/db/src/types/database.ts`
- RPC functions (graph traversal, semantic search): `packages/db/src/rpc/`
- Simon's capacity check uses `platform_capabilities` and `capacity_gaps` tables

### Type generation

```bash
pnpm --filter @platform/db generate-types
```

## Webhook Endpoints

All specs in `docs/webhooks.md`. The Mastra server (`apps/agents`) on Railway exposes:
- `/webhooks/telnyx` — phone call recordings
- `/webhooks/zoom` — video call recordings
- `/webhooks/deepgram` — completed transcriptions

## Knowledge Layer

Three complementary query strategies (all within Supabase, wrapped as RPC in `packages/db`):
1. **pgvector**: Semantic similarity (HNSW on VECTOR(1536))
2. **Recursive CTEs**: Graph traversal on `knowledge_connections`
3. **Postgres FTS**: tsvector/tsquery on `knowledge_items.raw_content`

Future: pgRouting for path queries. SQL/PGQ when it lands in stable Postgres.

## Naming Conventions

- **Packages**: `@platform/{name}`
- **Agent names in code**: camelCase (`simon`, `recorder`, `contentCreator`)
- **Tool names**: snake_case (`supabase_query`, `deepgram_transcribe`)
- **Webhook routes**: `/webhooks/{service}`
- **Database tables**: snake_case, plural (`knowledge_items`)
- **TypeScript files**: camelCase for modules, PascalCase for components/classes
- **Env vars**: SCREAMING_SNAKE_CASE, prefixed by service (`TELNYX_API_KEY`)

## Shared Types (`packages/shared`)

Types used by both `apps/agents` and `apps/web` live in `packages/shared`. Do NOT duplicate types between apps.

## Key Files

- `schema.sql` — consolidated database schema (source of truth, run on fresh Supabase)
- `docs/schema-changes.md` — changelog: what changed from original schema and why
- `docs/webhooks.md` — webhook endpoint specs, payloads, authentication
- `docs/agents/*.md` — individual agent specifications
- `packages/db/src/types/database.ts` — generated Supabase types
- `packages/db/src/client.ts` — Supabase client initialisation
- `packages/db/src/rpc/` — RPC wrappers for vector search, graph traversal
- `packages/shared/src/types.ts` — shared TypeScript types and enums
