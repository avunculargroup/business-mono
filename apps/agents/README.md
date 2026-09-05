# @platform/agents

The Mastra agent server. Runs Simon and the specialist agents, the deterministic workflows,
the long-lived listeners, and the three inbound webhooks. Deployed to Railway.

**Last updated:** 2026-08-11

## Getting started

```bash
# From the monorepo root
pnpm install
cp apps/agents/.env.example apps/agents/.env    # heavily commented — read it, don't skim
pnpm dev:agents                                 # or: pnpm --filter @platform/agents dev
```

`.env.example` is the reference for configuration. Each optional key documents what
degrades when it is unset, which matters here — most of them disable one ingestion path
rather than breaking the server.

Two settings worth knowing on day one:

- `SIGNAL_LISTENER_ENABLED=false` skips the Signal subscription on boot. Set it locally
  unless you have a registered number, or boot logs an authentication failure every poll.
- `CONTENT_EMBEDDING_LISTENER_ENABLED=false` and `VOICE_EMBEDDING_LISTENER_ENABLED=false`
  skip the startup embedding backfills, which otherwise spend OpenAI credits on every
  local boot.

## Layout

```
src/
  agents/          # One directory per agent — index.ts (+ tools.ts, workflow.ts for hybrids)
  workflows/       # Deterministic pipelines, registered and unregistered (see below)
  listeners/       # Long-lived loops: polling, Supabase Realtime, gate resumes
  webhooks/        # Telnyx, Zoom, Deepgram inbound handlers
  tools/           # Shared tool implementations (supabase, deepgram, signal, openai, youtube…)
  lib/             # Non-agent logic: JMAP, feeds, email rendering, indicators, findings, logger
  config/          # Model resolution (model.ts) and memory configuration (memory.ts)
  mastra/          # The Mastra instance — agent, workflow and API-route registration
  observability/   # Exporter wiring + span processors (agent_activity mirror, trace recorder)
  seeds/           # One-off seed scripts (seed:voice)
evals/             # LLM-touching evals — real model calls, on demand, never in CI
test/              # Shared Vitest helpers: setup.ts, mocks/supabase.ts, factories.ts
```

## Agents, workflows, listeners — which is which

**Agent** — open-ended judgment. Give it tools and a system prompt and let it decide.
Specialists are registered on Simon's `agents:` map in `src/agents/simon/index.ts`, which is
what turns them into `agent-<name>` delegation tools.

**Workflow** — a deterministic pipeline, optionally with reasoning steps inside it. Two
kinds live here, and the difference trips people up:

- *Registered* workflows are on the Mastra instance in `src/mastra/index.ts` and can be
  triggered by the scheduler or by a tool: `recorder`, `pm`, `executeRoutine`,
  `pruneStorage`, `ecosystemScan`, `newsletter`, `researchIngest`, `strategy`, `variant`.
- *Unregistered* workflow modules are plain functions that routines and listeners call
  directly — the news pipeline (`ingestNewsItem`, `newsCuration*`, `newsDedup`,
  `newsRelevance`, `newsRubric`), `podcastIntel/`, `libraryAnswer/`, `socialPost/`. They
  are workflows in shape, not in registration, so they will not appear in Mastra's
  workflow list or the run history.

**Listener** — a long-lived loop started at boot. Either a poll (Signal, JMAP) or a
Supabase Realtime subscription.

### `researchIngest` — the corporate research pipeline

`src/workflows/researchIngest/`. Ten steps over the corporate holdings register:
resolve → fetch → chunk and embed → **extract (Rex)** → validate → reconcile →
**score (Rex)** → **classify (Lex)** → persist → approval gate. Spec:
[`corporate-research-spec.md`](../../docs/features/corporate-holdings/corporate-research-spec.md).

Four things about it are load-bearing and easy to undo by accident:

- **`validateNumerics` is not a model call and must not become one.** Every figure an
  extraction claims is re-located in the source text arithmetically, and the whole event
  is held back if any figure is missing. A validator that can hallucinate is not a
  validator, and this step is the reason the rest of the pipeline can be trusted.
- **Deterministic before LLM.** Facts commit before anything narrates them, so a model
  being slow, down, or wrong costs a narration rather than a ledger. All three agent steps
  fall back to "nothing" rather than throwing.
- **The gate is at publication, not ingest.** Ingest runs unattended; only
  `promoteToPublished` suspends. A pipeline that stops for approval on every quarterly
  stops running.
- **Persist goes through the `commit_research_ingest` RPC.** PostgREST has no
  transactions, and four sequential inserts can half-succeed — leaving events committed
  with the classifications that gate them missing.

It resolves registered documents to URLs; it does **not** discover them. Documents are
registered in `research_documents` by the hand-curation pass. No venue announcement-URL
templates ship: set `RESEARCH_PDF_BASE_<VENUE>` (with `{id}` for the announcement id) to
configure one, and a venue without a configured base resolves as unresolved rather than
being sent to a guessed address.

| Listener | Kind | What it does |
|---|---|---|
| `signalListener` | Poll | Simon's Signal number. Also intercepts replies that resolve a suspended newsletter gate. |
| `fastmailListener` | Poll (5 min) | CRM mail — Inbox/Sent → `interactions` → dispatches Della |
| `researchMailListener` | Poll (5 min) | Research folder → paid email newsletters → `news_items`. Never creates `interactions`. |
| `webDirectives` | Realtime | Directives issued from the web UI |
| `newsletterGateWeb` | Realtime | Resumes a suspended newsletter run when `/content` writes a decision |
| `strategyGateWeb` / `variantGateWeb` | Realtime | The same pattern for the campaign workflows |
| `contentCreatorListener` | Realtime | Persists Charlie's draft output |
| `pmListener` | Realtime | Picks up Petra's proposed actions |
| `podcastActionListener` | Realtime | Retry / Deepgram decisions from the podcast triage page |
| `libraryQuestionListener` | Realtime | Claims pending `library_questions` and runs `libraryAnswer` |
| `socialPublishListener` | Realtime | Publishes approved social variants |
| `contentEmbeddingListener` | Realtime + backfill | Keeps `content_embeddings` in sync for newsletter RAG |
| `voiceEmbeddingListener` | Realtime + backfill | Keeps the brand-voice embedding store in sync |
| `complianceRecheck` | Realtime | Re-runs Lex when a variant's copy is edited |
| `feedbackDistillListener` | Realtime | Distils director feedback into reusable guidance |
| `marketReportFeedbackListener` | Realtime | The same loop for market reports |

## Webhooks

Three inbound routes, registered as `apiRoutes` on the Mastra server. Payloads and
authentication are specced in `../../docs/webhooks.md`.

| Route | Trigger |
|---|---|
| `POST /webhooks/telnyx` | Phone recording ready (HMAC verified) |
| `POST /webhooks/zoom` | Video recording ready |
| `POST /webhooks/deepgram` | Transcription complete (multichannel) |

All three feed the Recorder workflow.

## Testing

```bash
pnpm --filter @platform/agents test         # fully mocked, ~2s, no secrets
pnpm --filter @platform/agents typecheck    # both are red-gates on CI
pnpm --filter @platform/agents test:eval    # real LLM calls — on demand, NOT in CI
```

Run the first two before opening a PR; `.github/workflows/test.yml` gates on both.

Put a `*.test.ts` next to the module. Reuse `test/mocks/supabase.ts` (a chainable
query-builder fake) and `test/factories.ts` (webhook, JMAP and activity payload builders)
rather than building one-off fixtures — new tests that hand-roll a Supabase mock tend to
mock a shape the real client does not have.

Run the evals after changing Simon's routing, a specialist registration, or any system
prompt. They cost real tokens, which is why they are opt-in.

## Logging

Never use `console.*` in `src/`. Railway splits multi-line stderr into one "error" entry
per line, so a stack trace becomes forty unrelated-looking errors.

```ts
import { createLogger } from '<rel>/lib/logger.js';
const log = createLogger('<component>');

log.info({ rowId }, 'dispatch received');   // structured fields in the object
log.error({ err }, 'dispatch failed');      // { err } carries the stack on one JSON line
```

The message is a short static string, not an interpolated sentence — that is what makes
the logs groupable. `authorization`, `apikey` and `token` are auto-redacted. For
message-only logging that must not dump a raw object, use `describeError(err)` from the
same module.

## Adding things

**A new agent:** create `src/agents/<name>/`, implement `tools.ts` and `index.ts`, register
it on Simon's `agents:` map (or leave it off if it is internal to one pipeline), add a row
to `platform_capabilities` so Simon can route to it, register it in `MODEL_SCOPES`
(`packages/shared/src/modelScopes.ts`) so it appears in `/settings/models`, add it to the
`agent_activity.agent_name` CHECK if it writes activity rows, write a spec in
`../../docs/agents/<name>.md`, and add a fixture to `evals/simon-routing/fixtures.json`.

**A workflow step that calls an LLM:** register it in `MODEL_SCOPES` with `fallbackAgent`
set, and wrap the `agent.generate(...)` call with `stepRequestContext('<workflow>.<step>')`
so the step can override its owning agent's model.

**A span processor:** implement `SpanOutputProcessor` in `src/observability/` and register it
in the `spanOutputProcessors` array in `src/mastra/index.ts`. Two exist:
`AgentActivitySpanProcessor` mirrors spans into the `agent_activity` audit table, and
`TraceRecorderProcessor` records one run into a `TraceBundle` for the public demo — the latter
off unless `TRACE_RECORDER_TRACE_ID` names the run to capture. Do **not** copy
`VALID_AGENT_NAMES` from the activity processor into a new one: it silently drops spans whose
agent is not in its list, `lex` included.

**Anything Mastra-shaped:** verify the API against the installed version rather than from
memory — invoke the `mastra` skill, or read `node_modules/@mastra/core/dist/docs/`.

## Deployment

Railway, per `railway.toml`: Docker build via `Dockerfile`, `mastra build` bundling to
`.mastra/output/`, health check on `GET /health`, restart on failure up to 3 times.

The start command sets `--max-old-space-size=512` deliberately — V8 otherwise auto-sizes to
around 256 MB, which is where the recurring OOM crashes hit. Keep it below the container's
memory limit or the OS OOM-killer replaces a recoverable heap error with a SIGKILL.
`railway.toml` carries the full reasoning, as does the `bundler` block in
`src/mastra/index.ts` for the packages that must stay external to the bundle.
