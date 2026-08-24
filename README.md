# business-mono

[![Tests](https://github.com/avunculargroup/business-mono/actions/workflows/test.yml/badge.svg)](https://github.com/avunculargroup/business-mono/actions/workflows/test.yml)

Internal operations platform for Bitcoin Treasury Solutions (BTS) — a Bitcoin education, consulting, and treasury implementation company. Built on a hub-and-spoke agent architecture: a central coordinator (Simon) routes work to a roster of specialist agents, all sharing a Supabase database. A Next.js web app provides dashboards, approvals, and per-agent pages; a Mastra agent server runs the agents, workflows, and scheduled routines.

Private and unlicensed — this is a two-person company's internal tooling, not a product. There is no support commitment and no public API.

**Last updated:** 2026-08-11

---

## Table of Contents

- [What this is](#what-this-is)
- [Architecture overview](#architecture-overview)
- [Monorepo structure](#monorepo-structure)
- [Prerequisites](#prerequisites)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Development](#development)
- [Database](#database)
- [Agents](#agents)
- [Workflows and listeners](#workflows-and-listeners)
- [Subsystems](#subsystems)
- [Web app](#web-app)
- [Webhooks](#webhooks)
- [Deployment](#deployment)
- [Key conventions](#key-conventions)

---

## What this is

Three ideas carry most of the design, and they are the parts worth reading the code for.

**One agent talks to humans.** Directors message Simon on Signal (or through the web app); Simon decides which specialist should do the work and relays the answer back. Specialists never message a director. This keeps the conversational surface to a single voice and single memory, and it means routing quality is a testable property — `apps/agents/evals/simon-routing.eval.ts` scores it against fixtures.

**Trust is earned per-operation, not granted once.** Every write starts human-confirmed, graduates to batch approval, then to autonomous-with-notification, tracked in `agent_activity.status`. Emails and published content never graduate. The audit trail is not a log that sits beside the system — it is the mechanism the system runs on.

**Human gates are suspend/resume, not polling.** The newsletter and campaign workflows genuinely suspend mid-run and resume from either channel a director happens to answer on — a Signal reply or a click in `/content`. Two listeners race to resume the same run; the workflow is written so either can win.

Everything else — CRM, research ingestion, transcription, indicators — feeds those three.

---

## Architecture overview

```
Directors (Signal / Web UI)
        ↕
     Simon (coordinator agent)
        ↕
Specialist Agents: Recorder · Archivist · PM · BA · Content Creator ·
                   Researcher · Della (RM) · Margot (Marketer) · Lex (Compliance)
        ↕
  Supabase (shared Postgres + pgvector)
```

Simon is the only agent that talks to humans. Specialists never message directors directly. All agent actions are logged to `agent_activity` as an audit trail.

The one exception: any agent may query the Archivist's knowledge base directly for read-only lookups without going through Simon.

Three agents are **internal** — invoked only inside one pipeline, never on Simon's roster and never in the `agent_activity.agent_name` CHECK, so they write no activity rows: **editorial** (newsletter review), **marketAnalyst** (market-report intro), and **newsVerifier** (fact-checks the news digest intro). All three are still model-configurable from `/settings/models`.

---

## Monorepo structure

```
├── apps/
│   ├── agents/          # Mastra agent server — deployed to Railway (see apps/agents/README.md)
│   │   ├── evals/       # LLM-touching evals — on-demand, not in CI
│   │   └── test/        # Shared Vitest helpers (mocks, factories, setup)
│   ├── demo/            # Public fixture-backed demo — no database, no auth, read-only
│   └── web/             # Next.js frontend — deployed to Vercel (see apps/web/README.md)
├── packages/
│   ├── db/              # Supabase client, generated types, RPC wrappers
│   ├── shared/          # Shared TypeScript types, enums, constants
│   ├── signal/          # Typed HTTP client for signal-cli REST API sidecar
│   ├── ui/              # Design tokens and shared presentational components
│   └── voice/           # Brand-voice resolution, merging and embedding
├── e2e/                 # Playwright visual regression — advisory, separate from `pnpm test`
├── infra/
│   └── signal-cli/      # Docker config for signal-cli sidecar (not in pnpm workspace)
├── docs/                # ~70 docs — start at docs/README.md, which sorts them by genre
│   ├── agents/          # Per-agent specification docs
│   ├── features/        # Per-feature spec bundles, each with its own README
│   ├── reviews/         # Point-in-time reviews (not maintained after writing)
│   ├── DESIGN_BRIEF.md  # Backing data for the bts-design skill — invoke the skill, don't read this
│   ├── brand-voice.md   # Brand voice, tone, terminology, Bitcoin stance
│   ├── schema-changes.md
│   └── webhooks.md
├── scripts/
│   └── check-doc-links.mjs  # Offline relative-link check over the entry-point docs (CI-gated)
├── supabase/
│   └── migrations/      # Database migrations — execution source of truth
├── schema.sql           # Consolidated database schema — human-readable reference only
├── CLAUDE.md            # Conventions an agent must follow (see the note below)
├── tsconfig.base.json   # Base TypeScript config (extended by all packages)
├── turbo.json
└── pnpm-workspace.yaml
```

**README vs CLAUDE.md.** This README explains how a human runs and understands the platform. `CLAUDE.md` carries the conventions a coding agent must follow — logging rules, import rules, which doc to read before touching what. Where the two would overlap, this file links there rather than restating, because two copies of the same table drift apart.

Every app and package carries its own README, and [`docs/README.md`](./docs/README.md) indexes the rest — including which docs are maintained and which are a snapshot of a finished build.

### Package dependency graph

```
@platform/agents  →  @platform/agent-traces
                  →  @platform/db      →  @platform/shared
                  →  @platform/signal
                  →  @platform/voice   →  @platform/db, @platform/shared
@platform/web     →  @platform/db      →  @platform/shared
                  →  @platform/ui      →  @platform/shared
                  →  @platform/data           →  @platform/shared
                  →  @platform/data-supabase  →  @platform/data, @platform/db, @platform/shared
@platform/demo    →  @platform/agent-traces
                  →  @platform/data           →  @platform/shared
                  →  @platform/data-fixtures  →  @platform/data, @platform/shared
                  →  @platform/ui             →  @platform/shared
```

`apps/*` never import from each other. `@platform/shared` has no internal dependencies. `apps/web` imports only `@platform/data`, `@platform/data-supabase`, `@platform/db`, `@platform/shared` and `@platform/ui` — not `@platform/signal`, not `@platform/voice`. `apps/demo` imports only `@platform/agent-traces`, `@platform/data`, `@platform/data-fixtures`, `@platform/shared` and `@platform/ui`: it has no database client anywhere in its transitive graph, which is what makes it safe to deploy publicly, and `apps/demo/lib/boundary.test.ts` keeps it that way.

`@platform/ui` never imports from `apps/*`. It holds the design tokens and the shared
presentational components, and is written to be consumed by more than one app — so a dependency
on app code would defeat the point. React and `lucide-react` are peer dependencies.

`@platform/data` holds the repository interfaces both apps code against; `@platform/data-supabase`
is the live implementation. They are separate packages rather than one with subpath exports so that
a fixture-backed app can simply not depend on the Supabase one and have that enforced by
`package.json` rather than by discipline. `@platform/data` imports only `@platform/shared` (for the enums the ingestion side already
defines) and never a database client. `@platform/data-fixtures` is the demo's implementation: the
same interfaces over static typed objects, with every write throwing `DemoWriteBlockedError` naming
the table it would have touched. It implements only the seven domains the demo renders — the bundle
is a slice (`Bundle<K>`), so a demo route reaching for a domain the demo does not have is a compile
error rather than a stub that throws.
See [`docs/features/demo-app/repository-contract.md`](./docs/features/demo-app/repository-contract.md).

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 20+ (CI runs 22) |
| pnpm | 9.15.0 (enforced by `packageManager` field) |
| Supabase CLI | latest |

Install pnpm if needed:

```bash
npm install -g pnpm@9.15.0
```

---

## Getting started

```bash
# 1. Clone and install
git clone <repo-url>
cd business-mono
pnpm install

# 2. Set up environment variables
cp apps/agents/.env.example apps/agents/.env
# Fill in values — see Environment variables section below

# 3. Set up the database (choose one)
#    Option A — Local (Supabase CLI):
supabase start && supabase db push
#    Option B — Remote (hosted Supabase project):
supabase link --project-ref $SUPABASE_PROJECT_ID && supabase db push

# 4. Seed brand assets
pnpm --filter @platform/db seed:brand-voice

# 5. Generate TypeScript types from your Supabase schema
pnpm db:generate-types

# 6. Verify the checkout before changing anything
pnpm typecheck && pnpm test

# 7. Start the agent server in dev mode
pnpm dev:agents

# 8. In a second terminal, start the web app
cp apps/web/.env.example apps/web/.env.local   # fill in the two Supabase values
pnpm dev:web
```

**`apps/demo` needs none of the above.** It is fixture-backed with no database, no auth and no
environment variables, so `pnpm dev:demo` works on a fresh checkout — which makes it the
quickest way to see the platform's surfaces without standing anything up. See
[`apps/demo/README.md`](./apps/demo/README.md).

### Getting past the login page

`apps/web` is auth-gated by `middleware.ts` — every route except `/login` and the public `/share/<id>` links redirects to a sign-in form. There is no self-serve sign-up: the login page calls `signInWithPassword` only. Create the first user in the Supabase dashboard under **Authentication → Users → Add user** (tick "Auto Confirm User"), then sign in with those credentials.

RLS grants any authenticated team member read/write across the app tables, so one user is enough to see everything.

---

## Environment variables

**The two `.env.example` files are the reference**, not this section. They are kept current and carry the rationale for each optional key — why `GITHUB_TOKEN` is "optional but effectively required in production", what degrades when `LLAMA_CLOUD_API_KEY` is unset, why there are two different web-app-URL variables read by different code paths.

```bash
cp apps/agents/.env.example apps/agents/.env       # ~20 keys, heavily commented
cp apps/web/.env.example apps/web/.env.local       # 6 keys, 2 required
```

This table lists only what the agent server cannot boot without. Everything else — provider keys for research, indicators, reports and LinkedIn; listener kill switches; log level; observability — is documented inline in `apps/agents/.env.example`.

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (bypasses RLS — keep secret) |
| `MASTRA_DB_URL` | Postgres connection string for Mastra's thread/memory/semantic-recall storage and the native scheduler. **Not** the Supabase JS client. Railway Postgres recommended (always IPv4); Supabase direct works only with the IPv4 add-on. `SUPABASE_DB_URL` is accepted as a fallback. |
| `ANTHROPIC_API_KEY` *or* `OPENROUTER_API_KEY` | The model provider. Set one. If both are set, OpenRouter wins. |
| `OPENAI_API_KEY` | Embeddings — `text-embedding-3-small`, 1536 dimensions |

For `apps/web`, only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are required; the other four keys each disable one feature when unset, and the app says so in the UI rather than failing.

---

## Development

### Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev:agents` | Start agent server in watch mode |
| `pnpm dev:web` | Start Next.js frontend in dev mode |
| `pnpm dev:demo` | Start the public demo — no env, no database, no auth |
| `pnpm build` | Build all packages and apps |
| `pnpm typecheck` | Type-check all packages |
| `pnpm lint` | Lint all packages |
| `pnpm test` | Run every Vitest suite — three apps and five packages |
| `pnpm test:visual` | Playwright visual regression, in the CI container image. Advisory, not part of `pnpm test` |
| `pnpm test:visual:update` | Regenerate screenshot baselines in that same image |
| `pnpm db:generate-types` | Regenerate Supabase TypeScript types |
| `pnpm db:migrate` | Apply pending migrations (`supabase db push`) |
| `pnpm db:diff` | Diff the local database against the migration history |
| `pnpm db:pull` | Pull the remote schema into a new migration |
| `pnpm db:reset` | Reset the local database and replay all migrations |
| `pnpm --filter @platform/db seed:brand-voice` | Sync `docs/brand-voice.md` into `brand_assets` table |
| `node scripts/check-doc-links.mjs` | Verify relative links in the entry-point docs resolve |

All commands are orchestrated through Turborepo, which handles build order and caching based on the dependency graph.

CI (`.github/workflows/test.yml`) runs three jobs on every PR: typecheck + lint + tests + the doc-link check, a `mastra build` of the agent server (the Railway deploy path), and a `next build` of the web app (the Vercel deploy path). The two build jobs exist because a bundler or prerender break passes typecheck and tests but fails on deploy.

### Testing

Both apps carry a Vitest suite; `pnpm test` (root) runs both via Turborepo and is gated by the PR workflow (`.github/workflows/test.yml`).

| Command | What it runs |
|---------|--------------|
| `pnpm --filter @platform/agents test` | Agent server suite — fully mocked, ~2s, no secrets |
| `pnpm --filter @platform/agents typecheck` | Type-check the agent server |
| `pnpm --filter @platform/agents test:eval` | LLM-touching routing/prompt evals — real LLM, on-demand, **not** in CI |
| `pnpm --filter @platform/web test` | Web suite — `node` env for logic, `jsdom` + React Testing Library for components |

Convention: put a `*.test.ts` (or `*.test.tsx`) next to the module. Reuse the shared helpers in `apps/agents/test/` (mocks, factories) rather than building one-off fixtures. Run the agent tests and typecheck before opening a PR — both are red-gates on CI.

### Adding a new agent

1. Create a directory under `apps/agents/src/agents/<name>/`.
2. Decide the type: `Agent` (open-ended judgment) or `Workflow + Agent` (deterministic pipeline with reasoning steps).
3. Implement tools in `tools.ts`, agent in `index.ts` (or `agent.ts` + `workflow.ts` for hybrids).
4. Register the agent in `apps/agents/src/mastra/index.ts`.
5. Add the agent to `platform_capabilities` table so Simon can route to it.
6. Write a spec doc in `docs/agents/<name>.md`.

### Adding a shared type or constant

Add it to `packages/shared/src/types.ts` or `packages/shared/src/constants.ts` and export it from `packages/shared/src/index.ts`. Import via `@platform/shared`.

### TypeScript config

All packages extend `tsconfig.base.json`:

```jsonc
{
  "target": "ES2022",
  "module": "ES2022",
  "moduleResolution": "bundler",
  "strict": true
}
```

Mastra requires ES2022 modules — do not downgrade `module` or `target`.

---

## Database

Schema changes are managed via **Supabase CLI migrations** in `supabase/migrations/`. These are the **execution source of truth** and are applied automatically on push to `main` via `.github/workflows/migrate.yml`. `schema.sql` at the repo root is a human-readable consolidated reference — do not execute it directly against a live database. See `packages/db/MIGRATIONS.md` for the full migration workflow.

### Remote setup (hosted Supabase project)

Link to your hosted project and push migrations:

```bash
supabase link --project-ref $SUPABASE_PROJECT_ID
supabase db push
```

### Local setup (Supabase CLI)

For local development using the Supabase CLI:

```bash
# 1. Install the CLI (if not already installed)
brew install supabase/tap/supabase   # macOS
# or: npm install -g supabase        # any platform

# 2. Start the local Supabase stack (Postgres, Auth, Storage, etc.)
supabase start

# 3. Apply migrations to the local database
supabase db push

# 4. Seed brand assets into the local database
SUPABASE_URL=$(supabase status -o env | grep API_URL | cut -d= -f2-) \
SUPABASE_SERVICE_ROLE_KEY=$(supabase status -o env | grep SERVICE_ROLE_KEY | cut -d= -f2-) \
pnpm --filter @platform/db seed:brand-voice

# 5. Generate TypeScript types from the local instance
supabase gen types typescript --local > packages/db/src/types/database.ts
```

Use the local credentials in your `apps/agents/.env`:

```bash
# From `supabase status` output:
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=<service_role key from supabase status>
```

To stop and restart the local stack:

```bash
supabase stop          # stop (preserves data)
supabase stop --no-backup  # stop and reset data
supabase start         # start again
```

See `docs/schema-changes.md` for a changelog of intentional deviations from any original schema.

### Regenerating types

After any schema change, regenerate the TypeScript types:

```bash
pnpm db:generate-types
# generates packages/db/src/types/database.ts
```

### Seeding brand assets

The brand voice document (`docs/brand-voice.md`) is the source of truth for tone, terminology, and content style. To sync it into the `brand_assets` table:

```bash
pnpm --filter @platform/db seed:brand-voice
```

Run this whenever `docs/brand-voice.md` is updated. It parses the markdown into sections and upserts them as `brand_assets` records (old versions are soft-deleted).

### Key tables

| Table | Purpose |
|-------|---------|
| `agent_activity` | Audit trail — every agent action logged here |
| `platform_capabilities` | Registry of what each agent can do |
| `capacity_gaps` | Gaps Simon has identified between intended and actual capability |
| `knowledge_items` | Archivist knowledge base with `VECTOR(1536)` embeddings (HNSW indexed) |
| `knowledge_connections` | Graph edges between knowledge items |
| `contacts` / `companies` | CRM core |
| `tasks` / `projects` | Task and project tracking |
| `requirements` | BA-structured requirements with user stories |
| `content_items` | Content pipeline: idea → draft → review → approved → published |
| `risk_register` | Risk tracking with severity × likelihood matrix |
| `routines` | Scheduled agent routines on a daily/weekly/fortnightly cadence. The `action_type` column picks the handler `executeRoutine` dispatches to; `RoutineActionType` in `packages/shared/src/routines.ts` is the list, with each action's `action_config` shape documented beside it |
| `news_sources` | Upstream research sources — RSS, podcast, YouTube, and email newsletters (`source_type` discriminator). Email rows carry `slug`/`inbound_address`/`sender_allowlist`; all carry `tier`/`relevance_threshold` for the Rex rubric |
| `news_items` | Ingested research from every source, scored by the Rex rubric (`relevance_score`, `relevance_reasoning`, `curator_notes`, `rex_metadata`) |
| `fastmail_accounts` | Fastmail JMAP accounts for email polling (credentials in DB; `research_folder` names the newsletter folder polled separately from CRM mail) |
| `fastmail_exclusions` | Email addresses/domains excluded from CRM processing |
| `fastmail_sync_state` | Per-account JMAP sync cursors (inbox, sent, research folder) |

### RPC wrappers (`packages/db/src/rpc/`)

| Function | Description |
|----------|-------------|
| `vectorSearch()` | Semantic similarity search over `knowledge_items` (pgvector HNSW) |
| `graphTraverse()` | Graph traversal over `knowledge_connections` via recursive CTE |
| `fulltextSearch()` | Postgres FTS over `knowledge_items.raw_content` |
| `contentSearch()` | Semantic search over `content_embeddings` — the newsletter workflow's RAG store |
| `newsSearch()` | Search over ingested `news_items` |
| `reportSearch()` | Search over extracted report text (PDF/HTML report ingestion) |
| `transcriptVectorSearch()` | Semantic search over podcast transcript segments |

Use these wrappers rather than writing raw `.rpc()` calls.

---

## Agents

Full specifications are in `docs/agents/`. Agent names in code use a persona (camelCase) — shown in parentheses. Summary:

| Agent | Type | Role |
|-------|------|------|
| **Simon** | Agent | Central coordinator. Only agent that communicates with directors via Signal. Detects conflicts, tracks capacity gaps, dispatches to specialists. |
| **Recorder** (`roger`) | Workflow + Agent | Ingests phone (Telnyx) and video (Zoom) recordings, transcribes via Deepgram, extracts entities, syncs to CRM, proposes tasks. |
| **Archivist** (`archie`) | Agent | Manages the knowledge base. Processes URLs and YouTube videos, maps connections, answers knowledge queries via hybrid search. |
| **PM** (`petra`) | Workflow + Agent | Triages tasks from `agent_activity`, manages projects, tracks risks, monitors blocked tasks. |
| **BA** (`bruno`) | Agent | Elicits and structures requirements with multi-round clarification loops (Mastra suspend/resume). |
| **Content Creator** (`charlie`) | Agent | Drafts and iterates content, enforces brand consistency, adapts across formats. Feeds the newsletter and campaign workflows. All publishing is human-approved. |
| **Researcher** (`rex`) | Workflow + Agent | Acquires, verifies, and structures web information. Handles fact verification, deep research, URL ingestion, and topic monitoring. Feeds the Archivist knowledge base. Scores ingested research (RSS/podcast/YouTube/email newsletters) against the relevance rubric for the `/news` feed. |
| **Della (RM)** (`della`) | Agent | CRM management, customer understanding, relationship health, pipeline advice. Analyses Fastmail email via JMAP polling. |
| **Margot (Marketer)** (`margot`) | Agent | Campaign strategist above Content Creator. Turns an objective into a structured strategy and an ordered set of scheduled beats, powering the Campaign Strategy workflow. |
| **Lex (Compliance)** (`lex`) | Agent | Reviews advice-framed content drafts for AFSL/AR compliance. Logs verdicts; never auto-approves. Re-runs when a campaign variant's copy is edited. Unlike the others, Lex is not one of Simon's subagents — it is triggered by the compliance listener and the variant workflow. |

### Approval philosophy

Operations graduate from human-confirmed → batch approval → autonomous based on track record. The following **never graduate** and are always human-approved:

- Emails
- Published content
- Merging or deleting contacts (destructive)
- Bulk pipeline updates (high blast radius)

Creating a contact or company is *not* on that list — it graduates like any other write, starting one-at-a-time. See the approval-gate table in `docs/agents/relationship-manager.md`, which is the source of truth for Della's gates.

---

## Workflows and listeners

The agent server runs deterministic **workflows** and long-lived **listeners** alongside the agents (both registered in `apps/agents/src/mastra/index.ts`).

**Workflows**

| Workflow | Purpose |
|----------|---------|
| `recorder` | Transcription + entity extraction from call/video recordings |
| `pm` | Task triage + risk scan |
| `executeRoutine` | Cron-driven routines from the `routines` table (Mastra native scheduler) |
| `newsletter` | Multi-stage newsletter generation (RAG → story selection → drafting → editorial review) with two human approval gates |
| `strategy` | Campaign Strategy — Margot synthesises a strategy and beat plan behind two approval gates |
| `variant` | Expands campaign beats into per-platform post variants (Lex compliance gate) |
| `pruneStorage` | Scheduled cleanup of aged stored artefacts |
| `ecosystemScan` | Sweeps ecosystem watches for changes and writes the `/signals` feed |

A second family of workflow modules under `apps/agents/src/workflows/` is invoked directly by routines and listeners rather than through the Mastra registry — the news pipeline (`ingestNewsItem`, `newsCuration*`, `newsDedup`, `newsRelevance`, `newsRubric`), `podcastIntel/`, `libraryAnswer/` and `socialPost/`. They are not on the table above because they are not registered; `apps/agents/README.md` covers the distinction.

**Listeners** (`apps/agents/src/listeners/`) — 19 modules. Roughly: inbound channels (`signalListener`, `fastmailListener`, `researchMailListener`), realtime web-side resumes (`webDirectives`, `newsletterGateWeb`, `strategyGateWeb`, `variantGateWeb`), agent output persistence (`contentCreatorListener`, `pmListener`, `podcastActionListener`, `socialPublishListener`, `libraryQuestionListener`), embedding sync (`contentEmbeddingListener`, `voiceEmbeddingListener`), and feedback/compliance loops (`complianceRecheck`, `feedbackDistillListener`, `marketReportFeedbackListener`). The per-listener detail lives in `apps/agents/README.md`, next to the code, so it stays current.

---

## Subsystems

Beyond the core agent loop, the platform carries several ingestion and analysis subsystems. Each has a spec; start there before reading the code.

| Subsystem | What it does | Spec |
|---|---|---|
| Podcast ingestion + transcript library | Subscribes to shows, resolves a transcript through a cost-ordered waterfall (publisher feed → YouTube → Deepgram), then indexes segments for RAG. `/news/podcasts` | `docs/podcast-ingestion-spec.md`, plus an unusually good UI reference at `apps/web/app/(app)/news/podcasts/README.md` |
| Research feed | RSS, YouTube, podcast and paid email newsletters, all scored by Rex's 3-dimension relevance rubric. `/news` | `docs/news-source-email-spec.md` |
| Newsletter generation | RAG retrieval → story selection → drafting → editorial review, behind two suspend/resume gates. `/content` | `docs/newsletter-workflow-spec.md` |
| Social campaigns | Campaign → ordered beats → per-platform variants, each with a Lex compliance check and a human gate. `/campaigns` | `docs/social-campaigns-spec.md`, `docs/CAMPAIGNS_BUILD_ORDER.md` |
| Report ingestion | Watches publisher pages for new PDF/HTML reports, acquires and extracts them (OCR fallback), indexes for search | `docs/features/html-pdf-monitoring/html-pdf-monitoring.md` |
| Market reports + findings engine | Daily narrated market report over indicator data, with a hold-rather-than-guess rule. `/market-reports` | `docs/features/findings-engine-spec.md` |
| Economic + on-chain indicators | Scheduled macro and Bitcoin-network series feeding the dashboard and the agents | `docs/features/economic-indicators/README.md`, `docs/features/onchain-indicators/README.md` |
| Ecosystem signals | Watches the products and advisors BTS features, and surfaces what changed. `/signals` | `docs/features/ecosystem/ecosystem-signal-feature.md` |
| Business discovery | Structured customer-discovery pipeline — personas, segments, interviews, lexicon. `/discovery`, `/crm` | `docs/business_discovery_phase1_spec.md` (phases 1–3), `docs/crm-discovery-guide.md` |

---

## Web app

`apps/web` is a Next.js 15 App Router frontend (deployed to Vercel) with an authenticated shell at `app/(app)/`. Server actions live in `app/actions/`. See `apps/web/README.md` for the full route map and testing setup. Main areas:

| Area | Purpose |
|------|---------|
| `/` (dashboard) | Overview — activity, approvals queue, indicators, credits |
| `activity` | The `agent_activity` audit trail and approval actions |
| `simon` | Conversational interface to Simon |
| `crm` / `company` | Contacts, companies, interactions, plus discovery sub-sections (personas, segments, interviews, champions, community) |
| `projects` / `tasks` | Project and task tracking (PM) |
| `content` / `campaigns` | Content drafts, newsletter gates, and marketing campaigns with per-variant compliance |
| `news` | Curated research feed, daily digest, podcasts and source management |
| `market-reports` | Daily narrated market reports — published, held, or un-narrated |
| `signals` | Ecosystem change feed (releases, advisories, quiet attestations) |
| `discovery` | Customer discovery — pipeline, lexicon, templates, feedback |
| `products` / `advisors` | Ecosystem registers (human-maintained; see `docs/features/ecosystem/README.md`) |
| `routines` | Scheduled agent routines |
| `brand` / `decks` / `docs` / `files` | Brand hub and supporting workspace pages |
| `settings` | Integrations (Fastmail, LinkedIn), team, and per-agent/per-step model selection (`/settings/models`) |

Public routes outside the authenticated shell: `/login`, and `/share/<id>` for file links marked public (RLS enforces the boundary).

---

## Webhooks

The agent server exposes three webhook endpoints. Full payload specs and authentication details are in `docs/webhooks.md`.

| Endpoint | Trigger |
|----------|---------|
| `POST /webhooks/telnyx` | Phone call recording ready (HMAC signature verified) |
| `POST /webhooks/zoom` | Video recording ready |
| `POST /webhooks/deepgram` | Transcription completed (multichannel) |

All three feed into the Recorder workflow.

---

## Deployment

### Agent server → Railway

`apps/agents/railway.toml` is already configured.

- **Build**: Docker, via `apps/agents/Dockerfile` — Turborepo builds the workspace packages, then `mastra build` bundles the server to `.mastra/output/`
- **Start**: `node --max-old-space-size=512 --disable-warning=DEP0040 .mastra/output/index.mjs`
- **Health check**: `GET /health` (30s timeout)
- **Restart policy**: on failure, max 3 retries

The explicit heap size is load-bearing: V8 otherwise auto-sizes to roughly 256 MB, which is where the recurring OOM crashes hit. `railway.toml` carries the full reasoning, including why it must stay below the container's memory limit.

Set all environment variables (see `apps/agents/.env.example`) in your Railway service settings.

### Frontend → Vercel

Connect the `apps/web` directory to a Vercel project and set the same Supabase variables.

### Database → Supabase

1. Create a new Supabase project.
2. Link and push migrations: `supabase link --project-ref $SUPABASE_PROJECT_ID && supabase db push`.
3. Copy the project URL, service role key, and project ID into your `.env`.

---

## Key conventions

| Thing | Convention | Example |
|-------|------------|---------|
| Package names | `@platform/{name}` | `@platform/db` |
| Agent names in code | camelCase | `contentCreator` |
| Tool names | snake_case | `supabase_query` |
| Webhook routes | `/webhooks/{service}` | `/webhooks/telnyx` |
| DB tables | snake_case, plural | `knowledge_items` |
| TS files | camelCase modules, PascalCase components | `vectorSearch.ts` |
| Env vars | `SCREAMING_SNAKE_CASE` with service prefix | `TELNYX_API_KEY` |
| Default model | `anthropic/claude-sonnet-4-5` | all agents (overridable per agent/step via `/settings/models`) |
| Embedding model | `text-embedding-3-small`, 1536 dims | Archivist, Recorder |
