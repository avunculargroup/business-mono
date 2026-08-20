# `apps/demo` — the public platform demo

A working copy of the BTS operations platform running on invented data. It exists to show
the architecture — the approval loop, the deterministic-before-LLM boundary, the compliance
gate — to people who cannot be shown the real thing, because the real thing contains
clients.

Deployed public and `noindex`. No auth, no database, no writes.

```bash
pnpm --filter @platform/demo dev     # http://localhost:3000
pnpm --filter @platform/demo build
```

## How it differs from `apps/web`

By its **data source** and nothing else. Both apps code against the repository interfaces in
`@platform/data`; `apps/web` mounts the Supabase adapter, this app mounts
`@platform/data-fixtures`. That is the whole difference, and it is enforced rather than
observed:

- **The demo cannot reach a database.** It does not depend on `@platform/data-supabase`,
  `@platform/db`, or any Supabase package, transitively. `lib/boundary.test.ts` asserts the
  full runtime dependency closure, so acquiring one goes red rather than going unnoticed.
- **Every write is refused by the adapter**, with a `DemoWriteBlockedError` naming the real
  Postgres table it would have touched. There is no runtime "is this the demo?" check
  anywhere in the app.
- **`mode` drives chrome and copy only.** It is read in exactly one place — `DemoChip` — to
  label a surface. A component branching on `mode` to change behaviour means the two apps
  have started to diverge and the seam has failed; grep for it during review.

## Two things that are easy to break

**Relative dating.** Every fixture date is an offset from `ReadContext.asOf`, resolved at
read time, so the staged scenario is always "today, yesterday, last week". Two things defeat
it:

1. **Static prerendering**, which evaluates `new Date()` once at build time and bakes the
   result into HTML — a demo built in August would still call August "today" in December,
   and the research digest would be permanently empty. `app/layout.tsx` sets
   `export const dynamic = 'force-dynamic'` for this reason. Removing it breaks the demo
   silently: the pages still render, they are just quietly wrong.
2. **An absolute date in a fixture.** See
   [`fixture-and-trace-schema.md` § The relative dating rule](../../docs/features/demo-app/fixture-and-trace-schema.md#the-relative-dating-rule).

**Routes without fixtures.** The nav lists exactly the surfaces that have data behind them.
A dead link on a page whose whole job is to be trustworthy costs more than a missing
section.

## What is here and what is not

Phase 5 shipped the scaffolding and the plumbing: the seven routes, the shell, the fixture
adapter and the wiring between them. The fixtures themselves are **placeholders** — enough
rows to prove pagination has a boundary and every surface renders. The curated set, the
staged narrative and every word of prose are Phase 6, and go past Lex before they ship.

The routes render with local markup rather than the platform's own components, which still
live in `apps/web`. They move into `@platform/ui` in Phase 7, which is when the two apps
start sharing them for real.

See [`docs/features/demo-app/build-progress.md`](../../docs/features/demo-app/build-progress.md)
for the plan and what each phase actually shipped.
