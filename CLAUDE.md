# CLAUDE.md — Agent Platform Architecture

This is the internal business platform for Bitcoin Treasury Solutions (BTS) — a Bitcoin education, consulting, and treasury implementation company. Two co-founders, pre-revenue, building an AI-powered operations platform.

## Monorepo Structure

```
├── apps/
│   ├── agents/          # Mastra AI agents server (Railway)
│   └── web/             # Next.js frontend (Vercel) — future
├── packages/
│   ├── db/              # Supabase client, types, migrations, RPC functions
│   ├── shared/          # Shared types, constants, utilities
│   └── signal/          # TypeScript client for signal-cli REST API sidecar
├── infra/
│   └── signal-cli/      # Docker config for signal-cli sidecar (not in pnpm workspace)
├── docs/
│   ├── agents/          # Individual agent specifications
│   ├── brand-voice.md   # Brand voice, tone, terminology, Bitcoin stance (content source of truth)
│   ├── design-brief.md  # UI design system — colours, typography, components, tokens, IA (web source of truth)
│   ├── schema-changes.md  # Changelog: what changed from original schema and why
│   └── webhooks.md
├── schema.sql           # Consolidated database schema (source of truth)
├── CLAUDE.md            # This file — architecture, routing, conventions
├── pnpm-workspace.yaml
└── turbo.json
```

**Package manager**: pnpm workspaces
**Build orchestration**: Turborepo
**Deploy**: `apps/agents` → Railway, `apps/web` → Vercel

### Package naming

- `@platform/db` — database client, generated types, migration SQL, Supabase RPC wrappers
- `@platform/shared` — shared TypeScript types, constants, enums, utility functions
- `@platform/signal` — typed HTTP client for signal-cli REST API sidecar
- `@platform/agents` — Mastra agent server (not consumed by other packages)
- `@platform/web` — Next.js frontend (not consumed by other packages)

### Import rules

- `apps/agents` imports from `@platform/db`, `@platform/shared`, and `@platform/signal`
- `apps/web` imports from `@platform/db` and `@platform/shared` (NOT `@platform/signal`)
- `packages/db` imports from `@platform/shared`
- `packages/shared` imports from nothing (leaf package)
- `apps/*` never import from each other

-----

## Tech Stack

- **Frontend**: Next.js (`apps/web`) → Vercel
- **Agent Server**: Mastra AI (`apps/agents`) → Railway — TypeScript, ES2022 modules
- **Database**: Supabase (Postgres + pgvector + RLS)
- **Communication**: Signal CLI (Simon’s dedicated number)
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

-----

## Architecture: Hub-and-Spoke

Simon is the central coordinator. All other agents are specialists. Directors interact ONLY with Simon via Signal (future: also via `apps/web`). Specialists never message humans directly.

```
Directors (Signal / Web UI) <-> Simon <-> Specialist Agents
                                              |
                                      Supabase (shared DB)
```

### Inter-agent communication rules

1. **Via Simon**: Simon dispatches work to specialists and relays results to directors. Default path.
1. **Via database events**: Some agent outputs trigger other agents implicitly (e.g. Recorder proposes tasks → PM picks them up from `agent_activity`).
1. **Read-only knowledge queries**: Any agent can query the Archivist’s knowledge base directly without going through Simon. Only direct cross-agent call allowed.

### Capacity awareness

Simon maintains awareness of what the platform can and cannot do. Before routing any directive, Simon checks for capacity gaps across four dimensions: no agent for the task, missing tool on an existing agent, workload overload on the assignee, or broken capability chain across multiple agents. When a gap is found, Simon surfaces what CAN be done, what CANNOT, and recommends alternatives (manual workaround, defer, or build new capability). Gaps are logged to `capacity_gaps` table — patterns of recurring gaps tell the directors what to build next. Simon includes unresolved gaps in the morning briefing and proactively suggests new capabilities when gap patterns emerge. See `docs/agents/simon.md` for full spec.

-----

## Agent Roster

|Agent          |Mastra Type     |Spec                            |Primary Domain                                                         |
|---------------|----------------|--------------------------------|-----------------------------------------------------------------------|
|Simon          |Agent           |`docs/agents/simon.md`          |Orchestration, Signal interface, conflict detection, capacity awareness|
|Recorder       |Workflow + Agent|`docs/agents/recorder.md`       |Transcription, entity extraction, CRM sync                             |
|Archivist      |Agent           |`docs/agents/archivist.md`      |Knowledge management, hybrid search                                    |
|PM             |Workflow + Agent|`docs/agents/pm.md`             |Projects, tasks, risk tracking                                         |
|BA             |Agent           |`docs/agents/ba.md`             |Requirements analysis, clarification loops                             |
|Content Creator|Agent           |`docs/agents/content-creator.md`|Content drafting, iteration, brand consistency                         |
|Researcher     |Agent           |`docs/agents/researcher-agent-spec.md`|Web research, fact verification, URL ingestion, topic monitoring|
|Della (RM)     |Agent           |`docs/agents/relationship-manager.md` |CRM management, customer understanding, relationship health, pipeline advice|

### Agent vs Workflow decision

- **Agent**: Open-ended tasks requiring judgment. Simon, Archivist, BA, Content Creator, Researcher, Relationship Manager (Della).
- **Workflow**: Deterministic pipelines with known steps. Recorder’s transcription pipeline, PM’s task triage.
- **Hybrid** (Workflow + Agent): Core process is a workflow, but specific steps use agent reasoning.

-----

## Approval Philosophy

Every agent starts with maximum guardrails. Approval workflows graduate:

1. **One-at-a-time** → human confirms each action
1. **Batch approval** → human confirms a set of proposed actions
1. **Autonomous** → agent acts, human is notified after

Read-only operations are always auto-approved.
Write operations start as human-confirmed and graduate based on track record.
Emails and public content are ALWAYS human-approved (no graduation).

-----

## Database (`packages/db`)

Schema changes are managed via the **Supabase CLI migration workflow**. Migration files in `supabase/migrations/` are the **execution source of truth** and are applied automatically on push to `main` via `.github/workflows/migrate.yml`. `schema.sql` at the repo root is a human-readable consolidated reference only — do not execute it directly against a live database. `docs/schema-changes.md` is a changelog explaining what changed and why. See `packages/db/MIGRATIONS.md` for the full developer workflow (how to create and apply new migrations).

Key principles:

- All agents log to `agent_activity` — this is the audit trail
- Use `source` columns to identify which agent created a record
- `extracted_data` JSONB fields follow shapes documented in agent specs
- RLS: authenticated team members can read/write everything (two-person team)
- Supabase client initialised in `packages/db/src/client.ts`, imported by both apps
- Generated types from Supabase CLI: `packages/db/src/types/database.ts`
- RPC functions (graph traversal, semantic search): `packages/db/src/rpc/`
- Simon’s capacity check uses `platform_capabilities` and `capacity_gaps` tables

### Type generation

```bash
pnpm --filter @platform/db generate-types
```

-----

## Webhook Endpoints

All specs in `docs/webhooks.md`. The Mastra server (`apps/agents`) on Railway exposes:

- `/webhooks/telnyx` — phone call recordings
- `/webhooks/zoom` — video call recordings
- `/webhooks/deepgram` — completed transcriptions

-----

## Knowledge Layer

Three complementary query strategies (all within Supabase, wrapped as RPC in `packages/db`):

1. **pgvector**: Semantic similarity (HNSW on VECTOR(1536))
1. **Recursive CTEs**: Graph traversal on `knowledge_connections`
1. **Postgres FTS**: tsvector/tsquery on `knowledge_items.raw_content`

Future: pgRouting for path queries. SQL/PGQ when it lands in stable Postgres.

-----

## Naming Conventions

- **Packages**: `@platform/{name}`
- **Agent names in code**: camelCase (`simon`, `recorder`, `contentCreator`)
- **Tool names**: snake_case (`supabase_query`, `deepgram_transcribe`)
- **Webhook routes**: `/webhooks/{service}`
- **Database tables**: snake_case, plural (`knowledge_items`)
- **TypeScript files**: camelCase for modules, PascalCase for components/classes
- **Env vars**: SCREAMING_SNAKE_CASE, prefixed by service (`TELNYX_API_KEY`)
- **Railway internal URLs**: `http://{service-name}.railway.internal:{port}`

-----

## Shared Types (`packages/shared`)

Types used by both `apps/agents` and `apps/web` live in `packages/shared`. Do NOT duplicate types between apps.

-----

## Key Files

|File                               |Purpose                                                                                                        |
|-----------------------------------|---------------------------------------------------------------------------------------------------------------|
|`schema.sql`                       |Consolidated database schema — human-readable reference only (not executable; use `supabase/migrations/`)      |
|`supabase/migrations/`             |Migration files — applied sequentially to the live DB via `supabase db push` (auto on push to `main`)          |
|`packages/db/MIGRATIONS.md`       |Developer workflow — how to create and apply schema migrations                                                 |
|`CLAUDE.md`                        |This file — architecture, routing, naming conventions                                                          |
|`docs/design-brief.md`             |**Web UI source of truth** — colours, typography, spacing, components, CSS tokens, IA, accessibility           |
|`docs/brand-voice.md`              |**Content source of truth** — tone, terminology, Bitcoin stance, banned words, content lengths, microcopy rules|
|`docs/schema-changes.md`           |Schema changelog — what changed from original and why (reference, not executable)                              |
|`docs/webhooks.md`                 |Webhook endpoint specs, payloads, authentication                                                               |
|`docs/agents/*.md`                 |Individual agent specifications                                                                                |
|`packages/db/src/types/database.ts`|Generated Supabase types                                                                                       |
|`packages/db/src/client.ts`        |Supabase client initialisation                                                                                 |
|`packages/db/src/rpc/`             |RPC wrappers for vector search, graph traversal                                                                |
|`packages/shared/src/types.ts`     |Shared TypeScript types and enums                                                                              |
|`packages/signal/src/client.ts`    |Signal CLI HTTP client                                                                                         |
|`infra/signal-cli/README.md`       |Sidecar deployment and registration instructions                                                               |

-----

## When Working On…

Read the relevant docs BEFORE writing code. This saves rework.

|Task                                                     |Read first                                                   |Why                                                                                           |
|---------------------------------------------------------|-------------------------------------------------------------|----------------------------------------------------------------------------------------------|
|Any UI component, page, or styling                       |`docs/design-brief.md`                                       |Colours, typography, spacing, component specs, layout pattern, CSS tokens, accessibility rules|
|Agent activity feed or approval UI                       |`docs/design-brief.md` → Agent Activity Feed section         |`--color-agent-*` tokens, feed item anatomy, approval UX spec                                 |
|Navigation, sidebar, or app shell layout                 |`docs/design-brief.md` → Layout Pattern + Navigation sections|Sidebar width, header height, responsive breakpoints, active states                           |
|CSS tokens or custom properties                          |`docs/design-brief.md` → Design Tokens section               |Canonical token names — do not invent new ones or use raw hex values                          |
|UI copy, empty states, labels, microcopy                 |`docs/brand-voice.md` → UI Microcopy Rules section           |Tone, action label patterns, banned phrases                                                   |
|Content Creator agent, content tools, or draft generation|`docs/brand-voice.md`                                        |Tone, terminology, banned words, Bitcoin stance, content lengths                              |
|Any agent (building, modifying, adding tools)            |`docs/agents/{agent-name}.md`                                |Triggers, capabilities, tools, schema deps, approval gates                                    |
|Simon specifically                                       |`docs/agents/simon.md`                                       |Conflict detection flow, capacity awareness, morning briefing spec                            |
|Webhook handlers or external service integration         |`docs/webhooks.md`                                           |Payloads, authentication, handler logic                                                       |
|Database changes, new tables, migrations                 |`packages/db/MIGRATIONS.md` + `docs/schema-changes.md`       |Migrations in `supabase/migrations/` are the execution source of truth; see MIGRATIONS.md for the full workflow|
|Shared types or enums                                    |`packages/shared/src/types.ts`                               |Check if type already exists before creating                                                  |
|Supabase queries, RPC functions, vector/graph search     |`packages/db/src/rpc/`                                       |Check existing wrappers before writing raw queries                                            |
|Email or newsletter drafts/templates                     |`docs/brand-voice.md`                                        |Formality level (semi-formal), length (400–800 words), required/banned terminology            |
|Anything touching Bitcoin terminology                    |`docs/brand-voice.md`                                        |Capital B = network/protocol, lowercase b = currency/unit. Required and banned term lists.    |
|New agent or capability                                  |`docs/agents/simon.md` (capacity awareness)                  |Update `platform_capabilities` table when adding new capabilities                             |
|Signal integration, Simon’s messaging                    |`packages/signal/` + `infra/signal-cli/README.md`            |Client API and sidecar deployment                                                             |

**If in doubt, read `docs/brand-voice.md`.** It’s the most commonly needed reference after this file.

### Source of truth boundaries

These two files cover adjacent territory — know which one to reach for:

|Topic                                   |Source of truth       |
|----------------------------------------|----------------------|
|What the platform looks like            |`docs/design-brief.md`|
|What the platform sounds like           |`docs/brand-voice.md` |
|CSS token names and values              |`docs/design-brief.md`|
|Banned words in copy                    |`docs/brand-voice.md` |
|Component states and specs              |`docs/design-brief.md`|
|Bitcoin terminology rules               |`docs/brand-voice.md` |
|Visual identity (colours, type, spacing)|`docs/design-brief.md`|
|Brand personality and tone              |`docs/brand-voice.md` |

If `docs/brand-voice.md` contains visual identity values (colours, hex codes), treat them as illustrative reference only — the implementation spec lives in `docs/design-brief.md`.