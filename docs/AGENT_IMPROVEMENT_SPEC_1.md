# Agent Server Architecture Review — `apps/agents/`

## Context

The agent server is a Mastra 1.24 application running on Railway, coordinating 8 agents (Simon as hub + 7 specialists), 3 workflows, and ~12 listeners that bridge Supabase Realtime, Signal polling, Fastmail JMAP polling, and inbound webhooks (Telnyx/Zoom/Deepgram). It works, but several architectural choices predate current Mastra capabilities or duplicate logic that could be centralized. This review surfaces concrete, prioritised changes — verified against the installed `@mastra/core@1.24.1` embedded docs — that would improve maintainability, observability, type safety, and reliability without rewriting the system.

The review is grouped by impact tier so it can be executed in passes; each item names the files to touch and the Mastra primitive (where applicable) backing the recommendation.

---

## Tier 1 — Architectural changes (high leverage)

### 1.1 Replace bespoke Simon dispatch + listener fan-out with Mastra **Supervisor Agents**

**Current state:** Simon dispatches to specialists by writing rows to `agent_activity` with `proposed_actions`; each specialist has its own listener (`archivistListener.ts`, `baListener.ts`, `recorderListener.ts`, `relationshipManagerListener.ts`, `researcherListener.ts` — all ~93 lines each, near-identical) that subscribes to Supabase Realtime, parses the dispatch, and runs `runDispatch()`. Completion is then relayed *back* to Simon via `simonListener.ts` (198 lines) reading the audit table.

That is a hand-rolled multi-agent router built on a database event bus.

**Recommendation:** Mastra 1.8+ provides this out of the box via the supervisor pattern (`Agent.agents` property — see `node_modules/@mastra/core/dist/docs/references/docs-agents-supervisor-agents.md`). Register specialists on Simon as subagents:

```ts
export const simon = new Agent({
  id: 'simon',
  instructions: '...',
  model: getModelConfig(),
  agents: { archie, bruno, charlie, rex, della, roger, petra },
  memory: simonMemory,
  tools: { /* keep Signal/email/capacity tools */ },
});
```

Simon then delegates via `simon.generate(...)` natively. This collapses 5 listener files (~465 lines), `simonListener.ts`'s relay logic (~200 lines), and the bespoke `runDispatch` lifecycle (~170 lines) into framework-native delegation with built-in tracing.

**What is preserved:** `agent_activity` audit logging — keep it as a `spanOutputProcessor` (Mastra observability) that writes spans to the table, *not* as the coordination mechanism.

**What changes:** Listeners reduce to the *truly* external bridges (Signal poll, Fastmail poll, web directives, webhooks). The five "specialist dispatch" listeners go away.

**Caveat to validate:** Confirm the supervisor's delegation-cancellation and approval-gate semantics meet BTS's "approval graduation" model documented in CLAUDE.md. If approvals must intercept *between* Simon and the specialist, keep an explicit approval step (see 1.3).

**Files:** `apps/agents/src/mastra/index.ts`, `apps/agents/src/agents/simon/index.ts`, delete `apps/agents/src/listeners/{archivist,ba,recorder,relationshipManager,researcher}Listener.ts` and most of `simonListener.ts`.

---

### 1.2 Enable Mastra **observability/tracing** to replace ad-hoc audit logging

**Current state:** No telemetry registered on the `Mastra({...})` instance. Observability is implemented manually via `agent_activity` rows inserted by every tool and `dispatchRunner.ts`. There are no correlation IDs across agent boundaries, no latency metrics, no error rates.

**Recommendation:** Configure Mastra's built-in `ObservabilityRegistryConfig` (verified in `reference-observability-tracing-configuration.md`):

```ts
new Mastra({
  observability: {
    default: { enabled: true },
    configs: {
      production: {
        serviceName: 'bts-agents',
        sampling: { type: 'always' },
        exporters: [/* OTLP exporter to Grafana/Honeycomb/Datadog */],
        spanOutputProcessors: [agentActivitySpanProcessor], // writes to existing table
      },
    },
  },
  // ...
});
```

Write a `SpanOutputProcessor` that mirrors agent/tool/workflow spans into `agent_activity` so existing dashboards keep working. You get free trace IDs, parent-child span relationships, and standard OTel semantics — and can ship to a real APM later by adding an exporter.

**Files:** new `apps/agents/src/observability/agentActivityProcessor.ts`; modify `apps/agents/src/mastra/index.ts`.

---

### 1.3 Move human-approval gates into workflows using **suspend/resume**

**Current state:** Approval graduation (one-at-a-time → batch → autonomous) is implicit — agents write `proposed_actions` rows that humans approve out-of-band. The PM workflow already uses `suspend()` correctly at step 2; this pattern should be the standard.

**Recommendation:** For every action that today writes a `pending` row to `agent_activity`, model it as a workflow step that `suspend()`s with the approval payload and `resume()`s on Signal "approve"/"reject" reply. Mastra's `docs-workflows-suspend-and-resume.md` covers the pattern; the existing PM workflow is the template.

This makes the approval state machine explicit and queryable via Mastra's run snapshots rather than reconstructed from audit-table joins.

**Files:** `apps/agents/src/agents/simon/tools.ts` (notifySpecialist, emailDraft) → migrate to workflow steps; new `apps/agents/src/workflows/dispatchWithApprovalWorkflow.ts`.

---

### 1.4 Split `executeRoutineWorkflow.ts` (582 lines) into per-routine workflows

**Current state:** A single workflow handles `news_ingest`, `research_digest`, and `monitor_change` via a switch-style branching step. RPC call uses `(supabase.rpc as any)` (line ~370). Individual news-query failures swallowed with `} catch { /* skip */ }` (line ~329).

**Recommendation:** Three sibling workflows — `newsIngestWorkflow`, `researchDigestWorkflow`, `monitorChangeWorkflow` — each with its own steps and schema. The hourly `routineListener` becomes a router that picks the correct workflow per row in `routines`. Smaller surface = better tests, clearer suspend points, no cross-routine state leaks.

**Files:** `apps/agents/src/workflows/executeRoutineWorkflow.ts` → split into 3 files under `apps/agents/src/workflows/routines/`.

---

## Tier 2 — Code quality / safety

### 2.1 Centralise environment configuration

**Current state:** `process.env.X` accessed in 12+ files (researcher tools, deepgram, openai, mastra/index, executeRoutineWorkflow, webhooks, …). No validation; missing env vars surface as runtime errors deep in tool calls.

**Recommendation:** New `apps/agents/src/config/env.ts` exporting a frozen, Zod-validated object:

```ts
import { z } from 'zod';

const schema = z.object({
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  TAVILY_API_KEY: z.string(),
  OPENAI_API_KEY: z.string(),
  DEEPGRAM_API_KEY: z.string(),
  FIRECRAWL_API_KEY: z.string().optional(),
  ZOOM_WEBHOOK_SECRET_TOKEN: z.string(),
  MASTRA_DB_URL: z.string(),
  // ...
}).refine(e => e.ANTHROPIC_API_KEY || e.OPENROUTER_API_KEY, {
  message: 'One of ANTHROPIC_API_KEY or OPENROUTER_API_KEY required',
});

export const env = schema.parse(process.env);
```

Fail fast at boot, not at first webhook. Refactor `config/model.ts` to consume this.

**Files:** new `apps/agents/src/config/env.ts`; modify all `process.env`-touching files.

---

### 2.2 Type-safe Supabase wrapper to replace `as any` / `as never`

**Current state:** `tools/supabase.ts` uses generic `z.record(z.unknown())` schemas and casts. `executeRoutineWorkflow.ts:370` uses `(supabase.rpc as any)`. The generated types in `packages/db/src/types/database.ts` are unused at the call site.

**Recommendation:** Two changes:

1. **Typed RPC wrappers** in `packages/db/src/rpc/` for every RPC actually called (`vector_search_news`, graph traversals, fulltext). The existing `packages/db/src/rpc/` directory is the right home — use `Database['public']['Functions']` for parameter and return types.
2. **Per-table tool generators** in place of generic `supabase_query`. A factory `createTableQueryTool('contacts')` produces a tool with a `Database['public']['Tables']['contacts']['Row']` output schema. Agents that need a table get its specific tool, not the generic escape hatch.

Generic `supabase_query` can remain as a last-resort tool for Simon's exploration.

**Files:** `apps/agents/src/tools/supabase.ts`; new `packages/db/src/rpc/vectorSearchNews.ts`.

---

### 2.3 Extract shared listener primitives

**Current state:** Every Realtime listener duplicates `scheduleReconnect`, `hasEverSubscribed`, `currentChannel`, `reconnectAttempt`, exponential backoff. Identical boilerplate × 9 listeners.

**Recommendation:** `apps/agents/src/listeners/baseRealtimeListener.ts` exports `createRealtimeListener({ channel, filter, onEvent })` that handles connection lifecycle. Keep specialist listeners that survive Tier 1.1 thin (~20 lines). Remaining listeners after the supervisor refactor: `signalListener`, `fastmailListener`, `routineListener`, `webDirectives`, and possibly `pmListener`/`contentCreatorListener` if those keep custom parsing.

**Files:** new `apps/agents/src/listeners/baseRealtimeListener.ts`; refactor remaining listeners.

---

### 2.4 Extract LLM JSON parsing helper

**Current state:** The `text.match(/\{[\s\S]*\}/) → JSON.parse` pattern is duplicated in `pm/workflow.ts:67`, `recorder/workflow.ts:157`, `executeRoutineWorkflow.ts:429`.

**Recommendation:** Use Mastra's **structured output** (`outputSchema`) on the agent calls instead of post-hoc regex parsing. Verified in `docs-agents-structured-output.md`. The agent's response is already typed, no extraction needed.

Where structured output isn't possible (legacy prompt that returns prose + JSON), add `apps/agents/src/lib/extractJson.ts`.

**Files:** the three workflow files; new `apps/agents/src/lib/extractJson.ts` (only if needed after migration).

---

### 2.5 Move brand voice from filesystem to database

**Current state:** `agents/contentCreator/index.ts:13` resolves `docs/brand-voice.md` via two candidate paths (dev vs. prod) — fragile and breaks Charlie's deployment if the bundler doesn't copy the file.

**Recommendation:** The `brand_assets` table already exists and Charlie already has `brandLookup`. Persist brand voice content into `brand_assets` and have Charlie read it via the existing tool. Source-of-truth for editors stays as `docs/brand-voice.md` in git; a small sync script (or migration) populates the table.

**Files:** `apps/agents/src/agents/contentCreator/index.ts`; new migration in `supabase/migrations/`.

---

## Tier 3 — Operational

### 3.1 Webhook signature verification

**Current state:** `webhooks/zoom.ts` reads `ZOOM_WEBHOOK_SECRET_TOKEN`; verify Telnyx and Deepgram webhooks have equivalent verification. Unsigned webhook routes are an unauthenticated trigger for the Recorder workflow.

**Recommendation:** Audit all three handlers; add HMAC verification middleware via Mastra's `server.middleware` (verified in `docs-server-middleware.md`).

### 3.2 Tests for workflows and listeners

**Current state:** Zero test files in `apps/agents/`.

**Recommendation:** Vitest is the lightest add. Start with: (a) one integration test per workflow using Mastra's run API + a stubbed Supabase client, (b) a contract test for `extractJson` / structured-output schemas, (c) one webhook signature-verification test. Don't aim for coverage; aim for the workflows that would silently break.

### 3.3 Telnyx recording handoff

**Current state:** `recorder/tools.ts` returns the raw Telnyx URL (rate-limited, expires) — TODO comment notes it should upload to S3/R2.

**Recommendation:** Required before Recorder can be reliable in production. Add an R2/Supabase Storage upload step before passing the URL to Deepgram.

### 3.4 Listener reconnection alerting

**Current state:** Realtime listeners log `console.error` on reconnect failure but don't alert. If a listener silently dies, dispatches stop.

**Recommendation:** After Tier 1.1, the surviving listeners are few. Add a heartbeat row in `agent_activity` per listener every minute; Simon's morning briefing flags any listener that hasn't heartbeated. Or wire into the observability stack from 1.2.

---

## Critical files to modify

| File | Change |
|---|---|
| `apps/agents/src/mastra/index.ts` | Add observability config, register specialists on Simon |
| `apps/agents/src/agents/simon/index.ts` | Add `agents:` property; remove dispatch tools |
| `apps/agents/src/listeners/{archivist,ba,recorder,relationshipManager,researcher,simon}Listener.ts` | Delete or shrink to thin wrappers |
| `apps/agents/src/listeners/baseRealtimeListener.ts` | New — shared subscribe/reconnect |
| `apps/agents/src/lib/dispatchRunner.ts` | Mostly delete after supervisor migration; retain audit-write helpers |
| `apps/agents/src/workflows/executeRoutineWorkflow.ts` | Split into `workflows/routines/{newsIngest,researchDigest,monitorChange}.ts` |
| `apps/agents/src/config/env.ts` | New — Zod-validated env |
| `apps/agents/src/tools/supabase.ts` | Replace generic `as never` casts with typed wrappers |
| `apps/agents/src/observability/agentActivityProcessor.ts` | New — span → audit row |
| `apps/agents/src/agents/contentCreator/index.ts` | Read brand voice from DB, not FS |
| `apps/agents/src/webhooks/{telnyx,zoom,deepgram}.ts` | Verify signatures via middleware |

## Existing utilities to reuse

- `getModelConfig()` in `apps/agents/src/config/model.ts` — already centralized; do not duplicate.
- `runDispatch()` in `apps/agents/src/lib/dispatchRunner.ts` — its lifecycle-logging logic becomes the body of the `agentActivitySpanProcessor` in 1.2.
- `packages/db/src/rpc/` — the right home for typed RPC wrappers (2.2).
- `simonMemory` in `apps/agents/src/config/memory.ts` — keep as-is; supervisor pattern in 1.1 is compatible.
- `vectorSearchTool`, `graphTraverseTool`, `fulltextSearchTool` in `archivist/tools.ts` — already correctly shared.

## Verification

After each tier:

1. **Tier 1:** `pnpm --filter @platform/agents build` cleanly; start the server locally and confirm Mastra Studio (`http://localhost:4111`) shows Simon with the registered subagents under "Agents". Send a Signal message that requires specialist delegation; confirm a span tree shows in Studio's traces (post-1.2) and an `agent_activity` row is written by the span processor.
2. **Tier 2:** `tsc --noEmit` shows zero `any`/`never` casts in `apps/agents/src/tools/supabase.ts` and `executeRoutineWorkflow.ts`. Booting with `TAVILY_API_KEY` unset fails at startup with a Zod error, not at first tool call.
3. **Tier 3:** `vitest run` green; replaying a recorded Zoom webhook with a tampered signature returns 401.

End-to-end smoke: route a real director message ("draft a follow-up email to X") through Simon → Charlie → email approval → Signal reply; trace should show as one parent span with child spans per agent/tool, audit table should match.

