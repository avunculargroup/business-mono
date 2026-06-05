# Proposed Flow — Social Campaign Mastra Workflows

**Platform:** Bitcoin Treasury Solutions Internal Platform
**Feature:** Mastra workflow architecture for Social Media Campaigns
**Status:** Proposed flow (pre-implementation)
**Last updated:** 2026-06-04

-----

## ⚠️ Read this before writing any code

Everything below is **intent and architecture**, not API signatures. Mastra’s workflow APIs — step definition, suspend/resume, nested/child workflow invocation, and iteration over a collection — change between versions. The pseudocode in this doc is **illustrative shape only**, deliberately not copy-pasteable.

**First implementation action, before anything else:**

1. `ls node_modules/@mastra/` — confirm what’s installed.
1. Look up the current API in the embedded docs: `node_modules/@mastra/core/dist/docs/` (per the `mastra` skill and `CLAUDE.md`).
1. Specifically verify, against the installed version: how steps are defined, how a step **suspends and resumes** with human input, how one workflow **invokes another** (child/nested), how to **iterate** over a collection of items as steps, and how **input/output schemas** are declared (Zod or otherwise).
1. Only then translate the flow below into real code.

This follows the project’s established rule: read spec + schema, verify Mastra API signatures against `node_modules` rather than training data, then implement. Treat a confidently-wrong primitive name as worse than a verification step.

Model strings, when agents are configured, use the `provider/model-name` format (e.g. `anthropic/claude-sonnet-4-5`) — confirm the current convention in the installed version too.

-----

## The shape at a glance

Two workflows, three human gates, a fan-out, and five agents.

```
CAMPAIGN STRATEGY WORKFLOW  (one run per campaign)
  │
  ├─ (branch) Rex — research            [optional]
  ├─ (branch) Bruno — audience analysis [optional]
  ├─ Margot — synthesise strategy
  │
  ╞═ SUSPEND ▸ GATE 1: strategy approval  ──▶ human approves/edits in UI
  │
  ├─ Margot — beat plan + schedule across slots
  │
  ╞═ SUSPEND ▸ GATE 2: plan approval      ──▶ human approves/edits in UI
  │                                           (on resume: LOCK strategy)
  │
  └─ FAN OUT ▸ for each (beat × account):
        spawn VARIANT GENERATION WORKFLOW run

VARIANT GENERATION WORKFLOW  (one run per variant — own workflow_run_id)
  │
  ├─ resolve context (platform, voice, snippets, platform_specs, strategy)
  ├─ (branch) Bruno — framing            [optional]
  ├─ Charlie — generate platform copy (single post or thread segments)
  ├─ Lex — compliance classification + disclaimer decision
  ├─ persist content_item (+ thread_segments) as draft
  │
  ╞═ SUSPEND ▸ GATE 3: per-variant approval ──▶ approve / edit / regenerate
        └─ on "request change": regenerate THIS variant only (Charlie ▸ Lex)
```

Why two workflows and a fan-out rather than one big workflow with a loop: each variant gets its **own `workflow_run_id`**, so a failure, retry, or rejection on one post is fully isolated from its siblings, and `agent_activity` provenance stays clean per post. This matches the suspend/resume + `workflow_run_id` pattern already in the schema.

-----

## Agent roles in the flow

|Agent      |In the flow as                                              |Does                                                                                      |
|-----------|------------------------------------------------------------|------------------------------------------------------------------------------------------|
|**Margot** |Embedded agent in strategy steps **and** standalone delegate|Synthesises the structured strategy; produces the ordered beats and the schedule          |
|**Charlie**|Embedded agent in the variant workflow                      |Writes per-account, per-platform copy to the strategy and voice, conforming to char limits|
|**Lex**    |Embedded agent in the variant workflow                      |Classifies advice risk; decides on disclaimer; advisory, never blocks                     |
|**Bruno**  |Workflow **branch**                                         |Delegated audience/framing analysis                                                       |
|**Rex**    |Workflow **branch**                                         |Trend/competitor research feeding strategy                                                |

Margot’s dual nature is intentional: inside the workflow she runs as a reasoning step; outside it, Simon can delegate to her conversationally (“Margot, rethink beat 3’s angle”), which re-enters the relevant workflow at that point or runs her standalone and writes back.

-----

## Workflow 1 — Campaign Strategy

### Input (intent-level schema)

```
{
  objective: string,
  audience_filter: { industry?: string[], pipeline_stage?: string[], bitcoin_literacy_min?: string },
  audience_persona: string,
  account_ids: uuid[],            // participating social accounts
  post_slots: { day, time, label }[],
  posts_per_week: number,
  duration_weeks: number,
  start_date: date
}
```

### Steps

**Step 1 — Rex research (optional branch).**
Condition: the objective references current events, competitors, or trends. If so, branch to Rex; otherwise skip. Output: a research brief appended to the strategy context. Rex respects the deferred-rate-limit posture already noted for the research stack (Tavily free tier; escalate only when hit).

**Step 2 — Bruno audience analysis (optional branch).**
Condition: the `audience_filter` matches a meaningful CRM segment worth characterising. Bruno reads the matched contacts/companies and returns pain points and framing notes. This is *context-conditioning*, not a recipient list — social is broadcast.

**Step 3 — Margot strategy synthesis.**
Margot reads: `objective`, `audience_filter` + `audience_persona`, the company `brand_voice`, prior-campaign learnings (`content_items` published + `curator_notes` + `post_metrics`), and any Rex/Bruno output. Emits the structured `strategy` object (content pillars, key messages, hooks, tone guidance, do-not-say, success signals — full shape in the campaigns spec).

**▸ GATE 1 — strategy approval (SUSPEND).**
The workflow suspends. The UI renders the `strategy` object editably. On resume with the approved (possibly edited) strategy: persist it to `campaigns.strategy`, set `status = strategy_approved`, log to `agent_activity`.

**Step 4 — Margot beat plan + schedule.**
Margot produces ordered `campaign_beats` (each: `title`, `core_message`, `rationale`, `prefer_thread`). Then she distributes the (beat × account) variants across `post_slots` over `duration_weeks`, honouring `posts_per_week`, writing intended `scheduled_for` per planned variant. (Phase 1: slots are planning targets for manual posting; precise dispatch is Phase 2.)

**▸ GATE 2 — plan approval (SUSPEND).**
The workflow suspends. The UI renders the beat plan and the calendar editably. On resume with approval: persist beats, **lock `campaigns.strategy`** (edits now require a new campaign), set `status = plan_approved`, log to `agent_activity`.

**Step 5 — Fan out.**
For each (beat × participating account), spawn one **Variant Generation Workflow** run. Persist each child `workflow_run_id` against its planned variant for tracing. Set campaign `status = active`.

> **Verify:** how your installed Mastra version spawns/awaits child workflow runs, and whether fan-out should `await` all children or fire-and-track. Recommended: fire-and-track — each variant approves independently, so the parent shouldn’t block on the slowest one.

-----

## Workflow 2 — Variant Generation (one run per variant)

### Input

```
{ beat_id: uuid, social_account_id: uuid, campaign_id: uuid }
```

### Steps

**Step 1 — Resolve context.**
Determine `platform` from the account. Load: account `voice_profile`, company `brand_voice`, the `platform_specs` row for the platform, the campaign `strategy`, the beat `core_message` + `prefer_thread`. Merge voice via `packages/voice` (umbrella + override; `vocabulary_avoid` unioned; Bitcoin capitalisation rule always on). **Retrieve exemplars:** the same `packages/voice` call pulls top-N `voice_snippets` by embedding similarity to the beat’s `core_message`, scoped to `social_account_id = <account> OR NULL` (account + company canon), platform-matched, starred-weighted. These few-shot examples are the single biggest lever on on-voice output — concrete exemplars beat tone adjectives.

**Step 2 — Bruno framing (optional branch).**
Condition: the beat is flagged as needing deeper framing. Otherwise skip.

**Step 3 — Charlie generate copy.**
Charlie writes copy in the resolved voice, to the strategy, conforming to `platform_specs.max_chars`, with the retrieved `voice_snippets` supplied as few-shot exemplars (write *in this register*, don’t copy them). If `prefer_thread` **and** platform is `twitter_x`: emit ordered segments (each within `max_chars`, count ≤ `max_thread_segments`). Otherwise: a single post. Output is structured so the persist step can write either a single `body` or `thread_segments` rows.

**Step 4 — Lex compliance.**
Lex classifies (`educational` / `general_advice` / `personal_opinion`), decides `needs_disclaimer`, selects a `compliance_snippets` key if so, records `compliance_rationale`. **Advisory only — Lex never halts the workflow.** Her verdict is data on the variant; the human decides at the gate.

**Step 5 — Persist as draft.**
Write the `content_item`: `status = draft`, `source = 'charlie'`, `campaign_id`, `beat_id`, `social_account_id`, compliance fields, `disclaimer_snippet_id` where attached, `char_count`. Write `thread_segments` if threaded. Log to `agent_activity` with this run’s `workflow_run_id` and `proposed_actions`.

**▸ GATE 3 — per-variant approval (SUSPEND).**
The workflow suspends. The UI renders the variant in the editor (platform-mimic preview, char counter, Lex chip, voice, image slot). The human:

- **Approve** → resume: `status = approved`, set `approved_by` / `approved_at`, log approval.
- **Request change** → resume into a **regenerate path**: re-run Charlie ▸ Lex for **this variant only** (the regeneration unit is the single variant, never the whole beat), persist the new draft, suspend again at Gate 3.
- **Override a flag** → human accepts a `general_advice` / `personal_opinion` verdict as-is: `compliance_status = overridden`, `compliance_overridden_by` set, logged.

-----

## Cross-cutting concerns

### Compliance re-run on human edit (outside the workflow)

When a human edits copy that was already `cleared` — whether at Gate 3 or later in the content pipeline — the **application layer**, not the workflow, re-invokes Lex and resets `compliance_status` / `compliance_checked_at`. A clear verdict does not survive an edit, because an edit can reintroduce advice risk. This is an API-route/tool responsibility, the same way recurrence creation is handled outside DB triggers in the Compliance feature.

### Agents vs Workflows boundary

Per the project principle: Workflows for deterministic pipelines, Agents for open-ended reasoning. The two workflows here are the **deterministic spine** (resolve → generate → check → persist → gate). Margot, Charlie, and Lex are **embedded agents** invoked at specific steps for the fuzzy reasoning (strategy synthesis, copywriting, classification). Bruno and Rex are branches because their involvement is conditional, not every-run.

### Human-in-the-loop = suspend/resume

All three gates are `suspend` points resumed by a UI action (Phase 1 has no Signal in this feature). The approval-mode logic — human-directed auto-execute vs agent-proposed suspend — is decided by the coordinator layer, consistent with how the rest of the platform handles approvals. Here, every gate is agent-proposed, so every gate suspends.

### Provenance and audit

Every agent action across both workflows logs to `agent_activity`: `agent_name`, `action`, `status` (`pending` → `approved` / `rejected` / `auto`), `trigger_type`, the `workflow_run_id`, and `proposed_actions` / `approved_actions`. The per-variant `workflow_run_id` is the thread that ties a published post back through its approval, its compliance verdict, and the beat and strategy that produced it.

### Errors and retries

Because each variant is its own run, a transient failure (model timeout, rate limit) retries that **one** variant without disturbing approved siblings. Verify the installed version’s retry/error-handling primitives before relying on automatic retry; otherwise surface the failure on the variant and offer a manual “regenerate” in the UI.

-----

## Suggested build order

1. **Verify Mastra APIs** against installed `node_modules` (the section at the top of this doc).
1. **Variant Generation Workflow first**, with stub strategy/beat data — it’s the unit that produces the thing you can see and approve. Prove Charlie ▸ Lex ▸ persist ▸ Gate 3 end-to-end for one single post.
1. **Add threads** to the variant workflow (segment generation + persistence + Gate 3 rendering).
1. **Campaign Strategy Workflow** — Margot synthesis, Gate 1, beat plan + schedule, Gate 2.
1. **Fan-out** wiring strategy → N variant runs.
1. **Optional branches** (Rex, Bruno) once the spine is solid.
1. **Compliance-re-run-on-edit** application-layer hook.

Test each in Mastra Studio (`npm run dev`) before wiring the UI gates.

-----

## Open Questions

- **Fan-out concurrency:** Fire-and-track (recommended) vs await-all. Await-all gives a clean “all variants drafted” moment but blocks on the slowest model call across potentially dozens of runs. Decide against the installed version’s child-workflow ergonomics.
- **Where Margot’s standalone re-entry lands:** When Simon delegates “rethink beat 3” conversationally, does that resume the parent strategy workflow at Step 4, or run Margot standalone and write beats directly? Standalone-write is simpler; workflow-resume keeps a single source of orchestration truth. Lean standalone for Phase 1.
- **Regeneration history:** When a variant is regenerated at Gate 3, the prior draft is overwritten. If “show me the previous draft” is wanted, keep superseded drafts rather than overwriting. Defer until asked.
- **Slot assignment intelligence:** How smart is Margot’s scheduling in Step 4 — does she just fill slots in beat order, or optimise (spacing similar beats, balancing accounts)? Phase 1: simple fill in order. The anti-duplication/staggering question is Phase 2 (it matters once posting is automated).