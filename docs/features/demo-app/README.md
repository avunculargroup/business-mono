# Spec Bundle — Portfolio Demo App

**Platform:** Bitcoin Treasury Solutions Internal Platform
**Feature:** `apps/demo` — public, fixture-backed demonstration of the internal platform
**Status:** Draft
**Last updated:** 2026-08-07

---

## Purpose

A publicly reachable web app that demonstrates the internal platform to recruiters and
technical evaluators, without exposing BTS data, without a live database, and without
running LLM inference on an unauthenticated URL.

The demo is **not a fork**. It is the same UI bound to a different data adapter. This is
the central constraint of the bundle and the reason the build sequence is ordered the way
it is.

---

## Document map

| Document | Purpose | Read before |
|---|---|---|
| `README.md` | This file — document map, build sequence, session boundaries | Everything |
| `demo-app-spec.md` | Feature spec: scope, routes, annotation layer, deployment | Sessions 2 and 3 |
| `repository-contract.md` | The adapter contract — interfaces both apps implement | Session 1 |
| `fixture-and-trace-schema.md` | Fixture shapes, narrative staging, agent trace format | Sessions 2 and 3 |
| `assumptions.md` | What this bundle assumes, what must be verified first | Session 1, before any code |
| `build-progress.md` | Review of this bundle against the live repo, and the revised plan that follows | **Everything — read before this file** |

---

## Architecture in one paragraph

`packages/ui` holds every presentational component and the design tokens.
`packages/data` holds a set of repository interfaces plus two implementations:
`@bts/data-supabase` (used by `apps/hq`) and `@bts/data-fixtures` (used by `apps/demo`).
Neither app imports Supabase or fixtures directly — both receive a repository bundle
through a provider at the app root. The demo therefore inherits every UI change made to
the real app, and any component that reaches around the seam to query Supabase directly
will fail the demo build. That build failure is the point: it is the enforcement mechanism
for the boundary, not an inconvenience.

---

## Build sequence

Three Claude Code sessions, in order. Session 1 is the only one that touches `apps/hq`,
and it is the one most likely to go wrong. Do not begin it with uncommitted work in the
tree.

### Session 1 — Extract the seam

**Touches:** `apps/hq`, new `packages/ui`, new `packages/data`
**Does not touch:** `apps/demo` (does not exist yet)

1. Verify live state against `assumptions.md` before writing anything. Confirm the
   workspace tool in use, confirm the current `apps/` layout, confirm whether
   `packages/` already exists.
2. Create `packages/ui`. Move presentational components and design tokens out of
   `apps/hq`. Canonical token source remains `.claude/skills/bts-design/` — the package
   consumes it, it does not replace it.
3. Create `packages/data` with the interfaces defined in `repository-contract.md`.
   Interfaces and types only in this step. No implementations.
4. Implement `@bts/data-supabase` against those interfaces by lifting the existing query
   code out of `apps/hq` route handlers and server components.
5. Refactor `apps/hq` to consume repositories through the provider. `apps/hq` behaviour
   must be unchanged at the end of this session. Verify by walking the existing pages,
   not by trusting the type checker.

**Done when:** `apps/hq` runs identically, and `grep -r "createClient" apps/hq/` returns
only the provider wiring and auth.

**Do not proceed to Session 2 until `apps/hq` is verified working and committed.**

### Session 2 — Demo app and fixtures

**Touches:** new `apps/demo`, new `@bts/data-fixtures`
**Does not touch:** `apps/hq`

1. Scaffold `apps/demo` as a Next.js App Router app. No Supabase dependency in its
   `package.json` at all — this is a hard constraint, verified by inspection.
2. Implement `@bts/data-fixtures` against the same interfaces. Static typed objects,
   no runtime fetch, no filesystem reads at request time.
3. Author the fixture set per the narrative staging table in
   `fixture-and-trace-schema.md`. Curation matters more than volume here.
4. Build the demo chrome: persistent disclosure banner, demo-mode indicator, landing
   page. Read-only enforcement at the adapter level — writes throw a typed
   `DemoWriteBlockedError` that the UI catches and renders as an explanatory toast.

**Done when:** the demo builds and runs with the network disabled.

### Session 3 — Agent trace replay and annotation layer

**Touches:** `apps/demo`, new `packages/agent-traces`, one recorder script in `apps/hq`

1. Build the recorder. It runs against the real Mastra workflow on Railway and emits a
   `TraceBundle` conforming to the schema in `fixture-and-trace-schema.md`. Before
   writing it, check the installed Mastra version's embedded docs at
   `node_modules/@mastra/core/dist/docs/` for the current run-observation API. Do not
   write it from memory.
2. Record one Simon run end to end: proposal, suspend, human approval, resume, commit
   to `agent_activity`. Redact per the redaction rules in the schema doc.
3. Build the replayer in `apps/demo`. It reads the `TraceBundle` and drives the existing
   agent UI components with synthetic timing. The UI components must not know they are
   being replayed.
4. Build the annotation layer — the overlay toggle described in `demo-app-spec.md`.

**Done when:** a recruiter can watch a suspend/resume approval cycle and read why it is
built that way, with no API key present in the deployment.

---

## Why this order

The seam is extracted first because retrofitting it after `apps/demo` exists means doing
the same refactor twice, once per app, with two chances to diverge. Fixtures come before
traces because the annotation layer needs stable screens to annotate. Traces come last
because they are the only part that depends on a live system, and the only part that can
be shipped in a degraded form (a static screenshot) if time runs short.

---

## Non-goals

- Multi-tenant demo accounts, or any auth beyond a public read-only surface
- Live LLM inference on the public URL (see `demo-app-spec.md` for the gated exception)
- Feature parity with `apps/hq` — the demo shows a curated subset, deliberately
- Any client-facing use. This is a portfolio artefact, not a product surface.
