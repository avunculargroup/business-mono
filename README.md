# business-mono

Internal AI-powered operations platform for Bitcoin Treasury Solutions. Built on a hub-and-spoke agent architecture: a central coordinator (Simon) routes work to specialist agents, all sharing a Supabase database.

---

## Table of Contents

- [Architecture overview](#architecture-overview)
- [Monorepo structure](#monorepo-structure)
- [Prerequisites](#prerequisites)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Development](#development)
- [Database](#database)
- [Agents](#agents)
- [Webhooks](#webhooks)
- [Deployment](#deployment)
- [Key conventions](#key-conventions)

---

## Architecture overview

```
Directors (Signal / Web UI)
        ↕
     Simon (coordinator agent)
        ↕
Specialist Agents: Recorder · Archivist · PM · BA · Content Creator · Researcher · Della (RM)
        ↕
  Supabase (shared Postgres + pgvector)
```

Simon is the only agent that talks to humans. Specialists never message directors directly. All agent actions are logged to `agent_activity` as an audit trail.

The one exception: any agent may query the Archivist's knowledge base directly for read-only lookups without going through Simon.

---

## Monorepo structure

```
├── apps/
│   ├── agents/          # Mastra AI agent server — deployed to Railway
│   └── web/             # Next.js frontend — deployed to Vercel
├── packages/
│   ├── db/              # Supabase client, generated types, RPC wrappers
│   ├── shared/          # Shared TypeScript types, enums, constants
│   └── signal/          # Typed HTTP client for signal-cli REST API sidecar
├── infra/
│   └── signal-cli/      # Docker config for signal-cli sidecar (not in pnpm workspace)
├── docs/
│   ├── agents/          # Per-agent specification docs
│   ├── DESIGN_BRIEF.md  # UI design system — colours, typography, components, tokens
│   ├── brand-voice.md   # Brand voice, tone, terminology, Bitcoin stance
│   ├── schema-changes.md
│   └── webhooks.md
├── supabase/
│   └── migrations/      # Database migrations — execution source of truth
├── schema.sql           # Consolidated database schema — human-readable reference only
├── CLAUDE.md            # AI agent instructions
├── tsconfig.base.json   # Base TypeScript config (extended by all packages)
├── turbo.json
└── pnpm-workspace.yaml
```

### Package dependency graph

```
@platform/agents  →  @platform/db     →  @platform/shared
                  →  @platform/signal
@platform/web     →  @platform/db     →  @platform/shared
```

`apps/*` never import from each other. `@platform/shared` has no internal dependencies. `apps/web` does NOT import `@platform/signal`.

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 20+ |
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

# 6. Start the agent server in dev mode
pnpm dev:agents
```

---

## Environment variables

All secrets live in `apps/agents/.env`. Copy the example and fill in values:

```bash
cp apps/agents/.env.example apps/agents/.env
```

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key (bypasses RLS — keep secret) |
| `SUPABASE_PROJECT_ID` | Yes | Project ID for type generation |
| `ANTHROPIC_API_KEY` | Yes* | Claude API key — all agents use `claude-sonnet-4-5` |
| `OPENROUTER_API_KEY` | Yes* | Alternative to Anthropic direct — takes priority if set |
| `OPENROUTER_MODEL` | No | Model override when using OpenRouter (default: `anthropic/claude-sonnet-4-5`) |
| `OPENAI_API_KEY` | Yes | Used for `text-embedding-3-small` (1536 dimensions) |
| `DEEPGRAM_API_KEY` | Yes | Transcription via Nova-3 |
| `TELNYX_API_KEY` | Yes | Phone call recording ingestion |
| `TELNYX_PUBLIC_KEY` | Yes | Webhook signature verification |
| `ZOOM_WEBHOOK_SECRET_TOKEN` | Yes | Zoom webhook verification |
| `SIGNAL_CLI_API_URL` | Yes | signal-cli REST API URL (Railway private: `http://signal-cli.railway.internal:8080`, local: `http://localhost:8080`) |
| `SIGNAL_CLI_NUMBER` | Yes | Simon's dedicated Signal number in E.164 format |
| `PORT` | No | Server port (defaults to 3000; set automatically on Railway) |
| `RAILWAY_PUBLIC_DOMAIN` | Yes | Public URL used when constructing webhook callback URLs |
| `TAVILY_API_KEY` | No** | Tavily Search API key — Researcher agent web search (free tier: 1,000/month) |
| `FIRECRAWL_API_KEY` | No** | Firecrawl API key — Researcher agent structured crawling (free tier: 500/month) |

*Set either `ANTHROPIC_API_KEY` (direct) or `OPENROUTER_API_KEY` (OpenRouter). If both are set, `OPENROUTER_API_KEY` takes priority.

**Required only if the Researcher agent's `search_web` or `crawl_structured` tools are used.

---

## Development

### Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev:agents` | Start agent server in watch mode |
| `pnpm dev:web` | Start Next.js frontend in dev mode |
| `pnpm build` | Build all packages and apps |
| `pnpm typecheck` | Type-check all packages |
| `pnpm lint` | Lint all packages |
| `pnpm db:generate-types` | Regenerate Supabase TypeScript types |
| `pnpm --filter @platform/db seed:brand-voice` | Sync `docs/brand-voice.md` into `brand_assets` table |

All commands are orchestrated through Turborepo, which handles build order and caching based on the dependency graph.

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
| `research_monitors` | Scheduled research monitoring — subjects, search queries, digests, notification routing |
| `fastmail_accounts` | Fastmail JMAP accounts for email polling (credentials stored in DB, managed via web UI) |
| `fastmail_exclusions` | Email addresses/domains excluded from processing |
| `fastmail_sync_state` | Per-account sync cursor state |

### RPC wrappers (`packages/db/src/rpc/`)

| Function | Description |
|----------|-------------|
| `vectorSearch()` | Semantic similarity search over `knowledge_items` (pgvector HNSW) |
| `graphTraverse()` | Graph traversal over `knowledge_connections` via recursive CTE |
| `fulltextSearch()` | Postgres FTS over `knowledge_items.raw_content` |

---

## Agents

Full specifications are in `docs/agents/`. Summary:

| Agent | Type | Role |
|-------|------|------|
| **Simon** | Agent | Central coordinator. Only agent that communicates with directors via Signal. Detects conflicts, tracks capacity gaps, dispatches to specialists. |
| **Recorder** | Workflow + Agent | Ingests phone (Telnyx) and video (Zoom) recordings, transcribes via Deepgram, extracts entities, syncs to CRM, proposes tasks. |
| **Archivist** | Agent | Manages the knowledge base. Processes URLs and YouTube videos, maps connections, answers knowledge queries via hybrid search. |
| **PM** | Workflow + Agent | Triages tasks from `agent_activity`, manages projects, tracks risks, monitors blocked tasks. |
| **BA** | Agent | Elicits and structures requirements with multi-round clarification loops (Mastra suspend/resume). |
| **Content Creator** | Agent | Drafts and iterates content, enforces brand consistency, adapts across formats. All publishing is human-approved. |
| **Researcher** | Workflow + Agent | Acquires, verifies, and structures web information. Handles fact verification, deep research, URL ingestion, and topic monitoring. Feeds Archivist knowledge base. |
| **Della (RM)** | Agent | CRM management, customer understanding, relationship health, pipeline advice. Analyses Fastmail email via JMAP polling. |

### Approval philosophy

Operations graduate from human-confirmed → batch approval → autonomous based on track record. The following are **always human-approved** regardless of track record:

- Emails
- Published content
- CRM contact/company creation

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

- **Start**: `node dist/index.js`
- **Health check**: `GET /health` (30s timeout)
- **Restart policy**: on failure, max 3 retries

Set all environment variables (see above) in your Railway service settings.

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
| AI model | `anthropic/claude-sonnet-4-5` | all agents |
| Embedding model | `text-embedding-3-small`, 1536 dims | Archivist, Recorder |
