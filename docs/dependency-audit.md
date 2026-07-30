# Dependency Audit — `apps/agents`

**Date:** 2026-07-29 · **Scope:** the agent server (`apps/agents`), with `packages/*` and `apps/web` touched only where a reachable security advisory or the agent server's runtime required it.

Previous dependency work: `da5dc7c` ("upgrade Mastra to core 1.50"). Mastra shipped four minor releases in the gap.

Done in two commits: the Mastra/hygiene pass first, then the AI SDK migration plus the Next.js security bump.

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
| `@ai-sdk/anthropic` | ^2.0.74 | ^4.0.24 | Two majors behind; moves onto the actively-developed AI SDK v7 line |
| `@ai-sdk/openai` | ^2.0.102 | ^4.0.24 | Same |
| `@ai-sdk/provider` | ^2.0.1 | ^4.0.4 | Supplies the `LanguageModelV4` types used by `src/config/model.ts` |
| `next` in `apps/web` | ^15.1.0 (resolved 15.5.14) | ^15.5.22 | Clears **11 HIGH advisories** — the most serious reachable exposure in the repo |

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

### Related gap, now fixed: `apps/web` was never built in CI

`.github/workflows/test.yml`'s build job ran `turbo run build --filter=@platform/agents...` only. Nothing in CI ran `next build`, so a Next.js build break — a bad import, a prerender failure, a config regression — passed CI and failed on Vercel instead. The web test suite (479 tests) catches logic but not build-time errors.

Fixed by adding a `build-web` job. Two details in it are load-bearing:

- **It must use `turbo run build --filter=@platform/web...`, not `pnpm --filter @platform/web build`.** `apps/web` has ~50 *runtime value* imports from `@platform/shared` (`TASK_PRIORITY_LABELS`, `PIPELINE_STAGE_LABELS`, …) which resolve through `exports["."].import` → `./dist/index.js`, so the workspace packages have to be compiled first. `transpilePackages` in `next.config.ts` changes how Next *compiles* those files, not how it *resolves* them. Verified from a cold checkout (`rm -rf packages/*/dist`): the plain filter fails with `Module not found: Can't resolve '@platform/shared'`, the turbo form succeeds. **Don't "simplify" this to the plain filter** — it will pass locally, where `dist/` already exists, and fail in CI.
- **The Supabase vars are literal placeholders, not repository secrets.** The job is a compile check, not a deploy, and `NEXT_PUBLIC_*` values are inlined into the client bundle at build time — real credentials would be baked into a throwaway CI artifact for nothing. The build only needs them to be set, because `lib/supabase/{server,browser}.ts` read them inside functions rather than at module scope.

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

`pnpm audit` reports **74 findings (3 critical, 26 high) after this work, down from 99 (3 critical, 37 high)** — nearly all of the reduction from the `next` bump. **The remaining number is misleading, and chasing it to zero would be counterproductive.**

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

**The genuinely urgent advisories were in `apps/web`** — 11 HIGH findings against `next` (SSRF in Server Actions and in rewrites via attacker-controlled destination hostname, middleware/proxy bypass in App Router via segment-prefetch and dynamic route param injection, several DoS). **Fixed:** `next` → 15.5.22, and `pnpm audit` now reports zero `next` advisories. HIGH `postcss` and `sharp` remain — see below for why they are staying.

### `postcss` and `sharp` — unfixable, and unreachable

These two keep appearing in `pnpm audit` and are **not ordinary transitive bumps**. Next constrains both below the advisory floors, in every release including 16:

| | Next's declared range | Advisory floor | Verdict |
|---|---|---|---|
| `postcss` | **exactly `8.4.31`** — in both 15.5.22 and 16.2.12 | ≥ 8.5.18 | An exact pin, not a range. Next's CSS pipeline is built against that specific version. |
| `sharp` | `^0.34.3` (15.5.22) / `^0.34.5` (16.2.12) | ≥ 0.35.0 | **Outside the caret in every Next version.** No supported combination exists — upgrading Next does not help. |

Neither is reachable from this app:

- **`sharp`** is Next's *optional* dependency for the image optimizer. **`next/image` is used nowhere in `apps/web`** — the single image render is a plain `<img>` whose eslint-disable comment records that it is "remote, unknown host; avoids next/image remotePatterns config". `next.config.ts` has no `images` block, so remote optimization is off by default. The libvips CVEs require sharp to process image bytes; it never does. (If someone adds `next/image`, re-evaluate this.)
- **`postcss`** runs at build time over the app's own CSS modules. Both advisories — arbitrary file read via attacker-controlled `sourceMappingURL`, and path traversal in previous-source-map auto-loading — require attacker-controlled CSS. There is no user-supplied CSS path.

**Not** forcing them with `pnpm.overrides`: that would replace a dependency Next pins exactly and push sharp outside every Next version's accepted range — running an untested combination to suppress two advisories neither of which is reachable.

One distinction worth keeping straight: there are **two `postcss` copies**, and only one is Next's.

```
postcss@8.4.31  ← next@15.5.22        (exact pin, unfixable)
postcss@8.5.15  ← vite@5.4.21         (i.e. vitest 2 — FIXABLE by the vitest upgrade below)
```

So a future `pnpm audit` showing postcss "still there" after the vitest upgrade is expected — the Next copy remains.

### `@ai-sdk/provider-utils` — a correction

An earlier draft of this doc claimed the `@ai-sdk/provider-utils <= 3.0.97` advisory (LOW, marked `patched: <0.0.0`, i.e. no fix on the 3.x line) could only be cleared by moving `@ai-sdk/*` off 2.x, and used that as the security case for the AI SDK migration. **That was wrong.** The migration did move the app's own copy to `provider-utils@5.0.15`, but the vulnerable 3.x copy is still in the tree and the advisory still fires, because it is pinned *inside* `@mastra/core`:

```
@mastra/core@1.54.0 → @ai-sdk/provider-utils-v5: npm:@ai-sdk/provider-utils@3.0.30
@ai-sdk/ui-utils@1.2.11 → @ai-sdk/provider-utils@2.2.8
```

Mastra carries all three provider generations side by side deliberately, so it can accept V2/V3/V4 models. Nothing the app declares can dislodge those. The advisory closes only when Mastra drops its v5-generation alias — not something this repo controls. The AI SDK migration was still worth doing (two majors of currency, the actively-developed line, and it unlocks `reasoning` — see below), but **not** for that advisory.

-----

## The AI SDK migration (done) — V2 → V4

`@ai-sdk/{anthropic,openai,provider}` moved 2.x → 4.x, i.e. from the AI SDK v5 provider generation to v7. Smaller than the version jump suggests, because the whole AI SDK surface in this repo is `src/config/model.ts` plus its test — nothing else imports `@ai-sdk/*`, and `apps/web` doesn't use it at all.

**`LanguageModelV4` has exactly the same six members as `LanguageModelV2`** — `specificationVersion`, `provider`, `modelId`, `supportedUrls`, `doGenerate`, `doStream`. The v4 result types are extracted into named aliases (`LanguageModelV4GenerateResult` / `…StreamResult`), which is invisible to a wrapper that only delegates. So the change was ten type positions plus a stale comment, and no logic moved.

Things checked so nobody has to re-check them:

- **Mastra accepts V4 at the type level.** `MastraModelConfig = LanguageModelV1 | V2 | V3 | V4 | ModelRouterModelId | OpenAICompatibleConfig | MastraLanguageModel`, and `Agent` takes `DynamicArgument<MastraModelConfig>` — exactly what `dynamicModelFor` returns. Core vendors `@ai-sdk/provider@4.0.3` as `provider-v7` while the app carries 4.0.4; same minor, structurally compatible. Watch this if the two ever drift by more than a patch.
- **`createAnthropic({ apiKey })` / `createOpenAI({ apiKey, baseURL })` are unchanged** in v4.
- **`.chat()` is still required for OpenRouter.** In `@ai-sdk/openai@4`, `provider.languageModel` still returns `createResponsesModel(modelId)`, so bare `openai(id)` would hit the Responses API that OpenRouter rejects. The comment in `model.ts` is still accurate; only its version reference changed.
- **Both model-ID unions still end in `| (string & {})`**, so the runtime strings from `model_configs` and `POPULAR_MODELS` type-check fine.

### Why `createFallbackModel` was kept

Mastra 1.54 added native model fallbacks, which look like they could replace the hand-rolled wrapper. They can't. `ModelFallbacks` is `{ id, model, maxRetries, enabled, modelSettings?, providerOptions?, headers? }[]` — there is **no error-predicate field** anywhere in the agent or LLM type surface (no `retryOn`, `shouldRetry`, `isRetryable`, `errorFilter`). It's a positional chain driven by `maxRetries`.

The wrapper encodes something that shape cannot express: `isKeyLimitError` (`src/lib/llmErrors.ts`) matches a 403 whose body reads *"key limit exceeded"*, and failover happens **immediately, with zero retries** — deliberately, because the key is out of budget and retrying it is pointless. Mastra's chain would burn `maxRetries` against the dead key before advancing, adding latency to every request once the budget runs out, and would also fail over on permanent errors (bad request, context-length) where calling Anthropic is wasted spend. Don't re-open this without an upstream predicate field.

### What V4 unlocks

`ModelFallbackSettings.reasoning` is documented as *"Only effective with LanguageModelV4 (AI SDK v7) model providers that support reasoning. When used with older model providers (V2/V3), this option is a no-op."* Reasoning-effort control is now available; not wired up.

-----

## Deferred upgrades, in recommended order

### 1. `vitest` 2 → 4 (+ `@vitest/coverage-v8`)

The best-value deferred item. Clears the `vitest` CRITICAL, the `vite` HIGH, an `esbuild` HIGH, and the `postcss@8.5.15` copy (vitest 4 needs vite ^6/^7/^8, and vite 8's `postcss` range resolves above the 8.5.18 floor). Must move together across `apps/agents`, `apps/web`, and `packages/voice` — all three are on `^2.1.9` and share the lockfile — plus `@vitest/coverage-v8` in lockstep.

**It is a config migration, not a version bump.** `environmentMatchGlobs` is **removed in vitest 4** — confirmed absent from 4.1.10 and present in 2.1.9. `apps/web/vitest.config.ts` uses it (`environmentMatchGlobs: [['**/*.test.tsx', 'jsdom']]`) to route **41 `*.test.tsx` to jsdom** and **29 `*.test.ts` to node**, so it has to move to `test.projects` (two projects) or per-file `// @vitest-environment` docblocks. `test.projects` keeps the routing in one place and is the better fit.

Two traps for whoever does this:

- A config mistake here fails *silently* — component tests would run in `node` and pass or fail for the wrong reason rather than erroring. Verify not just that all 479 web tests pass, but that a jsdom-dependent test actually gets jsdom (e.g. assert `document` is defined in one component test).
- **`CLAUDE.md` documents `environmentMatchGlobs` by name** in the `apps/web` testing conventions paragraph. Update it in the same commit, or the docs will describe an option that no longer exists.

### 2. `openai` 4.104.0 → 7.1.0

Three majors, but the used surface is tiny: only `embeddings.create`, at six call sites — `src/tools/openai.ts`, `src/lib/embedText.ts`, `src/lib/contentEmbeddings.ts`, `src/agents/archivist/tools.ts`, `src/agents/researcher/tools.ts`, `src/workflows/executeRoutineWorkflow.ts`. Note `packages/voice` also declares `openai@^4.68.0` and must move in lockstep.

### 3. `@deepgram/sdk` 3.13.0 → 5.7.0

The only genuinely breaking upgrade here. v5 replaces `createClient()` with `new DeepgramClient()`, and folds `listen.prerecorded.transcribeUrlCallback` into `listen.v1.media.transcribeUrl()` with a `callback` option. Touches `src/tools/deepgram.ts` and its test, on the transcription path. Pinned v3 is fine; its `ws` advisory isn't reachable (above).

### 4. Next.js 15 → 16

`next@16.2.12` is now the stable `latest`. This bump stayed on the 15 line (15.5.22) because that clears every open advisory without a major migration. Moving to 16 is real work with its own breaking changes and should be scoped on its own, not folded into a security patch.

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
pnpm exec turbo run build --filter=@platform/web...       # next build (also a CI job now); needs NEXT_PUBLIC_SUPABASE_*
docker build -f apps/agents/Dockerfile .      # the only check covering --frozen-lockfile resolution
```

`docker build` is the one gate with no CI equivalent. Everything else above runs in `.github/workflows/test.yml` (`test`, `build`, `build-web`).

Two things `mastra build` reports that are **pre-existing and not caused by dependency changes**, so they aren't a signal that an upgrade went wrong:

- Three `Circular dependency found` warnings for `src/mastra/index.ts -> src/webhooks/{telnyx,zoom,deepgram}.ts -> src/mastra/index.ts`. Inherent to the current structure — `index.ts` registers the webhook handlers while each handler imports the `mastra` instance back. Rollup resolves them; they're warnings, not errors.
- A `PostHog` / `SELF_SIGNED_CERT_IN_CHAIN` stack trace when building behind a TLS-terminating proxy. That's the Mastra CLI's own telemetry failing to flush; it doesn't affect bundle output. Set `MASTRA_TELEMETRY_DISABLED=1` to silence it.

`pnpm --filter @platform/agents test:eval` hits a real LLM and is not in CI — run it when Simon's routing, specialist registrations, or an agent system prompt changes.

### The one thing the test suite cannot tell you

`src/config/model.test.ts` mocks `@ai-sdk/anthropic` and `@ai-sdk/openai` at the module boundary, and every other agent test mocks the model layer too. **A green suite proves the types line up, not that a model actually round-trips against a live provider.** That gap matters most after an AI SDK provider-generation change (V2 → V4, as done here): a runtime incompatibility in Mastra's V4 code path would pass typecheck, pass 1079 tests, bundle cleanly, and only surface on Railway.

If you change the provider generation again, `test:eval` with a real key is the only pre-merge check that exercises it. The V2 → V4 move in this audit shipped **without** that check.
