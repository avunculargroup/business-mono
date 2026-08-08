# Feature Spec — Portfolio Demo App

**Platform:** Bitcoin Treasury Solutions Internal Platform
**Feature:** `apps/demo`
**Status:** Draft
**Last updated:** 2026-08-07

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
- Mobile-first layout work — the demo inherits whatever `packages/ui` provides. Do not
  fix responsive behaviour here; fix it in the shared package or not at all.

---

## Surfaces to include

Include enough breadth to show the platform is a system, and enough depth in one area to
show it is not a shell. The recommended split is four surfaces at demonstration depth and
two at glance depth.

| Surface | Depth | What it demonstrates |
|---|---|---|
| Compliance obligations | Full | Urgency banding, severity, recurrence, the AR structure as a feature |
| Contracts | Full | Notice-period logic surfacing a decision deadline rather than an expiry date |
| Research feed | Full | Unified `news_items` surface across heterogeneous source types |
| Agent activity + approval | Full | Hub-and-spoke architecture, suspend/resume, full provenance |
| CRM pipeline | Glance | That the CRM exists and the findings have somewhere to point |
| Content pipeline | Glance | Publish gate, draft vs published embedding boundary |

Deliberately excluded: brand voice snippets and the voice profile system. It is the most
BTS-specific surface, hardest to make legible to an outsider in seconds, and the fixtures
would need to be entirely invented to avoid exposing actual positioning.

---

## Routes

```
/                       Landing — what this is, who built it, entry points
/compliance             Obligations list, urgency-banded
/compliance/[id]        Obligation detail
/contracts              Contract list with renewal decision deadlines
/contracts/[id]         Contract detail, lifecycle timeline, variable values panel
/research               Research feed, mixed source types
/research/[id]          Item detail with segment provenance
/agents                 Agent activity log
/agents/run/[traceId]   Trace replay — the centrepiece
/pipeline               CRM glance view
/content                Content pipeline glance view
/architecture           Written architecture notes, linked from annotations
```

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
> `compliance_obligations` and log to `agent_activity`.

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

### Required annotations

At minimum, one per principle. The following are non-negotiable because they are the
points where the architecture is least likely to be inferred correctly:

| Route | Target | Principle | Point to make |
|---|---|---|---|
| `/compliance` | Urgency band on a 6-day item | `deterministic-before-llm` | The band is computed in a view, not decided by a model |
| `/contracts` | Decision deadline column | — | Notice period makes the deadline earlier than the expiry; this is the whole reason the field exists |
| `/research` | Any metric delta | `neutral-delta-colour` | No green-up/red-down. Treated as compliance-adjacent, not a style preference |
| `/agents/run/[id]` | The suspend point | `hub-and-spoke` | Simon is the only human-facing agent; the others never speak to a person |
| `/agents/run/[id]` | The payload handed to the narrator | `deterministic-before-llm` | Facts are committed first; the narrating agent cannot reference data outside this payload |
| `/agents` | A quiet-day entry | `quiet-day-path` | The system says there is nothing material rather than manufacturing insight |
| `/content` | Draft vs published state | `publish-gate` | Drafts are never embedded; embeddings generate on publish |
| `/research/[id]` | Curator note field | `curator-notes` | The human annotation explaining why something was saved is what separates this from generic retrieval |

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
- The human approval message appears as an inbound Signal-style message. Label the channel
  explicitly — the fact that approval arrives over Signal rather than a web form is a
  design decision worth making visible.
- Deep-linkable step index in the URL hash so a specific moment can be shared.

### Gated live path (optional, ship last)

One hardcoded prompt against one agent, behind an IP-keyed rate limit of five runs per
day globally, with a server-side kill switch via environment variable. If the budget or
the limit is exhausted, fall back silently to the recorded trace with a notice.

Only build this if Sessions 1 to 3 are complete and stable. The recorded trace is the
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

- Separate Vercel project, root directory `apps/demo`, deployed from `main`.
- Subdomain: `demo.btreasury.com.au`. Do not deploy under `hq.` — the hostname split is
  part of the security story.
- No environment variables containing secrets. If the demo project has a Supabase key set
  in Vercel, something has gone wrong; audit the project settings after first deploy.
- `robots.txt` allows indexing. Being findable is the point.
- Open Graph card with a screenshot of the annotated agent run view. The link will be
  pasted into applications and messages; the preview does meaningful work.

---

## Success criteria

- The demo builds and runs with network access disabled
- `apps/demo/package.json` has no Supabase, Mastra, or AI SDK dependency
- A UI change made in `packages/ui` appears in both apps without further edits
- A recruiter can reach the agent replay in one click from the landing page
- Someone with no context can describe "deterministic before LLM" after using it

---

## Open questions

- **Fixture drift.** When `apps/hq` adds a field, `@bts/data-fixtures` will fail to
  compile until the fixture is updated. That is intended. The question is whether the
  demo should be in the same CI gate as `hq` — blocking a real feature on fixture
  maintenance may become annoying. Recommendation: same gate initially, revisit if it
  bites more than twice.
- **Trace freshness.** A recorded trace ages as the agent evolves. Consider a quarterly
  re-record, or accept staleness and date-stamp the trace in the UI. Date-stamping is
  cheaper and arguably more honest.
- **Whether to show the real design tokens.** The demo exposes the full palette and type
  scale to anyone who views source. This is fine — it is a design system, not a secret —
  but worth a conscious decision rather than a default.
- **Landing page copy authorship.** This is the one surface where the demo needs prose
  that does not exist in the real app. Carri's register is the right fit; Charlie could
  draft against the brand voice profile, but a portfolio piece speaking in the company's
  voice about an individual's work is a slightly odd register. Consider writing it in
  first person, plainly.
