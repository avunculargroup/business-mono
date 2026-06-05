# Step 0 — Social Campaigns Pre-Flight Verification Report

**Platform:** Bitcoin Treasury Solutions Internal Platform
**Feature:** Social Media Campaigns (incl. Brand Voice migration)
**Status:** Verified — Step 0 complete
**Date:** 2026-06-05

This report records facts confirmed against *installed reality* so the build
sessions that follow (Steps 1–10 in `CAMPAIGNS_BUILD_ORDER.md`) rest on
verification, not assumption. No code, migrations, agents, or components were
written for this step.

**Verified against:**
- `@mastra/core@1.32.1` embedded docs (`apps/agents/node_modules/@mastra/core/dist/docs/`) + actual usage in `apps/agents/src/workflows/`
- Live Supabase project `zqtudpzojsmjemqxaaxb` (Postgres 17.6, read-only via MCP)

> The container was a fresh clone with no `node_modules`; `pnpm install`
> (frozen lockfile, clean) was run solely so the embedded Mastra docs existed
> to verify against. No source files were changed.

---

## 1. Mastra Workflow API (v1.32.1)

The pseudocode in `social-campaign-workflows-flow.md` is directionally correct;
the real signatures are below, each cross-checked against existing project
workflows.

| Primitive | Real API (1.32.1) | Notes |
|---|---|---|
| **Step** | `createStep({ id, inputSchema, outputSchema, execute })` from `@mastra/core/workflows` | `execute` receives a **destructured object** `{ inputData, resumeData, suspend, suspendData, mastra, getStepResult, getInitData, state, setState, runId }` — not positional args. |
| **Workflow** | `createWorkflow({ id, inputSchema, outputSchema }).then(step).commit()` | `.commit()` is mandatory. Register under a key on the `Mastra` instance; resolve via `mastra.getWorkflow('key')`. |
| **I/O schemas** | Zod (`z.object(...)`) — project standard. Valibot/ArkType also accepted (Standard JSON Schema). | Steps also support `resumeSchema` and `suspendSchema`. |
| **Suspend / resume (human gate)** | In `execute`: `if (!resumeData) return await suspend({ ...payloadForUI })`. Resume via `run.resume({ step, resumeData })`. | On resume the step **re-enters `execute` from the top** with `resumeData` populated (code after `suspend()` is unreachable). `result.status === 'suspended'`; `result.suspended[0]` is the step id. Step arg can be omitted when only one step is suspended. Matches `newsletter/index.ts`. |
| **Iterate over a collection** | `.foreach(step, { concurrency: N })` — prior step must output an array; outputs an array. Per-iteration resume via `run.resume({ step, resumeData, forEachIndex })`. | Good for in-run batch work — **but not the campaign fan-out (see Conflict 1).** |
| **Invoke another workflow (nested/child)** | A workflow *is* a step: `.then(childWf)`, `.foreach(childWf)`, `.parallel([wfA, wfB])`. `cloneWorkflow(wf, { id })` for separately-tracked clones. | Composition runs the child **inside the parent run** — child does **not** get its own `workflow_run_id`. |
| **Optional branches (Rex/Bruno)** | `.branch([[condFn, step], ...])` — only matching branch runs. | Maps to the optional-branch intent. |
| **Regeneration loop (Gate 3 "request change")** | `.dountil(wf, condFn)` / `.dowhile(wf, condFn)`. | Viable for regenerate → re-suspend. |
| **Run lifecycle** | `await wf.createRun({ runId? })` → `run.start({ inputData })` / `run.resume({...})`. | `createRun()` (not `createRunAsync`) is correct for 1.32.1 — confirmed in `startNewsletterRun.ts`, `pmListener.ts`, webhooks. |

---

## 2. Model-string convention ✅

`provider/model-name`. Default `anthropic/claude-sonnet-4-5`
(`packages/shared/src/constants.ts`). Per-agent/step overrides via
`model_configs` + `MODEL_SCOPES`. New agents (Margot, Lex) and any new
LLM-calling workflow steps must be registered in
`packages/shared/src/modelScopes.ts`.

---

## 3. pgvector ✅

Installed **`vector` 0.8.0** (schema `public`) — supports **both HNSW and
IVFFlat**. The `voice_snippets` HNSW index
(`USING hnsw (embedding vector_cosine_ops)`) is valid and already proven in
production (`knowledge_items` schema.sql:311, plus `content_embeddings`).
`VECTOR(1536)` matches `text-embedding-3-small`. **No adjustment needed.**

---

## 4. Schema drift (live vs `schema.sql`, excl. `auth.*` / `storage.*`)

Live = **55** public tables; `schema.sql` = **50**. All 50 reference tables
exist live. Drift is one-directional: `schema.sql` is **behind by 5 tables**,
all from applied migrations never back-ported into the reference file:

| Live-only table | Source migration |
|---|---|
| `champions`, `champion_events` | `phase3_gtm` (20260418000001) |
| `community_watchlist` | phase2/3 GTM |
| `model_configs` | `add_model_configs` (20260521000000) |
| `news_sources` | `add_news_sources` (20260525000000) |

Expected per CLAUDE.md (`schema.sql` is a human-readable reference only).
**Column/constraint drift on the tables Step 4 ALTERs is nil** — `content_items`
and `agent_activity` CHECK definitions are identical between `schema.sql` and
live. None of the new campaign/voice tables pre-exist.

---

## 🚩 Flagged conflicts — specs vs installed reality

**1. Fan-out maps to the wrong primitive.** The requirement — each variant has
its **own `workflow_run_id`**, isolated retries, independent Gate 3, and
fire-and-track — is incompatible with `.foreach(variantWorkflow)` (which runs
children inside the parent run, shared run id, parent blocks until all finish).
Correct pattern: in the fan-out step's `execute`, loop `(beat × account)` and
call `mastra.getWorkflow('variantGeneration').createRun()` + `run.start(...)`
per variant **without awaiting** (fire-and-track) — the same imperative pattern
used in `pmListener.ts`/webhooks. Resolves the build-order "fire-and-track vs
await-all" open question in favour of fire-and-track.

**2. `content_items.source` CHECK baseline is stale in the spec.** Spec quotes
`('manual','coordinator_agent','content_agent')`; live + `schema.sql` actually
have **4** values: `('manual','coordinator_agent','content_agent','archivist_agent')`.
Also a naming-convention clash: existing values are role-suffixed
(`content_agent`), but the spec persists persona names (`'charlie'`,`'margot'`).
**Decision (approved): honour the spec's persona names** — extend the real
4-value set with `'margot'` and `'charlie'`.

**3. `agent_activity.agent_name` CHECK will hard-fail Margot & Lex.** Live CHECK
= `('simon','roger','archie','petra','bruno','charlie','rex','della')`.
`margot` and `lex` are absent; every insert from the new agents would violate
the constraint. **The build order omits this.** The CHECK must be extended
(+ `'margot'`, `'lex'`) in the Step 4 migration (or Step 5 before agents run).

**4. Voice/campaign tables don't exist yet** (expected). `compliance_snippets`
is described as shared with Contracts/Compliance but has no existing table —
Social is its first owner.

---

## ✅ Adjustments adopted before Step 1

1. **Fan-out architecture locked** as imperative per-variant `createRun()` +
   fire-and-track (not `.foreach`). `.foreach`/`.branch`/`.dountil` remain for
   in-run iteration, optional branches, and the Gate-3 regen loop.
2. **Extend `agent_activity_agent_name_check`** (`+ 'margot', 'lex'`) — added to
   the Step 4 migration scope (build-order checklist updated).
3. **`content_items.source` CHECK** corrected to the real 4-value baseline;
   naming convention resolved to **persona names** (`'margot'`, `'charlie'`).
4. **`schema.sql` treated as stale-by-5-tables** — build sessions verify
   constraints against the live DB, not the reference file. Optional back-port
   of the 5 tables is non-blocking.
5. **pgvector plan unchanged** — HNSW `vector_cosine_ops` on `VECTOR(1536)`.

---

**Step 0 done-when satisfied:** Mastra API confirmed in writing (1.32.1);
pgvector index type chosen (HNSW, verified 0.8.0); schema drift identified and
explained (5 reference-only-missing tables + 2 CHECK constraints to extend).
