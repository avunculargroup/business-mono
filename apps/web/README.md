# @platform/web

Next.js 15 App Router frontend for the BTS agent platform. Deployed to Vercel.

**Last updated:** 2026-08-11

## Getting started

```bash
# From the monorepo root
pnpm install

# Copy the example env and fill in your Supabase credentials
cp apps/web/.env.example apps/web/.env.local

# Run the dev server
pnpm --filter @platform/web dev
```

The app runs at `http://localhost:3000`.

**You will land on a login page.** `middleware.ts` gates every route except `/login` and
the public `/share/<id>` links, and there is no self-serve sign-up — the login form calls
`signInWithPassword` only. Create the first user in the Supabase dashboard under
**Authentication → Users → Add user**, ticking "Auto Confirm User". RLS gives any
authenticated team member read/write across the app tables, so one user sees everything.

## Environment variables

`.env.example` is the reference and documents each key's failure mode. In short:

| Variable | Required | Unset behaviour |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | App cannot start |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | App cannot start |
| `OPENROUTER_API_KEY` | No | Dashboard credits card reads "Credits unavailable" |
| `OPENAI_API_KEY` | No | Podcast transcript search fails with a humane message |
| `NEXT_PUBLIC_RESEARCH_INBOUND_DOMAIN` | No | Inbound-address preview defaults to `btreasury.com.au` |
| `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` | No | LinkedIn "Connect" returns `?error=not_configured` |

The optional four each disable exactly one feature, and the UI says so rather than
failing — that is deliberate, so a partial local setup is still usable.

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start Next.js dev server |
| `pnpm build` | Production build |
| `pnpm start` | Start production server |
| `pnpm typecheck` | Run TypeScript type checking |
| `pnpm lint` | Run Next.js linting |
| `pnpm test` | Run the Vitest suite |
| `pnpm test:watch` | Vitest in watch mode |

## Routes

Everything under `app/(app)/` sits inside the authenticated shell (sidebar + header).

| Route | Purpose |
|---|---|
| `/` | Dashboard — approvals queue, activity, indicators, credits |
| `/activity` | `agent_activity` audit trail and approve/reject actions |
| `/simon` | Conversational interface to Simon |
| `/crm` | Contacts, companies, and the discovery sub-sections: `personas`, `segments`, `interviews`, `champions`, `community` |
| `/company` | Single-company view |
| `/projects`, `/tasks` | PM surfaces — list, detail, kanban and table views |
| `/content` | Content pipeline (kanban + editor) and the newsletter approval gates |
| `/campaigns` | Campaign strategy, beats, and per-platform variants with compliance state |
| `/news` | Research feed, `daily` digest, `sources` management, and `podcasts` (see below) |
| `/market-reports` | Daily narrated market reports — published, held, or un-narrated |
| `/research` | Corporate research register — companies holding bitcoin, by tier. No holdings figure on this page by design |
| `/research/[slug]` | One company's record — position, ledger, qualitative facts, stated absences, withheld list |
| `/research/jurisdictions` | Accounting and listing-rule notes, keyed on standard and venue rather than on company |
| `/signals` | Ecosystem change feed |
| `/discovery` | `pipeline`, `lexicon`, `templates`, `feedback` |
| `/products`, `/advisors` | Ecosystem registers — human-maintained, no agent writes |
| `/routines` | Scheduled agent routines |
| `/brand` | Brand hub — assets and the voice editor |
| `/decks`, `/docs`, `/files` | Supporting workspace pages |
| `/settings` | `integrations` (Fastmail, LinkedIn), `team`, `models` (per-agent/per-step model selection) |

Outside the shell: `/login`, and `/share/<id>` for files marked public.

Two route folders carry their own detailed READMEs, and both are worth reading as worked
examples of the house pattern — server component fetches, client component renders:

- [`app/(app)/news/podcasts/README.md`](<./app/(app)/news/podcasts/README.md>) — the
  fullest UI reference in the repo: file map, transcript lifecycle, cost model.
- [`../../docs/features/ecosystem/README.md`](../../docs/features/ecosystem/README.md) —
  the `/products` and `/advisors` trees.

## Project structure

```
app/
  (app)/              # Authenticated shell — see the route table above
  actions/            # ~50 server actions, one module per domain
  api/                # Route handlers (LinkedIn OAuth callback)
  login/              # Public login page
  share/              # Public file-share links
components/           # One directory per domain (crm, content, news, podcasts, campaigns…)
  ui/                 # Shared primitives: Button, Modal, DataTable, Toast, StatusChip…
  app-shell/          # Sidebar, PageHeader, shell layout
hooks/                # useEntityForm, useEntityList, useOptimisticList, useRealtimeSubscription…
lib/
  supabase/           # Browser and server client setup
  news/, podcasts/, indicators/, onchain/, decks/, ecosystem/, linkedin/
providers/            # ToastProvider, UserProvider
middleware.ts         # Auth session refresh + route protection
```

## Testing

```bash
pnpm --filter @platform/web test
```

Put a `*.test.ts` or `*.test.tsx` next to the module. The extension picks the environment —
`vitest.config.ts` defines two projects, `node` for `*.test.ts` (pure logic) and `jsdom` for
`*.test.tsx` (components, via React Testing Library with `@testing-library/jest-dom`
matchers from `test/setup.ts`). A new component test only needs the `.tsx` extension to
land in the right one.

Tests run against TypeScript source through the `resolve.alias` entries in
`vitest.config.ts`, so workspace packages do not need building first.

Two conventions worth following:

- Prefer role, text and attribute queries over CSS-module class names.
- Test server-component pages by mocking `@/lib/supabase/server` with the chainable fake in
  `test/mocks/supabase.ts` and stubbing the interactive client child with `vi.mock`, then
  asserting query wiring and prop hand-off. `app/(app)/crm/companies/page.test.tsx` is the
  reference.

## Workspace dependencies

- `@platform/data` — repository interfaces and read models; no database client of its own
- `@platform/data-supabase` — the live implementation of those interfaces, which is how pages
  and server actions read and write
- `@platform/db` — Supabase client, generated types, RPC wrappers
- `@platform/shared` — shared types, constants, enums
- `@platform/ui` — design tokens and shared presentational components

It does **not** import `@platform/signal` or `@platform/voice` — both are agent-server only —
and never `@platform/data-fixtures`, which exists for `apps/demo`.

Pages converted to the repository seam call `getRepositories()` (`lib/repositories.ts`); server
actions call `getAuthedRepositories()` (`lib/action.ts`). Surfaces not yet converted still use
`@/lib/supabase/server` directly — see the vertical table in
[`build-progress.md`](../../docs/features/demo-app/build-progress.md) for which is which.

## Design references

- **Visual design**: invoke the `bts-design` skill for colours, typography, spacing,
  component specs and CSS tokens. Do not read `docs/DESIGN_BRIEF.md` directly — it is
  backing data for the skill, and the skill is the implementation source of truth.
- **UI copy**: [`../../docs/brand-voice.md`](../../docs/brand-voice.md) → UI Microcopy Rules
  — action label patterns, empty states, banned phrases.
