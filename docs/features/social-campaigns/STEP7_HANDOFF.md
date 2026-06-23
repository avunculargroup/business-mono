# Step 7 — Campaign Strategy Workflow (handoff)

**For:** the next session picking up Social Campaigns after Steps 0–6.
**Prereq reading:** `docs/social-campaign-workflows-flow.md` (Workflow 1) and
`docs/social-campaigns-spec.md` (wizard → canvas UI). Skim the **Step 6 variant
workflow** (`apps/agents/src/workflows/variant/`) — it is your template for
everything below.

## Goal / done-when

A strategy and beat plan can be **created, reviewed, and approved through two
human gates**, and the campaign `strategy` **locks** on plan approval.

```
Margot strategy synthesis → GATE 1 (suspend) → persist strategy, status=strategy_approved
  → Margot beat plan + schedule → GATE 2 (suspend) → lock strategy, persist beats,
     status=plan_approved
```

Fan-out (spawning a variant run per beat × account) is **Step 8**, not Step 7.
Step 7 ends at a locked, plan-approved campaign with persisted `campaign_beats`.

## What to build

### 1. The workflow — `apps/agents/src/workflows/strategy/`

Mirror the variant workflow's structure exactly:

- `schemas.ts` — input (`{ campaignId }` — the campaign row already holds objective/
  audience/accounts/cadence from the wizard), the `strategy` object schema (shape
  in `social-campaigns-spec.md` → `campaigns.strategy`), the beat schema, the two
  gate **resume** + **suspend** schemas, the run state, the result.
- `prompts.ts` (pure, unit-tested) — `buildStrategyPrompt(ctx)` and
  `buildBeatPlanPrompt(ctx)`. Margot reads objective, `audience_filter` +
  `audience_persona`, the company `brand_voice` (via `packages/voice` —
  `resolveCompanyVoiceBlock`), and prior-campaign learnings (published
  `content_items` + `post_metrics` + promoted `voice_snippets`).
- `schedule.ts` (pure, unit-tested) — distribute (beat × participating account)
  across `post_slots` over `duration_weeks`, honouring `posts_per_week`.
  **Phase 1: simple in-order fill, `posts_per_week` is a TOTAL across accounts**
  (see open question below). Produces a plan the Gate 2 UI renders.
- `persist.ts` (pure, unit-tested) — map Margot's beats → `campaign_beats` rows
  (sequence, title, core_message, rationale, prefer_thread).
- `index.ts` — the steps + `createWorkflow(...).then(...).commit()`:
  1. `synthesise_strategy` (Margot) → strategy object. Use
     `stepRequestContext('strategy.synthesise')` + `structuredOutput`.
  2. `gate1` (suspend, strategy review). On resume-approve: persist `strategy`,
     set `status='strategy_approved'`, `strategy_approved_at/by`.
  3. `plan_beats` (Margot) → ordered beats + schedule.
  4. `gate2` (suspend, plan review). On resume-approve: persist beats, **lock
     `strategy`** (application-layer: set `status='plan_approved'`,
     `plan_approved_at/by`; reject later strategy edits when status ≥ plan_approved),
     leave the schedule plan where Step 8 fan-out can read it.
- `run.ts` — `startStrategyRun({campaignId})` + `resumeStrategyRun({runId, step,
  resumeData})`. **Two gates**, so — unlike the variant's single gate — you need
  the newsletter's gate-targeting: copy `gateStepForStatus` / `inspectSuspendedGate`
  / `extractSuspendPayload` from `apps/agents/src/workflows/startNewsletterRun.ts`.

Register the workflow in `apps/agents/src/mastra/index.ts` (`workflows:` map) and
add `strategy.synthesise` + `strategy.plan_beats` to `MODEL_SCOPES`
(`packages/shared/src/modelScopes.ts`, `fallbackAgent: 'margot'`) + a
`WORKFLOW_LABELS` entry.

### 2. Gate persistence + web resume

Same web→DB→agents pattern as Step 6. The campaign IS the gate's home — persist
gate context on the `campaigns` row (add columns mirroring the variant gate:
`workflow_run_id`, `gate_state`, `pending_decision` — a new small migration), and
add a `strategyGateWeb` listener (copy `listeners/variantGateWeb.ts`) that claims
`campaigns.pending_decision` and resumes. Register it in the mastra index.

### 3. The creation wizard (web)

`apps/web/app/(app)/campaigns/` — the wizard, then the editable canvas. Four steps
(`social-campaigns-spec.md` → "Campaign creation"):
1. Objective & audience (writes a `campaigns` row, `status='draft'`).
2. Accounts & cadence (`campaign_accounts`, `posts_per_week`, `post_slots`,
   `duration_weeks`, `start_date`).
3. Strategy review → **resume Gate 1** (server action writes `pending_decision`).
4. Plan review (beats + calendar) → **resume Gate 2**.

After creation, collapse to an editable canvas. Mobile-friendly. Reuse the design
patterns + tokens from `VariantEditor` and the existing step-indicator aesthetic
(gold active step, success-green completed). Use the `bts-design` skill.

The wizard kicks off the workflow by calling `startStrategyRun` — but the web
can't reach the agents server, so mirror the newsletter on-demand pattern: either
arm a one-off routine, or (simpler) have the wizard's "generate strategy" write a
row/flag a listener reacts to. Decide and document.

## Deferred-from-Step-5 item that lands here

**Wire Margot onto Simon's conversational roster.** Add `margot` to
`simon.agents` (`apps/agents/src/agents/simon/index.ts`), add a routing line to
Simon's prompt (and the "your specialist team" list), and **add a
`simon-routing.eval.ts` fixture** for a campaign/marketing directive
(`apps/agents/evals/simon-routing/fixtures.json`). Run
`pnpm --filter @platform/agents test:eval` locally (real LLM, not in CI) to
confirm routing. Per the flow-doc open question, Phase 1 leans **standalone**
for Margot's conversational re-entry (run her, write back) rather than resuming
the parent workflow.

## Open questions to settle (don't skip)

- **`posts_per_week`: per-account or total?** Phase 1 treats it as a **total**
  distributed across participating accounts. Confirm with the founders before
  building `schedule.ts`; it changes the scheduler's arithmetic.
- **Where the schedule lives between Gate 2 and fan-out.** Variants don't exist
  until Step 8. Options: store the approved plan as JSONB on `campaigns` (e.g.
  `schedule_plan`), or recompute at fan-out from `post_slots` + beats. Pick one
  and note it for Step 8.
- **Strategy lock enforcement.** It's application-layer (no DB trigger). Enforce
  in the server actions / canvas edit path: reject `strategy` edits once
  `status` is `plan_approved` or later.

## Reusable code map (copy these patterns)

| Need | Reference |
|------|-----------|
| Step + suspend/resume gate, structured agent output | `apps/agents/src/workflows/variant/index.ts` |
| Multi-gate start + resume orchestration, gate targeting | `apps/agents/src/workflows/startNewsletterRun.ts` |
| Web→DB→agents gate resume listener | `apps/agents/src/listeners/{variantGateWeb,newsletterGateWeb}.ts` |
| Web gate panel (approve / request-change) | `apps/web/components/content/NewsletterRunStatus.tsx`, `components/campaigns/VariantEditor.tsx` |
| Voice context for Margot | `packages/voice` (`resolveVoiceContext`) + `apps/agents/src/lib/voicePrompt.ts` |
| Model-scope registration | `packages/shared/src/modelScopes.ts` |
| Pure-helper + unit-test split | `apps/agents/src/workflows/variant/{prompts,persist}.test.ts` |

## Verify

- `pnpm --filter @platform/agents typecheck && pnpm --filter @platform/agents test`
- `pnpm --filter @platform/web typecheck`
- New campaign tables/columns are cast to `any` until `db:generate-types` runs
  post-merge (see `seedVoice.ts` / `workflows/variant/index.ts` for the pattern).
- Mastra Studio: run the `strategy` workflow with `{ campaignId }` against a
  seeded campaign; step through both gates.

## Then → Step 8

Fan-out: on plan approval, spawn one **Variant Generation run** per
(beat × participating account) via the Mastra child-workflow API, fire-and-track
each `workflow_run_id` to `agent_activity`. **Verify the installed child-workflow
API first** (Step 0 discipline) — check `node_modules/@mastra/core/dist/docs/`.
Then the matrix view (`v_campaign_matrix`) and ready-to-post queue
(`v_ready_to_post`).
