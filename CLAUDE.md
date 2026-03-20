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
│   ├── brand-voice.md     # Brand voice, tone, terminology, Bitcoin stance (Content Creator source)
│   ├── schema-changes.md  # Changelog: what changed from original schema and why
│   └── webhooks.md
├── schema.sql           # Consolidated database schema (source of truth)
├── CLAUDE.md            # This file (auto-read by Claude Code) — includes design system
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
- **Railway internal URLs**: `http://{service-name}.railway.internal:{port}`

## Shared Types (`packages/shared`)

Types used by both `apps/agents` and `apps/web` live in `packages/shared`. Do NOT duplicate types between apps.

## Key Files

- `schema.sql` — consolidated database schema (source of truth, run on fresh Supabase)
- `CLAUDE.md` — this file. Also contains the design system (colours, typography, components, spacing, CSS tokens) for all UI implementation.
- `docs/brand-voice.md` — brand voice, tone, terminology, Bitcoin stance. Source of truth for ALL content. Visual identity values are in the Visual Identity section of that file for content reference; implementation specs live in this file's Design System section.
- `docs/schema-changes.md` — changelog: what changed from original schema and why
- `docs/webhooks.md` — webhook endpoint specs, payloads, authentication
- `docs/agents/*.md` — individual agent specifications
- `packages/db/src/types/database.ts` — generated Supabase types
- `packages/db/src/client.ts` — Supabase client initialisation
- `packages/db/src/rpc/` — RPC wrappers for vector search, graph traversal
- `packages/shared/src/types.ts` — shared TypeScript types and enums
- `packages/signal/src/client.ts` — Signal CLI HTTP client
- `infra/signal-cli/README.md` — sidecar deployment and registration instructions

## When Working On...

Read the relevant docs BEFORE writing code. This saves rework.

| Task | Read first |
|------|-----------|
| Any UI component, page, or styling | `CLAUDE.md` Design System section — colours, typography, spacing, component specs, CSS tokens |
| Content Creator agent, content tools, or draft generation | `docs/brand-voice.md` — tone, terminology, banned words, Bitcoin stance, content lengths |
| Any agent (building, modifying, adding tools) | `docs/agents/{agent-name}.md` — triggers, capabilities, tools, schema deps, approval gates |
| Simon specifically | `docs/agents/simon.md` — conflict detection flow, capacity awareness, morning briefing spec |
| Webhook handlers or external service integration | `docs/webhooks.md` — payloads, authentication, handler logic |
| Database changes, new tables, migrations | `schema.sql` (source of truth) + `docs/schema-changes.md` (rationale) |
| Shared types or enums | `packages/shared/src/types.ts` — check if type already exists before creating |
| Supabase queries, RPC functions, vector/graph search | `packages/db/src/rpc/` — check existing wrappers before writing raw queries |
| UI copy, empty states, labels, microcopy | `docs/brand-voice.md` (UI Microcopy Rules section) |
| Email or newsletter drafts/templates | `docs/brand-voice.md` — formality level (semi-formal), length (400-800 words), required/banned terminology |
| Anything touching Bitcoin terminology | `docs/brand-voice.md` — capital B = network/protocol, lowercase b = currency/unit. Required and banned terms lists. |
| New agent or capability | `docs/agents/simon.md` (capacity awareness) — update `platform_capabilities` table when adding new capabilities |
| Signal integration, Simon's messaging | `packages/signal/` (client API) + `infra/signal-cli/README.md` (deployment) |

**If in doubt, read `docs/brand-voice.md`.** It's the most commonly needed reference after this file.

## Design System

Source of truth for all UI implementation in `apps/web`. When building any component, page, or styling, read this section first.

> **Status:** `apps/web` is not yet built. This section will be expanded with full component specs, spacing scale, and CSS token definitions as the frontend is developed. The values below are definitive — add to them here rather than creating a separate design brief file.

### Colour Palette

| Role | Token | Hex | Usage |
|------|-------|-----|-------|
| Background | `--color-bg` | `#FAFAF8` | Primary page background — warm off-white |
| Surface | `--color-surface` | `#FFFFFF` | Cards, panels, modals |
| Surface subtle | `--color-surface-subtle` | `#F4F4F1` | Secondary sections, input backgrounds |
| Border | `--color-border` | `#E8E6E0` | Dividers, card borders — warm grey |
| Text primary | `--color-text` | `#1A1915` | Headings, body — near-black with warmth |
| Text secondary | `--color-text-secondary` | `#6B6860` | Supporting text, labels, captions |
| Gold accent | `--color-gold` | `#C9A84C` | Primary accent — CTAs, highlights, icons |
| Gold light | `--color-gold-light` | `#F0E4C0` | Accent backgrounds, tags, badges |
| Gold dark | `--color-gold-dark` | `#9A7A2E` | Hover states, pressed states |
| Success | `--color-success` | `#3D7A5E` | Positive signals, completion states |
| Destructive | `--color-destructive` | `#B04040` | Errors, destructive actions |

**Palette principle:** Warm, not cold. No pure white backgrounds (`#FFFFFF` is surface only, not background) or pure black text. Gold is a refined accent — used sparingly so it feels earned. Light mode by default; dark mode is a future consideration.

### Typography

| Role | Family | Usage |
|------|--------|-------|
| Display / Headings | `Playfair Display` (serif) | Page titles, section headings — editorial, authoritative |
| Body / UI | `DM Sans` (geometric sans) | Body copy, labels, navigation, buttons |
| Monospace / Data | `JetBrains Mono` | Bitcoin amounts, percentages, numerical data, code |

### Aesthetic

Premium asset manager meets modern software (Stripe/Linear polish). Generous whitespace, gold accents used sparingly, typography doing the heavy lifting.

**Never:** Crypto-native neon, dark mode by default, rocket emojis, purple gradients, clip-art icons, stock-photo energy.

### CSS Tokens

Define all colours and typography as CSS custom properties on `:root`. Use token names from the table above (e.g. `var(--color-gold)`). Do not hardcode hex values in component styles.
