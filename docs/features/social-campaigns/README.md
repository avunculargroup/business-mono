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

## Next

**Step 7 — Campaign Strategy Workflow.** See [`STEP7_HANDOFF.md`](./STEP7_HANDOFF.md).

## Verify locally

```bash
pnpm --filter @platform/agents typecheck && pnpm --filter @platform/agents test
pnpm --filter @platform/web typecheck
```

Migrations apply on merge to `main` (CI). Type regen (`pnpm db:generate-types`)
is a post-merge follow-up — campaign tables are cast to `any` until then.
