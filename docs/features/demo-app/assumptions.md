# Assumptions — Portfolio Demo App

**Platform:** Bitcoin Treasury Solutions Internal Platform
**Feature:** `apps/demo`
**Status:** Verified against the live repo 2026-08-08. All eight resolved.
**Last updated:** 2026-08-08

---

This bundle was written from feature specs, the design brief, and the platform schema. It
was not written against the live repository. Everything below was an assumption; each now
carries its verified answer.

Per the schema-drift principle: verify live state, do not assume implementation state
from documentation. That principle held up — four of the eight assumptions were wrong, two
of them fatally.

Full write-up of what the verification found is in
[`build-progress.md`](./build-progress.md).

---

## Resolved

**1. Monorepo layout and workspace tool.** ✅ Mostly as assumed, wrong names throughout.

pnpm workspaces (`pnpm@9.15.0`) + Turborepo, `apps/*` and `packages/*`. But the app is
**`apps/web`, not `apps/hq`**, and packages are **`@platform/*`, not `@bts/*`**.
`packages/` already exists with `db`, `shared`, `signal` and `voice` — note `voice` is
undocumented in the root `CLAUDE.md`. TypeScript path aliases: `apps/web` has exactly one,
`@/*` → `./*`. Every shell command in the original bundle referenced `apps/hq` and did not
run.

**2. Component location and coupling.** ❌ **Far worse than the threshold this assumption
set.**

The original test was: above roughly thirty files, split the extraction in two. Measured:

| Metric | Count |
|---|---|
| Files containing `createClient` | 105 |
| Non-test files importing `@/lib/supabase` | 81 |
| Files with a real `.from(` call | 54 |
| `page.tsx` fetching inline | 47 of 68 |
| Server-action files in `app/actions/` | 42 |

The corrected audit command:

```bash
grep -rl "createClient\|@/lib/supabase" apps/web --include=*.tsx --include=*.ts | wc -l
```

Server components do fetch inline, as this assumption predicted. `app/(app)/layout.tsx`
queries Supabase itself and `middleware.ts` constructs a fourth client inline. This is why
the seam is now built as eleven domain verticals rather than one session.

**3. Design token location.** ❌ Wrong source named; the typo was real.

Canonical source is **`apps/web/app/globals.css`** (74 custom properties), not
`.claude/skills/bts-design/`. The skill's `colors_and_type.css` is a *third* copy — with
`docs/DESIGN_BRIEF.md` as the second — and had already drifted: it defines
`--color-agent-pending` which globals lacks, while globals defines `--color-warning-subtle`,
`--color-surface-active`, `--tap-highlight`, `--press-scale` and `--sidebar-collapsed-width`
which it lacks.

**No Tailwind anywhere.** No `tailwind.config.*`, no PostCSS. Styling is CSS Modules (128
of them) plus CSS custom properties. Fonts load via a raw `<link>` in `app/layout.tsx`, not
`next/font`.

The **DM Sans / Inter typo was real and is fixed** — `SKILL.md:17` was the only place in
the skill saying Inter; its own `README.md:101`, `README.md:256` and
`colors_and_type.css:46` all said DM Sans, as do `DESIGN_BRIEF.md:107` and `globals.css:48`.

**4. Whether `v_contracts_overview` exists.** ❌ **No — and neither does anything else
about contracts.**

No `contracts` table, no `contract_templates`, no `v_contracts_overview`, across 93
migrations and the generated types. Zero column matches for `renewal`, `evergreen` or
`notice_period` in any `.sql` file.

This assumption anticipated exactly the right failure and stated the right rule: "Do not
build a fixture for a feature that does not exist in the real app." Applied as written —
contracts is dropped from the demo rather than built or faked.

Same answer for compliance: no `compliance_obligations` table, no
`v_compliance_dashboard`, no `/compliance` route. Only `compliance_snippets` and a set of
compliance columns on `content_items`.

Three of the five views the adapter contract referenced do exist: `v_open_tasks`,
`v_recent_interactions`, `v_contacts_overview`. There are 23 views in total. Note
`schema.sql` documents only 8 and carries a stale `agent_activity.status` CHECK — it is a
lagging reference. **Migrations win.**

**5. `daysUntilDecision` does not exist.** ✅ Correct, and moot.

It is a two-level gap, not a one-level one: the field is missing *and* so is the view *and*
so is the table. Dropped along with the contracts surface.

**6. Mastra workflow observability.** ❌ Wrong workflow, and the recommended check is not
the useful one.

There is no daily compliance workflow. Simon cannot be recorded either — it is a Mastra
`Agent`, and only workflows suspend. The eight registered workflows are `recorder`, `pm`,
`executeRoutine`, `pruneStorage`, `ecosystemScan`, `newsletter`, `variant`, `strategy`.

`node_modules/@mastra/core/dist/docs/` cannot be read in a fresh checkout until
`pnpm install` runs. More usefully, **the hook already exists and is already in production
use**: `spanOutputProcessors` on the `Observability` config
(`apps/agents/src/mastra/index.ts:103-120`), with
`apps/agents/src/observability/agentActivityProcessor.ts` as a working reference. A recorder
is a second `SpanOutputProcessor`; no workflow instrumentation is needed. Pinned:
`@mastra/core ^1.54.0`, `@mastra/observability ^1.16.3`.

One trap: that processor hardcodes `VALID_AGENT_NAMES` at line 19 and silently drops spans
for `lex`, `editor`, `marketAnalyst` and `newsVerifier`. Do not copy the filter.

**7. Vercel project configuration.** ⚠️ Unresolvable from the repo — **still needs a human.**

There is no `vercel.json` anywhere; deploy config lives in the Vercel dashboard. Check
before creating the second project whether the existing one builds from repo root or from
`apps/web`; if the former, adding `apps/demo` changes what it builds.

`apps/web/next.config.ts` carries only
`transpilePackages: ['@platform/db', '@platform/shared']` — the load-bearing line every new
package must join.

**8. Subdomain availability.** ✅ Available.

`demo.btreasury.com.au` does not resolve (NXDOMAIN); nothing claims it.
`hq.btreasury.com.au` resolves to `216.198.79.1`, a Vercel address — so the hostname split
the spec relies on is already real. Apex and `www` resolve elsewhere (`89.106.200.1`).

---

## Accepted risks

**The seam touches working production code.** Unchanged, and larger than this document
originally assumed — see resolution 2. Mitigations: build it as independent domain
verticals, each walked manually and committed before the next; capture visual-regression
baselines *before* any extraction; keep `apps/web` shippable at every commit. The temporary
fork remains a defensible tactical choice if the demo becomes urgent, with the same caveat:
it will rot, and un-forking later costs more.

**Fixture maintenance is ongoing.** Measured, not hypothetical: 25 migrations in the three
weeks to 2026-08-03, many touching demo-surface tables directly. Expect the compile alarm
roughly weekly. [`build-progress.md`](./build-progress.md) carries an operational policy
with a pre-agreed escape hatch.

The escape hatch named here — making fixture types `Partial<>` with runtime defaults —
should **not** be taken. It trades the drift alarm away permanently for a convenience that
moving the demo typecheck to a nightly job provides without loss.

**The trace ages.** Unchanged. Date-stamp it and accept the drift.

---

## Explicitly deferred

- **Responsive and PWA behaviour.** The sidebar is static 240px with no media queries, so
  the demo will not work well on a phone — and recruiters do open links on phones. This is
  a real gap. The original recommendation was to fold the three-tier collapse into the
  extraction work "while already in that code". Rejected on reflection: it is `apps/web`
  work that benefits both apps and should be justified on its own merits, not smuggled into
  a refactor whose whole safety argument rests on being behaviour-preserving.
- **Findings Engine surfaces.** Now built — `apps/agents/src/lib/findings/` with a
  materiality floor, surfaced at `/market-reports`. Promoted into the demo, where it
  carries both `deterministic-before-llm` and `quiet-day-path`.
- **Client-facing companion app.** Originally ruled "out of scope entirely, and should stay
  out". Softened to a **deferral**: it is under active consideration, and it is the reason
  the seam covers all of `apps/web` rather than only demo surfaces. It stays out of *this*
  build, and the reasoning behind the original prohibition still stands and must be
  answered before it starts — a client surface delivered by an Authorised Representative
  under an AFSL is regulated activity, with a different bar from a portfolio artefact.
  Note also that it invalidates the current RLS posture, documented in `CLAUDE.md` as
  "authenticated team members can read/write everything (two-person team)".

---

## Resolved decision for Chris

The bundle assumed BTS branding and real feature names, with the alternative a neutrally
branded version. **Settled: keep BTS branding and the domain, but serve `noindex`.**

The reasoning in the original recommendation holds — a compliance platform for an AFSL
Authorised Representative, with an agent that knows when to say nothing, is not
interchangeable with a thousand generic project-management demos, and the domain
specificity is the strongest signal in the whole thing. What changed is the indexing half.
Passive search discovery is the least valuable channel for a link pasted into applications,
and dropping it removes the one failure mode with real teeth: a client or counterparty
searching for BTS and landing on fabricated client records under BTS branding.

This reverses `demo-app-spec.md`'s "robots.txt allows indexing. Being findable is the
point."
