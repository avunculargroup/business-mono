# Social Campaigns — feature workspace

Strategy layer above the content pipeline: a **campaign** → ordered **beats** →
per-account, per-platform **variants** that flow through draft → approved →
published with a compliance check and a human gate at each variant.

This folder is the **working hub** for the build. The canonical specs live in
`docs/` (root) and are the source of truth; this README orients a new session and
points at the live state.

## Source-of-truth specs (read these, don't duplicate)

| Doc | What it covers |
|-----|----------------|
| `docs/CAMPAIGNS_BUILD_ORDER.md` | **The spine.** Step-by-step build order + the live "resume here" state. Start here. |
| `docs/social-campaigns-spec.md` | Data model, views, agents, UI page structure |
| `docs/social-campaign-workflows-flow.md` | The two Mastra workflows (strategy + variant), gate flow, fan-out |
| `docs/brand-voice-migration-spec.md` | Voice tables + resolver (Steps 1–3) |
| `docs/brand-hub-voice-ux-flow.md` | Brand Hub voice editor UX |
| `docs/agents/margot.md`, `docs/agents/compliance.md` | Margot (marketer) and Lex (compliance) agent specs |

## Current state (branch `claude/social-campaigns-build-order-xDKFW`)

Steps 0–6 are built and on the branch (4 migrations, gated on merge). See the
build-order doc's "resume here" table for the authoritative per-step state.

- **0–3** Voice foundations + `packages/voice` + voice milestone — merged to `main` (PR #232). Step 3 parity gate (retire `brand-voice.md`) still pending a local secrets-equipped run.
- **4** Campaigns schema — `supabase/migrations/20260622000000_add_campaigns_schema.sql`.
- **5** Margot agent (`apps/agents/src/agents/margot/`). **Lex converged on the shared compliance agent** (`apps/agents/src/agents/compliance/`, from the on-chain feature) — not a second `lex`.
- **6** Variant Generation workflow (`apps/agents/src/workflows/variant/`) + Gate 3 web editor (`apps/web/components/campaigns/VariantEditor.tsx`, `app/(app)/campaigns/variants/[id]/page.tsx`) + the `variantGateWeb` resume listener. Built end-to-end; needs a live pass.
- **7** Campaign Strategy workflow (`apps/agents/src/workflows/strategy/`) — resolve-context → Margot strategy synthesis → **Gate 1** → Margot beat plan + deterministic schedule → **Gate 2** → persist beats + `schedule_plan`, lock strategy (`status=plan_approved`). Migration `20260623000000` adds the campaign gate columns (`workflow_run_id`/`gate_state`/`pending_decision`/`schedule_plan`). Web: creation wizard (`apps/web/components/campaigns/CampaignWizard.tsx`, `app/(app)/campaigns/new/`), list (`app/(app)/campaigns/page.tsx`), and the canvas + two gate panels (`CampaignWorkspace.tsx`, `app/(app)/campaigns/[id]/page.tsx`); server actions in `app/actions/campaigns.ts`; `strategyGateWeb` listener launches/resumes. Margot is now on Simon's roster (+ a routing eval fixture). Built end-to-end; typecheck + tests green; **needs a live pass** (Studio + a real wizard run with secrets).

### Step 7 decisions (open questions, settled with the documented Phase-1 defaults)

- **`posts_per_week` = total** across accounts (not per-account). Drives `schedule.ts`.
- **Approved schedule lives on `campaigns.schedule_plan`** (JSONB) — Step 8 fan-out reads it; not recomputed.
- **Strategy lock = application-layer** in `app/actions/campaigns.ts` (gate decisions are rejected once `status` is past `strategy_approved`).
- **Launch pattern**: the wizard writes `campaigns.pending_decision = { decision: 'start' }`; `strategyGateWeb` reacts and calls `startStrategyRun` (no run id yet). Gate resumes reuse the same `pending_decision` channel once `workflow_run_id` is set.

## Next

**Step 8 — Fan-out.** On plan approval, spawn one Variant Generation run per (beat × account) from the persisted `schedule_plan`. Then the matrix view + ready-to-post queue. See `docs/CAMPAIGNS_BUILD_ORDER.md` Step 8.

## Verify locally

```bash
pnpm --filter @platform/agents typecheck && pnpm --filter @platform/agents test
pnpm --filter @platform/web typecheck
```

Migrations apply on merge to `main` (CI). Type regen (`pnpm db:generate-types`)
is a post-merge follow-up — campaign tables are cast to `any` until then.
