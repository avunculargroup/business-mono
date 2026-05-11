# CLAUDE.md — Agent Platform Architecture

This is the internal business platform for Bitcoin Treasury Solutions (BTS) — a Bitcoin education, consulting, and treasury implementation company. Two co-founders, pre-revenue, building an AI-powered operations platform.

## Coding Behavior

**Bias toward caution over speed. For trivial tasks, use judgment.**

### Think Before Coding
- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If something is unclear, stop. Name what's confusing. Ask.
- If a simpler approach exists, say so and push back.

### Simplicity First
- No features beyond what was asked. No speculative abstractions or configurability.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

### Surgical Changes
- Don't "improve" adjacent code, comments, or formatting.
- Match existing style, even if you'd do it differently.
- Remove only imports/variables/functions that YOUR changes made unused.
- Mention pre-existing dead code — don't delete it.

### Goal-Driven Execution
Transform tasks into verifiable goals before implementing:
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- For multi-step tasks, state a brief plan with a verify step for each.

-----

## Monorepo Structure

```
├── apps/
│   ├── agents/          # Mastra AI agents server (Railway)
│   │   └── evals/       # Routing-accuracy fixtures + runner (pnpm test:eval)
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
│   ├── DESIGN_BRIEF.md  # UI design system backing data — consumed by the bts-design skill (do not read directly)
│   ├── schema-changes.md  # Changelog: what changed from original schema and why
│   └── webhooks.md
├── schema.sql           # Consolidated database schema (source of truth)
├── CLAUDE.md            # This file — architecture, routing, conventions
├── pnpm-workspace.yaml
└── turbo.json
```

**Package manager**: pnpm workspaces | **Build**: Turborepo | **Deploy**: `apps/agents` → Railway, `apps/web` → Vercel

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
- **Mastra storage**: Separate Postgres for thread memory, working memory, semantic recall, and the native scheduler — connection string is `MASTRA_DB_URL` (Railway Postgres recommended; Supabase direct works only with the IPv4 add-on). Distinct from the Supabase JS client used for app data.
- **Observability**: `DefaultExporter` (local OTLP) is always on; `CloudExporter` ships traces to Mastra Cloud when `MASTRA_CLOUD_ACCESS_TOKEN` is set, otherwise self-disables.
- **Communication**: Signal CLI (Simon's dedicated number)
- **Email**: Fastmail JMAP (polling every 5 min, accounts stored in DB, Della analyses content)
- **Phone Recording**: Telnyx Voice API (dual-channel, auto-record)
- **Video Recording**: Zoom webhooks (recording-ready events)
- **Transcription**: Deepgram Nova-3 (callback/webhook pattern, multichannel)
- **Embeddings**: OpenAI text-embedding-3-small (1536 dimensions) — used for both knowledge-base vectors AND Simon's semantic-recall memory
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

Simon is the central coordinator. Directors interact ONLY with Simon via Signal (future: also via `apps/web`). Specialists never message humans directly.

```
Directors (Signal / Web UI) <-> Simon <-> Specialist Agents
                                              |
                                      Supabase (shared DB)
```

### Inter-agent communication rules

1. **Via Simon**: Simon dispatches work to specialists and relays results to directors. Default path. Implemented as Mastra native subagent delegation — specialists are registered on Simon's `agents:` property and surface in tool calls as `agent-<name>` (e.g. `agent-charlie`, `agent-rex`).
1. **Via database events**: Some agent outputs trigger other agents implicitly (e.g. Recorder proposes tasks → PM picks them up from `agent_activity`).
1. **Read-only knowledge queries**: Any agent can query the Archivist's knowledge base directly. The only permitted direct cross-agent call.

### Capacity awareness

Simon checks for gaps before routing any directive: no agent for the task, missing tool on an existing agent, workload overload, or broken capability chain. When a gap is found, Simon surfaces what CAN/CANNOT be done and recommends alternatives. Gaps are logged to `capacity_gaps` and included in the morning briefing. See `docs/agents/simon.md` for the full spec.

-----

## Agent Roster

|Agent          |Mastra Type     |Spec                                         |Primary Domain                                                         |
|---------------|----------------|---------------------------------------------|-----------------------------------------------------------------------|
|Simon          |Agent           |`docs/agents/simon.md`                       |Orchestration, Signal interface, conflict detection, capacity awareness|
|Recorder       |Workflow + Agent|`docs/agents/recorder.md`                    |Transcription, entity extraction, CRM sync                             |
|Archivist      |Agent           |`docs/agents/archivist.md`                   |Knowledge management, hybrid search                                    |
|PM             |Workflow + Agent|`docs/agents/pm.md`                          |Projects, tasks, risk tracking                                         |
|BA             |Agent           |`docs/agents/ba.md`                          |Requirements analysis, clarification loops                             |
|Content Creator|Agent           |`docs/agents/content-creator.md`             |Content drafting, iteration, brand consistency                         |
|Researcher     |Workflow + Agent|`docs/agents/researcher-agent-spec.md`       |Web research, fact verification, URL ingestion, topic monitoring       |
|Della (RM)     |Agent           |`docs/agents/relationship-manager.md`        |CRM management, relationship health, pipeline advice                   |

**Agent vs Workflow**: Use Agent for open-ended judgment tasks; Workflow for deterministic pipelines; Hybrid where a pipeline has reasoning steps.

-----

## Approval Philosophy

Every agent starts with maximum guardrails. Write operations graduate: one-at-a-time → batch approval → autonomous (notified after). Read-only is always auto-approved. Emails and public content are ALWAYS human-approved — no graduation.

-----

## Database (`packages/db`)

Schema changes go through the **Supabase CLI migration workflow**. `supabase/migrations/` is the execution source of truth, applied automatically on push to `main`. `schema.sql` is a human-readable reference only — do not execute it directly. See `packages/db/MIGRATIONS.md` for the full workflow.

Key principles:

- All agents log to `agent_activity` — this is the audit trail
- Use `source` columns to identify which agent created a record
- `extracted_data` JSONB fields follow shapes documented in agent specs
- RLS: authenticated team members can read/write everything (two-person team)
- Supabase client: `packages/db/src/client.ts` | Generated types: `packages/db/src/types/database.ts`
- RPC functions (graph traversal, semantic search): `packages/db/src/rpc/`
- Simon's capacity check uses `platform_capabilities` and `capacity_gaps` tables
- Fastmail sync uses `fastmail_accounts`, `fastmail_exclusions`, `fastmail_sync_state` tables

```bash
pnpm --filter @platform/db generate-types
```

-----

## Knowledge Layer

Three complementary query strategies (all within Supabase, wrapped as RPC in `packages/db`):

1. **pgvector**: Semantic similarity (HNSW on VECTOR(1536))
1. **Recursive CTEs**: Graph traversal on `knowledge_connections`
1. **Postgres FTS**: tsvector/tsquery on `knowledge_items.raw_content`

-----

## Naming Conventions

- **Packages**: `@platform/{name}`
- **Agent names in code**: camelCase (`simon`, `recorder`, `contentCreator`)
- **Tool names**: snake_case (`supabase_query`, `deepgram_transcribe`). Exception: auto-generated subagent delegation tools are `agent-<name>` (hyphen) — produced by Mastra from the `agents:` map, not by us.
- **Webhook routes**: `/webhooks/{service}`
- **Database tables**: snake_case, plural (`knowledge_items`)
- **TypeScript files**: camelCase for modules, PascalCase for components/classes
- **Env vars**: SCREAMING_SNAKE_CASE, prefixed by service (`TELNYX_API_KEY`)
- **Railway internal URLs**: `http://{service-name}.railway.internal:{port}`
- **Shared types**: live in `packages/shared` — do NOT duplicate between apps

-----

## Key Files

|File                               |Purpose                                                                                                        |
|-----------------------------------|---------------------------------------------------------------------------------------------------------------|
|`schema.sql`                       |Consolidated schema — human-readable reference only (not executable; use `supabase/migrations/`)               |
|`supabase/migrations/`             |Migration files — applied sequentially via `supabase db push` (auto on push to `main`)                        |
|`packages/db/MIGRATIONS.md`        |Developer workflow for creating and applying migrations                                                        |
|`docs/DESIGN_BRIEF.md`             |Backing data for the `bts-design` skill — do not read directly; invoke the skill instead                       |
|`docs/brand-voice.md`              |**Content source of truth** — tone, terminology, Bitcoin stance, banned words, content lengths, microcopy rules|
|`docs/schema-changes.md`           |Schema changelog — what changed from original and why                                                          |
|`docs/webhooks.md`                 |Webhook endpoint specs, payloads, authentication                                                               |
|`docs/agents/*.md`                 |Individual agent specifications                                                                                |
|`packages/db/src/types/database.ts`|Generated Supabase types                                                                                       |
|`packages/db/src/client.ts`        |Supabase client initialisation                                                                                 |
|`packages/db/src/rpc/`             |RPC wrappers for vector search, graph traversal                                                                |
|`packages/shared/src/types.ts`     |Shared TypeScript types and enums                                                                              |
|`packages/signal/src/client.ts`    |Signal CLI HTTP client                                                                                         |
|`infra/signal-cli/README.md`       |Sidecar deployment and registration instructions                                                               |
|`apps/agents/evals/simon-routing/` |Routing-accuracy eval — fixtures + runner. `pnpm --filter @platform/agents test:eval`                          |

-----

## When Working On…

Read the relevant docs BEFORE writing code.

|Task                                                     |Read first                                                   |Why                                                                                           |
|---------------------------------------------------------|-------------------------------------------------------------|----------------------------------------------------------------------------------------------|
|Any UI component, page, or styling                       |Invoke `bts-design` skill                                    |Colours, typography, spacing, component specs, CSS tokens, accessibility rules                |
|CSS tokens or custom properties                          |Invoke `bts-design` skill                                    |Canonical token names — do not invent new ones or use raw hex values                          |
|UI copy, empty states, labels, microcopy                 |`docs/brand-voice.md` → UI Microcopy Rules section           |Tone, action label patterns, banned phrases                                                   |
|Content drafts, Content Creator agent                    |`docs/brand-voice.md`                                        |Tone, terminology, banned words, Bitcoin stance, content lengths                              |
|Any agent (building, modifying, adding tools)            |`docs/agents/{agent-name}.md`                                |Triggers, capabilities, tools, schema deps, approval gates                                    |
|Simon specifically                                       |`docs/agents/simon.md`                                       |Conflict detection flow, capacity awareness, morning briefing spec                            |
|New agent or capability                                  |`docs/agents/simon.md` (capacity awareness)                  |Update `platform_capabilities` table when adding new capabilities                             |
|Webhook handlers or external service integration         |`docs/webhooks.md`                                           |Payloads, authentication, handler logic                                                       |
|Database changes, new tables, migrations                 |`packages/db/MIGRATIONS.md` + `docs/schema-changes.md`       |Migrations in `supabase/migrations/` are the execution source of truth                        |
|Shared types or enums                                    |`packages/shared/src/types.ts`                               |Check if type already exists before creating                                                  |
|Supabase queries, RPC functions, vector/graph search     |`packages/db/src/rpc/`                                       |Check existing wrappers before writing raw queries                                            |
|Anything touching Bitcoin terminology                    |`docs/brand-voice.md`                                        |Capital B = network/protocol, lowercase b = currency/unit                                     |
|Signal integration, Simon's messaging                    |`packages/signal/` + `infra/signal-cli/README.md`            |Client API and sidecar deployment                                                             |
|Fastmail accounts, exclusions, email review queue        |`apps/web/app/(app)/settings/integrations/fastmail/`         |Web UI for managing DB-stored accounts and exclusions                                         |
|Fastmail JMAP polling, email-to-interaction sync         |`apps/agents/src/lib/fastmailJmap.ts` + `apps/agents/src/listeners/fastmailListener.ts`|JMAP client, skip logic, contact matching, Della dispatch|
|Simon's routing logic or specialist registrations        |`apps/agents/evals/simon-routing/`                           |Run `pnpm --filter @platform/agents test:eval` to spot-check routing accuracy before merging |
|Scheduled routines (cron-driven jobs)                    |`apps/agents/src/workflows/executeRoutineWorkflow.ts` + `routines` table|Routines run via Mastra's native scheduler — `executeRoutine` workflow is triggered per row in the `routines` table at the configured cron|

**If in doubt, read `docs/brand-voice.md`.** It's the most commonly needed reference after this file.

### Source of truth boundaries

|Topic                                   |Source of truth                    |
|----------------------------------------|-----------------------------------|
|What the platform looks like            |`bts-design` skill                 |
|What the platform sounds like           |`docs/brand-voice.md`              |
|CSS token names and values              |`bts-design` skill                 |
|Banned words in copy                    |`docs/brand-voice.md`              |
|Component states and specs              |`bts-design` skill                 |
|Bitcoin terminology rules               |`docs/brand-voice.md`              |
|Visual identity (colours, type, spacing)|`bts-design` skill                 |
|Brand personality and tone              |`docs/brand-voice.md`              |

If `docs/brand-voice.md` contains visual identity values (colours, hex codes), treat them as illustrative reference only — the implementation spec lives in the `bts-design` skill.
