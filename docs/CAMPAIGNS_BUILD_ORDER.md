# Build Order — Social Media Campaigns

**Platform:** Bitcoin Treasury Solutions Internal Platform
**Feature:** Social Media Campaigns (incl. Brand Voice migration)
**Status:** In progress — Steps 0–2 done & merged; Step 3 seeded (parity gate pending); Step 4 written (gated on merge)
**Last updated:** 2026-06-22

-----

## ▶ Current state — resume here

Steps 0–3 code merged to `main` via **PR #232** (`claude/social-campaigns-preflight-csqIF`),
so the voice foundations migrations are **applied to prod** (`social_accounts` seeded;
`brand_voice` / `voice_snippets` / `match_voice_snippets` live). Step 4 (campaigns schema)
is written on branch **`claude/social-campaigns-build-order-xDKFW`**, not yet merged —
migrations apply to prod **on merge to `main`**.

| Step | State | Evidence |
|------|-------|----------|
| 0 — Pre-flight | ✅ done | `docs/CAMPAIGNS_STEP0_VERIFICATION.md` (commit `eeb68d9`) |
| 1 — Schema foundations | ✅ done, **applied to prod** (PR #232) | `supabase/migrations/20260605120000_add_voice_foundations.sql` (+ `…130000_add_match_voice_snippets.sql`); `social_accounts` seeded (6 rows). Commit `a52280d` |
| 2 — `packages/voice` | ✅ done | resolver + `match_voice_snippets` RPC + embed-on-save, unit-tested. Commit `6164829` |
| 3 — Voice milestone | ⚠️ **seeded; parity gate + doc retirement pending** | agents wiring `a751423`, Brand Hub Voice UI `3d16d0e`. `seed:voice` run (founder confirmed `brand_voice` + canon `voice_snippets` populated). |
| 4 — Campaigns schema | ✅ **written, gated on merge** | `supabase/migrations/20260622000000_add_campaigns_schema.sql`; `schema.sql` + `schema-changes.md` updated. On branch `claude/social-campaigns-build-order-xDKFW` |
| 5 — Agents (Margot, Lex) | ✅ **written, gated on merge** | specs `docs/agents/margot.md` + `lex.md`; agents `apps/agents/src/agents/{margot,lex}/index.ts` (registered in Mastra `agents:` map + `MODEL_SCOPES`); migration `20260622010000_add_campaign_agents.sql` adds `margot`/`lex` to the `agent_name` CHECKs + `VALID_AGENT_NAMES`. Typecheck + 253 tests green. Charlie confirmed reading `packages/voice`. |
| 6 — Variant Generation Workflow | ⚠️ **built end-to-end; needs a live pass** | Workflow `apps/agents/src/workflows/variant/` (resolve-context → Charlie → Lex → persist → **Gate 3**, threads + single-variant regen). Web gate plumbing: migration `20260622020000` (content_items `workflow_run_id`/`gate_state`/`pending_decision`), `variantGateWeb` listener + `resumeVariantRun`. UI: `apps/web/components/campaigns/VariantEditor.tsx` (platform-mimic preview, live char counter, Lex chip, approve / request-change) + `app/(app)/campaigns/variants/[id]/page.tsx` + `submitVariantGateDecision` action. agents + web typecheck clean, 282 agents tests green. **Remaining:** live end-to-end verification (needs secrets + a stub campaign/beat); image slot + alt text and inline copy-edit are deferred (Step 9). |

**Step 3 remaining (the hard parity gate — needs a secrets-equipped env: OpenAI + model key):**

1. ~~Apply migrations~~ ✅ (PR #232). 2. ~~Seed voice content~~ ✅ (`seed:voice` run by founder).
3. **Parity gate** (hard gate — see below) — generate one sample per content agent (Charlie, and the newsletter **editorial** agent which still reads the full doc); confirm table-sourced voice matches doc-era output. **Not runnable in the web env** (no OpenAI/model secrets) — run locally. A ready-to-paste prompt for this exists in the session history.
4. **Only if parity passes:** retire `docs/brand-voice.md` to a stub + update `CLAUDE.md` routing (voice → tables; visual → `bts-design` skill).

**Known follow-ups (non-blocking):**
- Founder-added snippets via the Brand Hub save with `embedding = null` (web has no OpenAI key by design). Needs a small agents-side embed backfill/listener (mirror `contentEmbeddingListener`). Canon snippets are embedded by `seed:voice`.
- Account-voice editing with inheritance ghosting (Brand Hub) is deferred to the campaigns Accounts work; `ChipField` already supports locked chips for it.

**Next:** a **live end-to-end pass** of Step 6 (see below), then **Step 7 — Campaign Strategy Workflow** (Margot, Gate 1/Gate 2) — where Margot's Simon-roster wiring (deferred from Step 5) lands. The Step 3 parity gate remains independent.

**Live verification of Step 6 (do once secrets are available):** apply the branch migrations, insert one `campaigns` row (with a `strategy` JSONB) and one `campaign_beats` row, then run the `variant` workflow with `{ campaignId, beatId, socialAccountId }` (use a seeded `social_accounts` id). It persists a `content_items` draft + suspends at Gate 3, writing `gate_state` + `workflow_run_id`. Open `/campaigns/variants/<contentItemId>` to see the variant editor; approve or request a change. The web writes `pending_decision`; the `variantGateWeb` listener resumes the run. (You can also resume directly in Studio with `{ decision: 'approve' | 'request_change' }`.)

**Deferred Step-6 sub-items (fold into Step 9 / publishing):** image slot + alt text (needs `content_images` upload via `packages/storage`), inline copy editing with compliance re-run (Step 9), and showing the resolved voice block in the editor (not currently in `gate_state`).

**Deferred from Step 5 (do in Step 7):** wiring Margot onto Simon's conversational roster (`simon.agents` + a routing line + a `simon-routing.eval.ts` fixture). Held back until the Campaign Strategy workflow she re-enters exists, so the routing eval can be run against real behaviour. Margot + Lex are registered in the top-level Mastra `agents:` map now, so both are reachable standalone in Studio for the Step 5 isolation check.

> **Note on local testing:** the agent-server code now lists `margot`/`lex` in `VALID_AGENT_NAMES`, but the matching `agent_name` CHECK only accepts them once `20260622010000_add_campaign_agents.sql` is applied. Apply the migration (or merge) before exercising Margot/Lex against a DB, or their `agent_activity` inserts will fail the CHECK. In prod the code and migration ship together on merge, so there's no gap.

-----

## How to use this doc

Each numbered step is a discrete Claude Code session. Every session **reads its listed specs first**, does the work, and stops at its **Done when** line. Don’t merge sessions — the boundaries are where the dependencies and the verification gates live.

The spine is dependency-driven:

```
0  Pre-flight (verify)  →  1  Schema foundations  →  2  packages/voice
→  3  VOICE MIGRATION MILESTONE (shippable)  →  4  Campaigns schema
→  5  Agents (Margot, Lex)  →  6  Variant workflow (the leaf)
→  7  Strategy workflow  →  8  Fan-out  →  9  Loops & polish  →  10  Branches
```

Two things to hold onto:

- **Steps 1–3 are a complete, shippable unit.** If campaigns slip, you’ve still fixed your voice source of truth and gained an editable exemplar library. Treat it as a real milestone.
- **Build the leaf before the tree (step 6 before 7).** You can’t *see* anything until a single variant exists. Building the big strategy workflow first means debugging blind. Build the thing you can look at and approve, then grow upward.

Source specs referenced below:
`brand-voice-migration-spec.md` · `social-campaigns-spec.md` · `social-campaign-workflows-flow.md` · `brand-hub-voice-ux-flow.md`

-----

## ⚠️ Two hard gates — do not skip

1. **Step 0 — API & drift verification.** Mastra primitives and pgvector index types are verified against what’s *installed*, not assumed. A confidently-wrong primitive name poisons everything downstream.
1. **Step 3 — Parity gate.** `brand-voice.md` is not retired until table-sourced voice produces output matching the doc-era output.

-----

## Step 0 — Pre-flight verification

**Reads:** `social-campaign-workflows-flow.md` (top section), `CLAUDE.md`, the `mastra` skill.

Before writing any code:

- Verify the current Mastra workflow API against the installed package’s embedded docs (`node_modules/@mastra/core/dist/docs/`): how steps are defined, how a step **suspends and resumes** with human input, how one workflow **invokes another** (child/nested), how to **iterate** over a collection, how **input/output schemas** are declared. Treat the pseudocode in the flow doc as intent, not signatures.
- Confirm the model-string convention (`provider/model-name`) in the installed version.
- Confirm which **pgvector index types** your installed version supports (HNSW vs IVFFlat) before committing to the `voice_snippets` index.
- Run the **schema-drift check**: live DB vs `schema.sql` (exclude `auth.*` and `storage.*`).

**Done when:** the real Mastra API surface is confirmed in writing, the pgvector index type is chosen, and there’s no unexplained schema drift.

-----

## Step 1 — Schema foundations

**Reads:** `brand-voice-migration-spec.md`.

One migration, in this order (FK dependencies):

- `social_accounts` (incl. `voice_profile` JSONB) — then **seed real accounts**: company X, company LinkedIn, each founder’s X and LinkedIn.
- `brand_voice` (singleton; application-layer enforcement).
- `voice_snippets` (incl. the `VECTOR(1536)` column and the pgvector index chosen in Step 0).
- `update_updated_at` triggers and RLS policies for all three.

**Why first:** `voice_snippets` FKs `social_accounts`, and almost everything that generates content reads voice.

**Done when:** the three tables exist, accounts are seeded, RLS is on, migration applies clean against the live DB.

-----

## Step 2 — `packages/voice`

**Reads:** `brand-voice-migration-spec.md` (Agent Voice Resolution).

The shared resolver + retrieval helper, mirroring `packages/signal` / `packages/storage`:

- **Merge:** umbrella + override; account profile wins on overlap; `vocabulary_avoid` **unioned**; `bitcoin_capitalisation_rule` always applied, never overridable.
- **Retrieve:** top-N `voice_snippets` by embedding similarity to an input string (the beat’s `core_message`), scoped `social_account_id = <account> OR NULL`, platform-matched, `is_starred` weighted up.
- **Embed-on-save:** generate `text-embedding-3-small` embeddings when a snippet’s `body` is created or changed.

**Done when:** a single call returns the merged profile **and** the relevant snippets for a given account, tested against the seeded data.

-----

## Step 3 — Voice Migration Milestone ⭐ (first shippable thing)

**Reads:** `brand-voice-migration-spec.md`, `brand-hub-voice-ux-flow.md`.

- Seed the `brand_voice` row from `docs/brand-voice.md` (`profile`, `mission_summary`, `bitcoin_capitalisation_rule`).
- Migrate example posts → `voice_snippets` rows: `social_account_id = NULL`, `snippet_type = 'full_post'`, a **curator note** written for each.
- Point Charlie (and any other content agent) at `packages/voice` instead of the doc.
- Build the **Brand Hub voice editor** (friendly form: persona, tone chips, vocab do/avoid, signature devices, format notes, locked Bitcoin rule, version) and the **Snippets panel** (list/add/star/edit, required curator note). Inheritance ghosting for account voices.

**⚠️ PARITY GATE:** generate one sample per content agent; confirm table-sourced voice (profile **and** retrieved snippets) matches doc-era output. Only then:

- Retire `docs/brand-voice.md` from active routing (leave a stub).
- Update `CLAUDE.md`: voice → `brand_voice` / `voice_profile` / `voice_snippets`; visual system → BTS design skill (not `DESIGN_BRIEF.md`).

**Done when:** table-backed voice produces parity output, the doc is retired, `CLAUDE.md` routing is updated. **This milestone ships independently of campaigns.**

-----

## Step 4 — Campaigns schema

**Reads:** `social-campaigns-spec.md`.

One migration:

- `campaigns`, `campaign_accounts`, `campaign_beats`.
- **ALTER `content_items`**: add `campaign_id`, `beat_id`, `social_account_id`, `is_thread`, `char_count`, the compliance columns, `approved_by` / `approved_at`; **extend the `source` CHECK** to include `'margot'` and `'charlie'`.
- `thread_segments`, `content_images`.
- `platform_specs` — seed X and LinkedIn limits.
- `compliance_snippets` — seed the disclaimers Lex selects from.
- `post_metrics`.
- The three views (`v_campaign_overview`, `v_campaign_matrix`, `v_ready_to_post`), indexes, RLS.

**Done when:** migration applies clean, the views return, the `content_items` CHECK change is verified against existing rows.

-----

## Step 5 — Agent scaffolding (Margot, Lex)

**Reads:** `social-campaigns-spec.md` (Agent Integration), `social-campaign-workflows-flow.md`.

Spec-first, per project convention:

- Write `docs/agents/margot.md` and `docs/agents/lex.md` (canonical names, roles, boundaries, I/O).
- Then the Mastra agent definitions. Charlie, Bruno, Rex already exist — confirm Charlie reads `packages/voice`.

**Done when:** Margot and Lex instantiate and respond sensibly in isolation (Studio or a test harness).

-----

## Step 6 — Variant Generation Workflow ⭐ (the leaf — build before Step 7)

**Reads:** `social-campaign-workflows-flow.md` (Workflow 2), `social-campaigns-spec.md` (variant editor UI).

With **stubbed** beat/strategy data:

1. Prove the spine for a **single post**: resolve-context (via `packages/voice`, incl. snippet retrieval) → Charlie → Lex → persist `content_item` draft → **Gate 3 (suspend) approval**. Test in Mastra Studio.
1. Add **threads**: segment generation, `thread_segments` persistence, regeneration of a single variant.
1. Build the **variant editor UI** that drives Gate 3: platform-mimic preview, live char counter, Lex compliance chip (calm, expandable), resolved voice, image slot + alt text, inline approve / request-change.

**Done when:** you can generate, see in a faithful preview, and approve **one real post end-to-end** — single and threaded. This proves the whole pattern.

-----

## Step 7 — Campaign Strategy Workflow

**Reads:** `social-campaign-workflows-flow.md` (Workflow 1), `social-campaigns-spec.md` (wizard→canvas UI).

- Margot strategy synthesis → **Gate 1 (suspend)** → beat plan + schedule across `post_slots` → **Gate 2 (suspend)** → **lock `strategy`**. Test in Studio first.
- Wire the **creation wizard** (objective/audience → accounts/cadence → strategy review → plan review) that resumes Gates 1 and 2; collapse to the editable canvas afterward. Mobile-friendly.

**Done when:** a strategy and beat plan can be created, reviewed, and approved through both gates; strategy locks on plan approval.

-----

## Step 8 — Fan-out

**Reads:** `social-campaign-workflows-flow.md` (Step 5 + fan-out open question).

- Wire strategy → spawn one Variant Generation run per (beat × participating account), **fire-and-track**, each with its own `workflow_run_id` logged to `agent_activity`.
- Build the **matrix view** (calendar hero on desktop, grid toggle, agenda list on mobile) from `v_campaign_matrix`, and the **ready-to-post queue** from `v_ready_to_post` (copy-out, copy-by-segment for threads, download image, mark-as-posted → live URL).

**Done when:** approving a plan spawns real per-variant drafts, visible in the matrix, workable through to the ready-to-post queue.

-----

## Step 9 — Loops & polish

**Reads:** `social-campaigns-spec.md`, `brand-hub-voice-ux-flow.md` (promote loop).

- **Compliance re-run on edit** (application layer): editing cleared copy re-invokes Lex and resets compliance state.
- **Metrics entry UI**: inline, platform-aware fields on published posts; published posts visibly carry their numbers.
- **Promote-from-post → voice snippets**: the “Save to voice snippets” action on high-performing published posts (pre-filled, `source = promoted_from_post`, founder writes the curator note). Lives here because it needs published posts + metrics to exist.

**Done when:** edits re-trigger compliance, metrics can be logged, and a strong post can be promoted into the exemplar library in one action.

-----

## Step 10 — Optional branches

**Reads:** `social-campaign-workflows-flow.md` (Steps 1–2 of Workflow 1).

- Rex (research) and Bruno (audience analysis) wired as conditional branches into the strategy workflow.

**Done when:** strategy synthesis can optionally draw on research and audience analysis. Genuinely deferrable — ship without it if needed.

-----

## Milestone map

|Milestone                                   |Steps|Ships?                   |
|--------------------------------------------|-----|-------------------------|
|**Voice source of truth + exemplar library**|0–3  |✅ Independently          |
|**One approvable post end-to-end**          |4–6  |Internal proof of pattern|
|**Full campaign creation → fan-out → post** |7–8  |✅ The feature            |
|**Self-improving loops**                    |9    |✅ Incremental            |
|**Research-enriched strategy**              |10   |Optional                 |

-----

## Open dependencies to settle along the way

- **Step 0** decides the pgvector index type (Step 1) and the real Mastra suspend/child-workflow API (Steps 6–8).
- **Step 2’s** retrieval N and star-weighting is tuned in **Step 6** when you see real generations.
- **Step 8’s** fire-and-track vs await-all is confirmed against the Mastra child-workflow ergonomics found in Step 0.
- `posts_per_week` per-account vs total (Step 7 scheduling) — resolve before building the beat-plan scheduler.