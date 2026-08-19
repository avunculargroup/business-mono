# Feature Spec — Portfolio Demo App

**Platform:** Bitcoin Treasury Solutions Internal Platform
**Feature:** `apps/demo`
**Status:** Draft, reconciled against the live repo 2026-08-08
**Last updated:** 2026-08-08

---

## Overview

`apps/demo` is a public, read-only, fixture-backed instance of the internal platform. Its
audience is recruiters, hiring managers, and technical evaluators. Its job is to make
three things legible in under four minutes:

1. That the platform is a real, coherent product rather than a set of screenshots
2. That the architecture is deliberate — deterministic scoring before narration, publish
   gates, hub-and-spoke agents
3. That the person who built it can explain why

Point 3 is the one that converts. Most portfolio apps demonstrate that something works
and leave the evaluator to infer the reasoning. The annotation layer removes the
inference step.

---

## Scope

### In scope

- Read-only demo of a curated subset of platform surfaces
- Fixture-backed data adapter with no runtime network dependency
- Recorded agent trace replay demonstrating suspend/resume approval
- Annotation overlay explaining architectural decisions in place
- Public disclosure chrome (demo data, not financial advice)
- Independent Vercel deployment on its own subdomain

### Out of scope

- Any write path to a real datastore
- Any Supabase dependency, including read-only anon access
- Live agent inference, except the single gated path described below
- Auth, accounts, or session state beyond client-side UI preferences
- Mobile-first layout work — the demo inherits whatever `@platform/ui` provides. Do not
  fix responsive behaviour here; fix it in the shared package or not at all.

---

## Surfaces to include

Include enough breadth to show the platform is a system, and enough depth in one area to
show it is not a shell. Four surfaces at demonstration depth and three at glance depth.

**This table was re-derived after verification.** The original named Compliance obligations
and Contracts at Full depth; neither exists in the platform — no tables, no views, no
routes, across 93 migrations. Per the rule in `assumptions.md` — do not fixture a feature
that does not exist — they are dropped rather than built or faked.

| Surface | Depth | What it demonstrates |
|---|---|---|
| Market reports | Full | The materiality floor: findings computed deterministically, then narrated. Includes the quiet-day path |
| Research feed | Full | Unified `news_items` surface across heterogeneous source types, with curator notes and rubric scoring |
| Agent activity + approval | Full | Hub-and-spoke architecture, suspend/resume, full provenance |
| Content pipeline | Full | Publish gate, draft vs published embedding boundary, Lex compliance verdicts |
| Dashboard / indicators | Glance | Metric deltas rendered neutrally; that the platform has a live data layer |
| Ecosystem signals | Glance | Change detection with compliance classification |
| CRM | Glance | That the CRM exists and findings have somewhere to point |

Market reports replaces Compliance as the lead surface and is a straight upgrade: it
carries both `deterministic-before-llm` and `quiet-day-path`, the two principles the spec
cared most about, and unlike Compliance it is real.

Deliberately excluded: brand voice snippets and the voice profile system. It is the most
BTS-specific surface, hardest to make legible to an outsider in seconds, and the fixtures
would need to be entirely invented to avoid exposing actual positioning. Also excluded:
podcasts, campaigns, decks, discovery, projects and tasks — all built, none load-bearing
for the story, and each one added is fixture surface to maintain.

---

## Routes

```
/                       Landing — what this is, who built it, entry points
/market-reports         Report list, materiality-banded
/market-reports/[id]    Report detail, findings and narration boundary
/news                   Research feed, mixed source types
/news/[id]              Item detail with segment provenance and curator note
/activity               Agent activity log
/agents/run/[traceId]   Trace replay — the centrepiece
/content                Content pipeline, draft vs published
/signals                Ecosystem signals glance view
/crm/companies          CRM glance view
/architecture           Written architecture notes, linked from annotations
```

Routes mirror `apps/web` wherever a surface exists there, so a component moved into
`@platform/ui` needs no route-aware branching. `/agents/run/[traceId]` and `/architecture`
are demo-only.

`/agents/run/[traceId]` should be linked prominently from the landing page. Assume a
recruiter clicks exactly one thing.

---

## Demo chrome

### Disclosure banner

Persistent, in the app chrome, not the footer. Present on every route.

> Demonstration data. All organisations, contacts and figures are fictional. Nothing here
> constitutes financial advice.

Styling: `--color-surface-subtle` background, `--color-text-secondary` text, 1px
`--color-border` bottom edge. It should read as a system notice, not a marketing badge.
No gold — gold is reserved for freshness indicators and primary actions.

### Demo mode indicator

A small persistent chip in the sidebar footer reading `Demo data`. On hover or tap, it
explains that the app is running against a fixture adapter and links to `/architecture`.

### Write blocking

Interactive controls stay visible and enabled. Attempting a write throws
`DemoWriteBlockedError` from the fixture adapter, which the UI catches and renders as a
toast:

> This action is disabled in the demo. In the live platform this would write to
> `content_items` and log to `agent_activity`.

The toast naming the actual table is doing real work — it tells an evaluator that the
write path exists and what it touches. Disabled greyed-out buttons communicate nothing.

---

## Annotation layer

The differentiating feature. A toggle in the app chrome switching between **Product view**
(clean, as the real app looks) and **Architecture view** (annotated).

### Behaviour

In Architecture view, annotated regions receive a 1px `--color-gold` outline and a
numbered marker. Clicking a marker opens a side panel with the annotation body. Markers
are keyboard navigable. The overlay must not reflow the underlying layout — use absolute
positioning against a relative container, driven by a `data-annotation-id` attribute on
the target element.

Default state is Product view. Show the real thing first; let the evaluator opt into the
explanation.

### Annotation content model

```ts
interface Annotation {
  id: string;
  targetSelector: string;      // matches data-annotation-id
  route: string;
  title: string;               // <= 60 chars
  body: string;                // markdown, 2-4 sentences
  principle?: PrincipleKey;    // links to /architecture
  order: number;
}

type PrincipleKey =
  | 'deterministic-before-llm'
  | 'publish-gate'
  | 'curator-notes'
  | 'quiet-day-path'
  | 'neutral-delta-colour'
  | 'hub-and-spoke'
  | 'compliance-as-alignment';
```

`PrincipleKey` is unchanged. Seven of the eight originally required annotations survived
the surface re-pick; only the contracts notice-period one died, and it was the single
annotation with no principle attached.

### Required annotations

At minimum, one per principle. The following are non-negotiable because they are the
points where the architecture is least likely to be inferred correctly:

| Route | Target | Principle | Point to make |
|---|---|---|---|
| `/market-reports` | A quiet-day report | `quiet-day-path` | The system says there is nothing material rather than manufacturing insight |
| `/market-reports/[id]` | The findings/narration boundary | `deterministic-before-llm` | Findings are computed and committed first; the narrating agent cannot reference data outside that payload |
| `/news/[id]` | Curator note field | `curator-notes` | The human annotation explaining why something was saved is what separates this from generic retrieval |
| `/news` | Rubric score on an item | `deterministic-before-llm` | The composite is arithmetic over scored dimensions, not a model's overall impression |
| `/` | Any metric delta | `neutral-delta-colour` | No green-up/red-down. Treated as compliance-adjacent, not a style preference |
| `/agents/run/[id]` | The suspend point | `hub-and-spoke` | Specialists never speak to a person; approval crosses a defined boundary |
| `/content` | Draft vs published state | `publish-gate` | Drafts are never embedded; embeddings generate on publish |
| `/content` | A Lex verdict | `compliance-as-alignment` | Compliance review is a gate in the pipeline, not a checkbox after the fact |

Write these in plain declarative prose. No exclamation marks. An evaluator skimming eight
annotations in ninety seconds should come away able to describe the architecture to
someone else.

---

## Agent trace replay

See `fixture-and-trace-schema.md` for the `TraceBundle` schema. Behaviour requirements:

- The replayer drives the same components the live app uses. Components receive an
  `AgentRunState` and do not know its origin.
- Synthetic timing derived from recorded deltas, compressed: cap any single gap at 1200ms
  and total run time at roughly 45 seconds. Real agent runs have dead air that reads as a
  broken page.
- Transport controls: play, pause, step forward, step back, restart, and a `2x` toggle.
  Step-back is what lets someone actually study the suspend boundary.
- Deep-linkable step index in the URL hash so a specific moment can be shared.

### The approval channel

**Changed after verification.** The original specified that human approval appears as an
inbound Signal-style message, on the grounds that approval arriving over Signal rather than
a web form is a design decision worth making visible. That is true of the newsletter
workflow, but the recorded run is the `variant` workflow, which is web-gated.

Render the actual mechanism instead, and label it as deliberately: the agent server is not
reachable over HTTP from the web app, so `/content` writes
`content_items.pending_decision` and a Supabase Realtime listener claims it atomically
before resuming the suspended run. Show the column write and the claim as distinct steps.
This is a real distributed-systems decision and reads as one; a fake chat bubble would not.

### Gated live path (optional, ship last)

One hardcoded prompt against one agent, behind an IP-keyed rate limit of five runs per
day globally, with a server-side kill switch via environment variable. If the budget or
the limit is exhausted, fall back silently to the recorded trace with a notice.

Only build this if every earlier phase is complete and stable. The recorded trace is the
product; the live path is a flourish. An evaluator who hits a rate-limit error page has a
worse experience than one who never knew the option existed.

---

## Compliance considerations

BTS operates as an Authorised Representative under an AFSL. This app will be publicly
reachable and carries BTS branding.

- Every fixture organisation, contact, and figure must be unmistakably fictional. No
  real ASX-listed entities, no real family offices, no real advisers. Use invented names
  that do not resolve to a real business in an ASIC search.
- No fixture may present a bitcoin allocation percentage, target, or recommendation, even
  as illustrative data. Allocation figures on a public URL under BTS branding are the
  single highest-risk element of this build. Where a screen structurally requires an
  allocation field, use a redacted placeholder rather than a number.
- Research feed fixtures must not reproduce publisher content. Titles and one-line
  paraphrased summaries only. Do not paste abstracts from ARK or Fidelity material.
- Run the fixture set past Lex's classification rules before deploying, and record the
  outcome in `agent_activity` on the live platform so the review is auditable.
- The disclosure banner is a mitigation, not a defence. It does not license content that
  would otherwise be a problem.

---

## Deployment

A separate Vercel project, deployed from `main`. The existing project's Root Directory is
confirmed as `apps/web`, so adding a second app cannot change what it builds.

### Project settings

| Setting | Value | Why |
|---|---|---|
| Root Directory | `apps/demo` | Mirrors `apps/web`. Makes cross-app build interference structurally impossible rather than merely unlikely |
| Include source files outside Root Directory | On | A pnpm-workspace app cannot build without `packages/*`. Already on for `apps/web` by inference — it deploys successfully |
| Build Command | `cd ../.. && pnpm turbo run build --filter=@platform/demo` | `@platform/db` and `@platform/shared` resolve to `dist/`, so they must compile first. `turbo.json` already declares `build: dependsOn: ["^build"]` — this just invokes it. Mirror whatever `apps/web` uses rather than inventing a second pattern |
| Ignored Build Step | `npx turbo-ignore @platform/demo` | Skips the build when neither the app nor its dependencies changed. Without it every push to `main` rebuilds both projects; with it, an `apps/agents`-only change builds neither and a `@platform/ui` change correctly builds both |
| Node version | 22 | Matches `.github/workflows/test.yml`. A mismatch means CI green and Vercel red |
| Environment variables | **None at all** | Not an empty Supabase key — no entries. Then the "no Supabase dependency" claim is enforced by the platform, and the audit below is a glance rather than a review |

Enable **Turborepo Remote Caching** across both projects (`vercel link` + `turbo login`,
free on Vercel). Once `@platform/ui` and `@platform/data` are shared, the projects compile
the same packages; remote cache means the second downloads that work instead of repeating
it. This gets more valuable if a client app becomes a third consumer.

### Domain and indexing

- Subdomain: `demo.btreasury.com.au` — verified unclaimed. Do not deploy under `hq.`,
  which already resolves to Vercel; the hostname split is part of the security story, and
  separate projects are what make it real rather than asserted.
- **`robots.txt` and a `noindex` meta tag disallow indexing.** This reverses the original
  spec, which allowed indexing on the grounds that being findable is the point. Settled the
  other way: passive search discovery is the least valuable channel for a link pasted into
  applications, and disallowing it removes the failure mode with real teeth — a client or
  counterparty searching for BTS and landing on fabricated client records under BTS
  branding. Reasoning in `assumptions.md`.
- Open Graph card with a screenshot of the annotated agent run view. This now matters
  *more*, not less: with indexing off, link-pasting is the only distribution channel, so
  the preview does all the work.

### Code-side

- Add `@platform/ui`, `@platform/data` and `@platform/data-fixtures` to the demo's
  `transpilePackages` in `next.config.ts`. They ship raw TS/TSX and CSS Modules.
- Audit the project's environment variables after first deploy. If a Supabase key is set,
  something has gone wrong.

### Unrelated but adjacent

While in the Vercel settings, consider **Deployment Protection on the `apps/web` project**.
Preview deployments get public URLs by default, which for an internal tool holding real CRM
data is a larger exposure than this demo will ever be. Vercel Authentication on previews
closes it. Out of scope for this build; noted because the settings visit is already
happening.

---

## Success criteria

- The demo builds and runs with network access disabled
- `apps/demo/package.json` has no Supabase, Mastra, or AI SDK dependency
  (`@platform/shared` is safe — verified as a pure leaf with zero runtime dependencies)
- A UI change made in `@platform/ui` appears in both apps without further edits
- A recruiter can reach the agent replay in one click from the landing page
- Someone with no context can describe "deterministic before LLM" after using it

---

## Open questions

- **Trace freshness.** A recorded trace ages as the agent evolves. Consider a quarterly
  re-record, or accept staleness and date-stamp the trace in the UI. Date-stamping is
  cheaper and arguably more honest.
- **Whether to show the real design tokens.** The demo exposes the full palette and type
  scale to anyone who views source. This is fine — it is a design system, not a secret —
  but worth a conscious decision rather than a default.
- **Landing page copy authorship.** This is the one surface where the demo needs prose
  that does not exist in the real app. Charlie could draft against the brand voice profile,
  but a portfolio piece speaking in the company's voice about an individual's work is a
  slightly odd register. Recommend writing it in first person, plainly. The same tension
  applies to fixture authoring — see the ownership note in `build-progress.md`.

**Resolved since drafting:** fixture drift in CI now has an operational policy with a
pre-agreed escape hatch (`build-progress.md`), sized against measured migration velocity
rather than left as an open question.
