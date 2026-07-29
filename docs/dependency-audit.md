# Dependency Audit — `apps/agents`

**Date:** 2026-07-29 · **Scope:** the agent server (`apps/agents`), with `packages/*` touched only where the agent server's runtime depends on them.

Previous dependency work: `da5dc7c` ("upgrade Mastra to core 1.50"). Mastra shipped four minor releases in the gap.

-----

## What this audit changed

| Package | Was | Now | Why |
|---|---|---|---|
| `@mastra/core` | 1.50.1 | 1.54.0 | 4 minors behind; no breaking changes in the gap |
| `@mastra/pg` | 1.15.1 | 1.18.0 | Was version-locked behind core (needs core ≥ 1.51.0) |
| `@mastra/memory` | 1.22.2 | 1.24.0 | Additive only |
| `@mastra/observability` | 1.16.0 | 1.16.3 | Patch only |
| `mastra` (CLI, dev) | 1.18.2 | 1.20.3 | Build/dev tooling |
| `ws` in `packages/db` | ^8.18.0 | ^8.21.1 | Clears a HIGH advisory on a **runtime-reachable** path (Supabase Realtime) |
| `ws` in `packages/signal` | ^8.20.0 | ^8.21.1 | Same, for the signal-cli WebSocket client |
| `ai` | ^4.3.0 | **removed** | Unimported, and the wrong major for anything in the tree (below) |
| `hono` | ^4.12.8 | **removed** | Unimported; `src/mastra/index.ts` deliberately avoids hono's types |
| `@anthropic-ai/sdk` | ^0.32.0 | **removed** | Unimported, 83 minors stale |

`@mastra/loggers` stayed at `^1.2.0` — already latest. `pino`, `pino-pretty`, `rss-parser`, `turndown`, `@types/turndown`, and `zod` are all already at their latest release (`zod@3.25.76` **is** the newest 3.x; zod 4 is a separate major).

Also changed: `apps/agents/Dockerfile` now copies `pnpm-lock.yaml` and installs `--frozen-lockfile`. That's the most consequential fix in this audit — see below.

-----

## Finding 1 — CI was validating a different tree than Railway deployed

The `deps` stage of `apps/agents/Dockerfile` ran `pnpm install --no-frozen-lockfile` and never copied `pnpm-lock.yaml`. Stage 2's `COPY . .` does bring the lockfile in, but that runs *after* install — too late to influence resolution.

CI (`.github/workflows/test.yml`) installs with `--frozen-lockfile`. So:

- CI tested, and the build job bundled, `@mastra/core@1.50.1`.
- Railway resolved `^1.50.1` fresh on every deploy, and would have been running **1.54.0**, along with `@mastra/pg@1.18.0` and CLI 1.20.3.

Two consequences: no Railway deploy was reproducible, and a Mastra regression could reach production without CI ever executing the affected code. The version bumps in this audit are partly just *making the manifest state what production was already running.*

Fixed by copying the lockfile in the deps stage and switching to `--frozen-lockfile`, so the image matches what CI validated. The trade-off is intentional: a manifest edit without a matching `pnpm install` commit now fails the Docker build loudly instead of drifting silently.

**Don't reintroduce this.** If a future Dockerfile change needs a fresh resolve, change the lockfile in the repo, not the install flag.

-----

## Finding 2 — three declared-but-unimported dependencies

Zero import sites across `src/`, `test/`, and `evals/` for all three.

- **`ai@^4.3.0`** — not just unused but *wrong*. The only thing in the tree that wants `ai` is `chat` (a `@mastra/core` dependency), whose peer range is `^6.0.182 || ^7.0.0` and is **optional**. `ai@4.3.19` never satisfied it; it was an unmet optional peer being installed for nothing. Removing it drops `ai` from the tree entirely.
- **`hono@^4.12.8`** — `src/mastra/index.ts:53-56` explains why it isn't imported: `@mastra/core` vendors its own copy of hono's types, so the app's `hono` `Context` is a distinct nominal type. The `honoHandler` adapter is typed against Mastra's `ApiRouteHandler` instead. `@mastra/deployer` depends on hono directly, so removing the app-level declaration changes nothing at runtime.
- **`@anthropic-ai/sdk@^0.32.0`** — superseded by `@ai-sdk/anthropic`, which is what `src/config/model.ts` actually uses.

-----

## Finding 3 — Mastra 1.50.1 → 1.54.0 is safe

Checked against upstream changelogs, not assumed:

- **`@mastra/core` 1.51–1.54 are minor + patch only.** The one behaviour change is 1.53.0's "reaction tools are no longer auto-injected, add them via `channels.getTools()`" — this repo has no Mastra Chat channels. (The `channels` identifiers in `src/agents/recorder/workflow.ts` are Deepgram audio channels, unrelated.) Node engine stays `>=22.13.0`, matching `node:22-slim`. The `zod` peer stays `^3.25.0 || ^4.0.0`.
- **`mastra` CLI 1.19.0 and 1.20.0 do have breaking changes, but all of them are in `create-mastra` flags and `mastra env` subcommands.** This repo only runs `mastra dev` and `mastra build`.
- **`@mastra/pg` 1.16–1.18** are additive (caller-defined dataset IDs, `PgFactoryStorage`, metadata filtering) and include two fixes this repo directly benefits from: *process crashes when Postgres drops idle connections*, and *simultaneous schema initialization by multiple processes*. The 1.17.0 session-state schema change is confined to `PgFactoryStorage`, which this repo doesn't use — `src/mastra/index.ts` uses `PostgresStore` and `src/config/memory.ts` uses `PgVector`.

-----

## Finding 4 — advisory reachability matters more than the count

`pnpm audit` reports 97 findings (3 critical, 37 high) after this work, down from 99. **That number is misleading in both directions, and chasing it to zero would be counterproductive.**

A plain `pnpm install` does *not* re-resolve transitive dependencies that still satisfy their ranges — pnpm treats the lockfile as authoritative. So most of these advisories can only be moved by adding permanent `pnpm.overrides`. Before doing that, each one was traced to a reachable code path. **None of the remaining critical/high advisories are reachable from the agent server's runtime surface:**

| Module | Sev | Path | Reachable? |
|---|---|---|---|
| `hono` | HIGH | `@mastra/deployer` | **No.** The advisory needs wildcard origin **plus** credentials. `src/mastra/index.ts` sets `server: { apiRoutes }` with no `cors` and no `auth`; Mastra's `getCorsConfig(server?.cors, hasAuth)` therefore resolves `origin: '*'` with `credentials: false`. The dangerous combination can't occur. |
| `vitest` | CRITICAL | devDep | No. Requires the Vitest **UI** server to be listening; `--ui` is never used. |
| `shell-quote` | CRITICAL + HIGH | `mastra` CLI | No. Build-time CLI, local input only. |
| `ws` (8.19.0) | HIGH | `@deepgram/sdk` | Effectively no. `src/tools/deepgram.ts` uses the HTTP `transcribeUrlCallback` path, not live streaming, so no socket is opened. Deepgram pins this copy; the reachable `ws` copies (`packages/db`, `packages/signal`) **were** bumped. |
| `fast-uri`, `brace-expansion`, `picomatch`, `js-yaml`, `vite` | HIGH | dev tooling | No. |
| `path-to-regexp`, `qs`, `form-data` | HIGH | `@mastra/core > @a2a-js/sdk > express` | No. A2A is never instantiated. |

Deliberately **not** adding `pnpm.overrides` for these: overrides go stale, silently mask upstream fixes, and here would buy a cosmetically lower number with no security gain. Revisit if any of the above becomes reachable.

**The genuinely urgent advisories are in `apps/web`, not here** — 11 HIGH findings against `next` (SSRF in Server Actions and in rewrites, middleware/proxy bypass in App Router, several DoS), all fixed by `next >= 15.5.21` against a current `^15.1.0`. Plus HIGH `postcss` and `sharp`. That is out of this audit's scope but is the most valuable dependency work available in the repo right now.

One advisory *is* a real argument for an upgrade: **`@ai-sdk/provider-utils <= 3.0.97`** is marked `patched: <0.0.0` — there is no fix on the 3.x line. It's only reachable by moving `@ai-sdk/*` off 2.x. See below.

-----

## Deferred upgrades, in recommended order

### 1. `@ai-sdk/{anthropic,openai,provider}` 2.x → 4.x — do this next

Two majors behind (`@ai-sdk/anthropic@2.0.74` → `4.0.24`), and the only way to clear the unpatchable `provider-utils` advisory.

Sized precisely, and smaller than the version jump suggests: **`LanguageModelV4` is structurally identical to `LanguageModelV2`** — same `specificationVersion`, `provider`, `modelId`, `supportedUrls`, `doGenerate`, `doStream`. So:

- `createFallbackModel` in `src/config/model.ts` is a mechanical type swap: `LanguageModelV2` → `LanguageModelV4`, `LanguageModelV2CallOptions` → `LanguageModelV4CallOptions`.
- `src/config/model.test.ts` needs `specificationVersion: 'v2'` → `'v4'` in its fake model.
- `openai.chat(modelId)` still exists in `@ai-sdk/openai@4`, so the OpenRouter workaround documented in `src/config/model.ts` (must use `.chat()` because the provider defaults to the Responses API, which OpenRouter rejects) still applies unchanged.

Independent of the Mastra version: `@mastra/core` has bundled `@ai-sdk/provider-v7` (the v4 spec) since 1.50.1, so it already accepts V4-spec models. It internally carries all three generations side by side (`provider-v5`/`-v6`/`-v7`).

### 2. `vitest` 2 → 4 (+ `@vitest/coverage-v8`)

Clears a CRITICAL and a HIGH (`vite`) and gets off an EOL major. Must move together across `apps/agents`, `apps/web`, and `packages/voice`, which share the lockfile. Worth doing for maintenance reasons more than security ones, given the reachability analysis above.

### 3. `openai` 4.104.0 → 7.1.0

Three majors, but the used surface is tiny: only `embeddings.create`, at six call sites — `src/tools/openai.ts`, `src/lib/embedText.ts`, `src/lib/contentEmbeddings.ts`, `src/agents/archivist/tools.ts`, `src/agents/researcher/tools.ts`, `src/workflows/executeRoutineWorkflow.ts`. Note `packages/voice` also declares `openai@^4.68.0` and must move in lockstep.

### 4. `@deepgram/sdk` 3.13.0 → 5.7.0 — lowest priority

The only genuinely breaking upgrade here. v5 replaces `createClient()` with `new DeepgramClient()`, and folds `listen.prerecorded.transcribeUrlCallback` into `listen.v1.media.transcribeUrl()` with a `callback` option. Touches `src/tools/deepgram.ts` and its test, on the transcription path. Pinned v3 is fine; its `ws` advisory isn't reachable (above).

### 5. Trivia left on the table

Not bumped here only because they were outside the agreed scope, and each is a one-line change whenever someone is next in this file: `youtube-transcript` 1.3.0 → 1.3.1 (patch) and `tsx` 4.21.0 → 4.23.1 (dev, used only by `seed:voice`). `xmlbuilder` 11.0.1 → 15.1.1 is a four-major jump for a package used in one place — check the actual API surface before attempting it. `typescript` 5.9.3 → 7.0.2 is the native-port major and deserves its own piece of work across the whole monorepo, not a drive-by.

### 6. `zod` 3 → 4

Cross-app, 41 files in `apps/agents` alone. All Mastra peers already accept `^3.25.0 || ^4.0.0`, so there's no external pressure. No reason to do this until something needs a zod 4 feature.

-----

## Re-running this audit

```bash
pnpm audit                                    # advisory counts (read with the reachability table above)
pnpm outdated -r                              # current vs latest across the workspace
pnpm --filter @platform/agents typecheck      # catches Mastra type changes
pnpm --filter @platform/agents test           # 1079 tests, fully mocked, ~20s
pnpm exec turbo run build --filter=@platform/agents...   # the only check covering the mastra bundler/deployer path
docker build -f apps/agents/Dockerfile .      # the only check covering --frozen-lockfile resolution
```

Two things `mastra build` reports that are **pre-existing and not caused by dependency changes**, so they aren't a signal that an upgrade went wrong:

- Three `Circular dependency found` warnings for `src/mastra/index.ts -> src/webhooks/{telnyx,zoom,deepgram}.ts -> src/mastra/index.ts`. Inherent to the current structure — `index.ts` registers the webhook handlers while each handler imports the `mastra` instance back. Rollup resolves them; they're warnings, not errors.
- A `PostHog` / `SELF_SIGNED_CERT_IN_CHAIN` stack trace when building behind a TLS-terminating proxy. That's the Mastra CLI's own telemetry failing to flush; it doesn't affect bundle output. Set `MASTRA_TELEMETRY_DISABLED=1` to silence it.

`pnpm --filter @platform/agents test:eval` hits a real LLM and is not in CI — run it only when Simon's routing, specialist registrations, or an agent system prompt changes. Dependency bumps alone don't require it.
