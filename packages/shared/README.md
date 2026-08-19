# @platform/shared

Shared TypeScript types, enums, constants and pure utilities. The leaf package — it
imports from nothing in this monorepo, and everything else may import it.

**Last updated:** 2026-08-11

## What's in it

| Module | Contents |
|---|---|
| `types.ts` | Core domain types and enums |
| `constants.ts` | Platform constants, including `DEFAULT_MODEL` (`anthropic/claude-sonnet-4-5`) |
| `agents.ts` | Agent identifiers and persona mapping |
| `modelScopes.ts` | `MODEL_SCOPES` — the registry of every agent and workflow step that can be model-configured |
| `routines.ts`, `computeNextRunAt.ts`, `tz.ts` | Scheduled-routine types and cron/timezone maths |
| `news.ts`, `podcasts.ts`, `library.ts` | Research-feed, podcast and transcript-library types |
| `findings.ts`, `ecosystem.ts`, `reportWatch.ts` | Market-report, ecosystem-signal and report-ingestion types |

Everything is re-exported from `src/index.ts`; import via `@platform/shared`, not a deep path.

## Before adding a type

Check whether it already exists — duplicated shapes between `apps/agents` and `apps/web` are
exactly what this package prevents. Add to the relevant module, then export it from
`index.ts`.

## MODEL_SCOPES is a registration duty

`modelScopes.ts` is not documentation — `/settings/models` renders from it, and
`config/model.ts` in the agent server resolves overrides through it. Any new agent, or any
workflow step that calls an LLM, must be registered here or it is silently unconfigurable.
Workflow steps also need `fallbackAgent` set, so the step inherits its owning agent's model
until someone overrides it.

## Note on imports

Values (not just types) are imported from here at runtime by `apps/web` — roughly 50 of
them. That is why CI builds workspace packages before `next build`; see the comment in
`.github/workflows/test.yml`.
