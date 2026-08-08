# Assumptions — Portfolio Demo App

**Platform:** Bitcoin Treasury Solutions Internal Platform
**Feature:** `apps/demo`
**Status:** Draft
**Last updated:** 2026-08-07

---

This bundle was written from feature specs, the design brief, and the platform schema. It
was not written against the live repository. Everything below is an assumption that must
be confirmed before Session 1 writes any code.

Per the schema-drift principle: verify live state, do not assume implementation state
from documentation.

---

## Must verify before Session 1

**1. Monorepo layout and workspace tool.**
The bundle assumes `apps/` and `packages/` with a workspace manager (pnpm, npm, or Turbo).
Confirm which, confirm whether `packages/` already exists, and confirm the TypeScript
path alias convention in use. If the repo is currently a single Next.js app with no
workspace configuration, Session 1 gains a step and roughly doubles in size.

**2. Component location and coupling.**
The extraction to `packages/ui` assumes components are reasonably separable from data
fetching. If server components fetch inline — which is the natural App Router pattern and
therefore likely — the extraction is larger than it looks. Audit before starting:

```bash
grep -rl "createClient\|supabase" apps/hq/**/*.tsx | wc -l
```

If that number is above roughly thirty, consider splitting Session 1 in two: extract
`packages/data` and refactor fetching first, extract `packages/ui` second.

**3. Design token location.**
Canonical source is `.claude/skills/bts-design/`. Confirm how tokens currently reach the
app — a Tailwind config, a CSS variables file, or both. `packages/ui` must consume the
same source rather than forking a copy. Note the known typo: `SKILL.md` quick reference
lists Inter as the body font; the correct body font is DM Sans, per `DESIGN_BRIEF.md` and
every other source. Do not propagate the typo into the new package. Worth fixing at
source while in there.

**4. Whether `v_contracts_overview` exists in the live database.**
`contract-feature-spec.md` is marked Draft. The view may not be deployed. Check with
Supabase MCP:

```sql
select table_name from information_schema.views
where table_schema = 'public' and table_name like 'v_%';
```

If contracts are not built, either drop the contracts surface from the demo or build the
view as part of Session 1. Do not build a fixture for a feature that does not exist in
the real app — a demo showing something unbuilt is the one failure mode that is actually
dishonest rather than merely awkward.

**5. `daysUntilDecision` does not exist.**
The renewal decision deadline (`renewal_date - notice_period_days`) is specified in the
adapter contract but is not in the view as written in the spec. Adding it is a small
migration. Take the migration fingerprint before and after:

```sql
select max(version), count(*) from supabase_migrations.schema_migrations;
```

**6. Mastra workflow observability.**
Session 3 assumes the daily compliance workflow can be observed step by step and that
suspend/resume state is inspectable. Verify against the installed version's embedded docs
at `node_modules/@mastra/core/dist/docs/` before writing the recorder. If step-level
observation is not available in the installed version, the fallback is instrumenting the
workflow to emit trace events directly — more invasive, and worth knowing before Session
3 starts rather than during it.

**7. Vercel project configuration.**
Assumes the existing Vercel project has a root directory set to `apps/hq` or equivalent.
If it deploys from the repo root, adding `apps/demo` may change what the existing project
builds. Check before creating the second project.

**8. Subdomain availability.**
`demo.btreasury.com.au` assumed available. Confirm DNS control and that nothing else
claims it.

---

## Accepted risks

**Session 1 touches working production code.** The extraction refactor has no user-facing
benefit and a real chance of introducing regressions in `apps/hq`. Mitigation: do it on a
branch, verify by walking every page manually rather than trusting types, and commit
before Session 2 begins. If time is short and the demo is urgent, a temporary fork is a
defensible tactical choice — but it will rot, and the cost of un-forking later is higher
than doing this now.

**Fixture maintenance is ongoing.** Every new field in a read model requires a fixture
update. The compile failure is the alarm and is intended. If it becomes genuinely
obstructive, the escape hatch is making fixture types `Partial<>` with runtime defaults —
but that trades the drift alarm for convenience and should be a deliberate decision, not
a quiet one.

**The trace ages.** A run recorded today reflects today's agent. Date-stamp it and accept
the drift, or re-record quarterly. Date-stamping is cheaper and more honest.

---

## Explicitly deferred

- Responsive and PWA behaviour. The demo inherits whatever `packages/ui` provides. The
  sidebar is currently static 240px with no media queries, which means the demo will not
  work well on a phone — and recruiters do open links on phones. This is a real gap.
  Recommendation: do the three-tier sidebar collapse in `packages/ui` during Session 1
  while already in that code, rather than treating it as separate work. It benefits both
  apps and it is the difference between a link that survives being opened on a train and
  one that does not.
- Findings Engine surfaces. Spec complete but unbuilt. Add to the demo once built; the
  fixture staging above deliberately seeds a stalled deal and a quiet-day run so the
  surfaces have somewhere to land.
- Client-facing companion app. Out of scope entirely, and should stay out — it is a
  different audience with different compliance obligations.

---

## Open decision for Chris

The bundle assumes the demo shows BTS branding and real feature names. The alternative is
a neutrally-branded version with the domain abstracted, which reduces compliance surface
substantially but also removes most of what makes the work interesting — the domain
specificity is the strongest signal in the whole thing.

Recommendation: keep BTS branding, keep the domain, and spend the effort on the fixture
and disclosure discipline in `demo-app-spec.md` instead. A generic project-management demo
is indistinguishable from a thousand others. A compliance platform for an AFSL
Authorised Representative, with an agent that knows when to say nothing, is not.
