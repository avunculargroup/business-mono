# @platform/web

Next.js 15 frontend for the BTS agent platform. Deployed to Vercel.

## Getting started

```bash
# From the monorepo root
pnpm install

# Copy the example env and fill in your Supabase credentials
cp apps/web/.env.example apps/web/.env.local

# Run the dev server
pnpm --filter @platform/web dev
```

The app will be available at `http://localhost:3000`.

## Environment variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous (public) API key |

Both are required. Copy `.env.example` to `.env.local` and fill them in.

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start Next.js dev server |
| `pnpm build` | Production build |
| `pnpm start` | Start production server |
| `pnpm typecheck` | Run TypeScript type checking |
| `pnpm lint` | Run Next.js linting |

## Project structure

```
app/
  (app)/              # Authenticated app shell (sidebar + header)
    page.tsx          # Dashboard
    activity/         # Agent activity feed
    brand/            # Brand asset library
    content/          # Content pipeline (kanban board + editor)
    crm/              # CRM — contacts and companies
    projects/         # Project list and detail
    settings/         # Team and integrations settings
    simon/            # Simon chat interface
    tasks/            # Task board (kanban + table views)
  actions/            # Server actions (contacts, tasks, content, approvals, auth)
  login/              # Public login page
components/
  agent/              # Agent activity cards, approval controls
  app-shell/          # Sidebar, page header, app shell layout
  content/            # Content board, editor
  crm/                # Contact/company forms, lists, detail views
  simon/              # Simon thread, compose area, message bubbles
  tasks/              # Kanban board, task form, task views
  ui/                 # Shared UI primitives (Button, Modal, DataTable, Toast, etc.)
lib/
  supabase/           # Browser and server Supabase client setup
  utils.ts            # Formatting helpers
providers/
  ToastProvider.tsx    # Toast notification context
middleware.ts         # Auth session refresh + route protection
```

## Workspace dependencies

This app imports from two workspace packages:

- `@platform/db` — Supabase client, generated types, RPC wrappers
- `@platform/shared` — Shared TypeScript types, constants, enums

It does **not** import from `@platform/signal` (that is agent-server only).

## Design references

- **Visual design**: `docs/design-brief.md` — colours, typography, spacing, component specs, CSS tokens
- **Brand voice**: `docs/brand-voice.md` — tone, terminology, microcopy rules
