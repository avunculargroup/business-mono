# Spec Bundle — Portfolio Demo App

**Platform:** Bitcoin Treasury Solutions Internal Platform
**Feature:** `apps/demo` — public, fixture-backed demonstration of the internal platform
**Status:** Draft, reconciled against the live repo 2026-08-08
**Last updated:** 2026-08-08

---

## Purpose

A publicly reachable web app that demonstrates the internal platform to recruiters and
technical evaluators, without exposing BTS data, without a live database, and without
running LLM inference on an unauthenticated URL.

The demo is **not a fork**. It is the same UI bound to a different data adapter. This is
the central constraint of the bundle and the reason the build sequence is ordered the way
it is.

---

## Read this first

This bundle was originally written from feature specs and the schema rather than against
the repository, and several of its assumptions turned out to be wrong — two of its four
flagship surfaces do not exist, and the agent run it proposed to record cannot suspend.
[`build-progress.md`](./build-progress.md) records the verification pass, the four
decisions taken, and the phase plan that replaces the three-session sequence this file
used to describe.

**[`build-progress.md`](./build-progress.md) is the current plan. The documents below are
the reference material it builds from.**

---

## Document map

| Document | Purpose | Read before |
|---|---|---|
| `build-progress.md` | **Review of this bundle against the repo, the settled decisions, and the ten-phase plan** | Everything |
| `README.md` | This file — purpose, architecture, non-goals | Everything |
| `demo-app-spec.md` | Feature spec: scope, routes, annotation layer, deployment | Phases 5–9 |
| `repository-contract.md` | The adapter contract — interfaces both apps implement | Phase 4 |
| `fixture-and-trace-schema.md` | Fixture shapes, narrative staging, agent trace format | Phases 6 and 8 |
| `assumptions.md` | The original assumptions and how each one resolved | Before any code |

---

## Architecture in one paragraph

`@platform/ui` holds every presentational component and the design tokens.
`@platform/data` holds a set of repository interfaces plus two implementations:
`@platform/data-supabase` (used by `apps/web`) and `@platform/data-fixtures` (used by
`apps/demo`). Neither app imports Supabase or fixtures directly — both receive a repository
bundle through a provider at the app root. The demo therefore inherits every UI change made
to the real app, and any component that reaches around the seam to query Supabase directly
will fail the demo build. That build failure is the point: it is the enforcement mechanism
for the boundary, not an inconvenience.

A third consumer — a client-facing app reusing the same UI — is anticipated but not
scoped here. It is the reason the seam covers all of `apps/web` rather than only the demo
surfaces. See [`build-progress.md`](./build-progress.md) for the one design rule that
follows from it: scoping belongs at bundle construction, never in a method signature.

---

## Build sequence

**Superseded.** This file originally specified three Claude Code sessions. That sequence
assumed a repository layout that does not exist (`apps/hq`, `@bts/*` packages) and a
Supabase coupling roughly a third of its actual size.

The current plan is ten phases in [`build-progress.md`](./build-progress.md). The ordering
principle it keeps from the original is sound and worth restating: **the seam is extracted
before the demo exists**, because retrofitting it afterwards means doing the same refactor
twice, once per app, with two chances to diverge.

What changed:

- Visual regression baselines are captured **first**, before any extraction, because
  baselines taken afterwards cannot prove a refactor was inert.
- The seam is built as independent domain verticals rather than one refactor, with the
  demo's surfaces first and a defined stopping point.
- Fixture authoring is its own phase. It is writing, not data entry.
- The recorded trace is the `variant` workflow, not a Simon run — Simon is an Agent and
  cannot suspend.

---

## Non-goals

- Multi-tenant demo accounts, or any auth beyond a public read-only surface
- Live LLM inference on the public URL (see `demo-app-spec.md` for the gated exception)
- Feature parity with `apps/web` — the demo shows a curated subset, deliberately
- Any client-facing use. This is a portfolio artefact. A client-facing app is a separate
  piece of work with a different audience and different compliance obligations; the seam
  is built so as not to foreclose it, and nothing here should be taken as designing it.
