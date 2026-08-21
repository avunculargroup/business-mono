# docs/

Around 70 documents live here, and they are not all the same kind of thing. Some must be
current because code depends on them; others are a snapshot of a build that finished months
ago. This index says which is which.

**Last updated:** 2026-08-11

**Start elsewhere if you are new:** the root [`../README.md`](../README.md) for the shape of
the system, [`../CLAUDE.md`](../CLAUDE.md) for the conventions,
[`../apps/agents/README.md`](../apps/agents/README.md) and
[`../apps/web/README.md`](../apps/web/README.md) for each app's internals.

## How to read a doc's status

| Genre | Maintained? | Trust it for |
|---|---|---|
| **Source of truth** | Yes — actively | What the system does now. Code reads from some of these. |
| **Agent specs** | Yes | An agent's triggers, tools, schema dependencies and approval gates |
| **Feature specs** | At writing time | Intent and data model. Marked *Draft* even after shipping — the label means "not re-reviewed", not "not built". |
| **Build logs & handoffs** | No — point in time | What was done in which session, and where a build stopped |
| **Reviews & proposals** | No — point in time | A snapshot judgement. May describe code that has since changed. |

The `Status:` line inside most feature specs tracks the *build*, not the doc. Several say
"Draft" while the feature is live in production.

---

## Source of truth

Read these before changing anything they cover.

| Doc | Covers |
|---|---|
| [`brand-voice.md`](./brand-voice.md) | Tone, terminology, Bitcoin stance, banned words, content lengths, UI microcopy rules. Seeded into `brand_assets` by `pnpm --filter @platform/db seed:brand-voice`, so edits reach the agents. |
| [`webhooks.md`](./webhooks.md) | Telnyx, Zoom and Deepgram payloads, authentication, handler logic |
| [`schema-changes.md`](./schema-changes.md) | Changelog of intentional deviations from the original schema |
| [`agent-naming-spec.md`](./agent-naming-spec.md) | The persona/file/export naming convention (Approved) |
| `DESIGN_BRIEF.md` | Backing data for the `bts-design` skill. **Invoke the skill** — do not read this file directly; the skill is the implementation source of truth. |

Schema itself lives outside this folder: `supabase/migrations/` executes,
[`../packages/db/MIGRATIONS.md`](../packages/db/MIGRATIONS.md) explains the workflow, and
`schema.sql` is a read-only consolidated reference.

## Agent specs

One per agent — triggers, capabilities, tools, schema dependencies, approval gates. Read the
relevant one before touching that agent.

| Doc | Agent |
|---|---|
| [`agents/simon.md`](./agents/simon.md) | Simon — coordinator, conflict detection, capacity awareness, morning briefing |
| [`agents/recorder.md`](./agents/recorder.md) | Recorder (`roger`) — transcription and entity extraction |
| [`agents/archivist.md`](./agents/archivist.md) | Archivist (`archie`) — knowledge base and hybrid search |
| [`agents/pm.md`](./agents/pm.md) | PM (`petra`) — projects, tasks, risk |
| [`agents/ba.md`](./agents/ba.md) | BA (`bruno`) — requirements and clarification loops |
| [`agents/content-creator.md`](./agents/content-creator.md) | Content Creator (`charlie`) |
| [`agents/researcher-agent-spec.md`](./agents/researcher-agent-spec.md) | Researcher (`rex`) — web research, verification, relevance rubric |
| [`agents/relationship-manager.md`](./agents/relationship-manager.md) | Della — CRM. **Its approval-gate table is the source of truth for CRM gates.** |
| [`agents/margot.md`](./agents/margot.md) | Margot — campaign strategy |
| [`agents/compliance.md`](./agents/compliance.md) | Lex — AFSL/AR compliance review |
| [`agents/editorial.md`](./agents/editorial.md) | The internal editorial agent used inside the newsletter workflow |

The other two internal agents — `marketAnalyst` and `newsVerifier` — have no spec file; their
behaviour is documented in the header comment of their own `index.ts`.

## Feature specs

### Research and content pipeline

| Doc | Feature |
|---|---|
| [`news-source-email-spec.md`](./news-source-email-spec.md) | Research feed — RSS, YouTube, podcast and email-newsletter ingestion |
| [`podcast-ingestion-spec.md`](./podcast-ingestion-spec.md) | Podcast ingestion, the transcript waterfall, and the RAG library |
| [`newsletter-workflow-spec.md`](./newsletter-workflow-spec.md) | The newsletter workflow and its two suspend/resume gates |
| [`daily-social-posts.md`](./daily-social-posts.md) | `social_post_from_news` — the daily per-founder LinkedIn/X draft routine (live) |
| [`social-campaigns-spec.md`](./social-campaigns-spec.md) | Campaigns → beats → variants data model, agents, UI |
| [`social-campaign-workflows-flow.md`](./social-campaign-workflows-flow.md) | The strategy and variant workflows, gates and fan-out |
| [`features/linkedin-posting/feature-spec.md`](./features/linkedin-posting/feature-spec.md) | LinkedIn scheduling and posting |
| [`features/social-post-improve/social-post-improvements.md`](./features/social-post-improve/social-post-improvements.md) | Proposal — making daily posts sound less like an AI |

### Brand voice

| Doc | Feature |
|---|---|
| [`brand-voice-migration-spec.md`](./brand-voice-migration-spec.md) | The voice tables and resolver behind [`@platform/voice`](../packages/voice/README.md) |
| [`brand-hub-voice-ux-flow.md`](./brand-hub-voice-ux-flow.md) | Brand Hub voice editor UX |

### Data, indicators and monitoring

| Doc | Feature |
|---|---|
| [`features/economic-indicators/`](./features/economic-indicators/README.md) | Macro series — money supply, inflation, policy rates |
| [`features/onchain-indicators/`](./features/onchain-indicators/README.md) | Bitcoin network and on-chain metrics |
| [`features/findings-engine-spec.md`](./features/findings-engine-spec.md) | The market-report insight layer — what gets narrated, and what gets held |
| [`features/html-pdf-monitoring/html-pdf-monitoring.md`](./features/html-pdf-monitoring/html-pdf-monitoring.md) | Report ingestion — watching publisher pages for new PDF/HTML reports |
| [`features/ecosystem/ecosystem-signal-feature.md`](./features/ecosystem/ecosystem-signal-feature.md) | Ecosystem signals — watches, change detection, the `/signals` feed |

### CRM, discovery and operations

| Doc | Feature |
|---|---|
| [`crm-discovery-guide.md`](./crm-discovery-guide.md) | How the CRM and discovery surfaces are meant to be used |
| [`business_discovery_phase1_spec.md`](./business_discovery_phase1_spec.md) | Phase 1 — discovery interviews and CRM enhancements |
| [`business_discovery_phase2_spec.md`](./business_discovery_phase2_spec.md) | Phase 2 — professional presence and testing |
| [`business_discovery_phase3_spec.md`](./business_discovery_phase3_spec.md) | Phase 3 — go-to-market optimisation |
| [`sops-spec.md`](./sops-spec.md) | Standard operating procedures |
| [`slides-spec`](./slides-spec) | Slide builder MVP spec. No file extension — an 866-line plain-text doc. |

### UI reference (current state, not intent)

Two docs describe what the UI does *today* rather than what it was meant to do. Both are
unusually complete and are the best worked examples of the house page pattern.

| Doc | Covers |
|---|---|
| [`../apps/web/app/(app)/news/podcasts/README.md`](<../apps/web/app/(app)/news/podcasts/README.md>) | The whole `/news/podcasts` tree — file map, transcript lifecycle, cost model |
| [`features/ecosystem/README.md`](./features/ecosystem/README.md) | `/products` and `/advisors` |

### Portfolio demo (not built)

[`features/demo-app/`](./features/demo-app/README.md) specs a public, fixture-backed demo of
this platform for technical evaluators. **`apps/demo` now exists and builds** — phases 0–9 of
the plan have shipped. [`build-progress.md`](./features/demo-app/build-progress.md) records what
each phase actually shipped and what is still outstanding before it can be deployed; the other
documents in the folder are the specs it was built against, not a description of the result.

## Build logs and handoffs

Point-in-time records of how a build progressed. Useful for archaeology; do not treat as
current.

| Doc | Build |
|---|---|
| [`CAMPAIGNS_BUILD_ORDER.md`](./CAMPAIGNS_BUILD_ORDER.md) | Social campaigns — the step-by-step spine and resume point |
| [`CAMPAIGNS_STEP0_VERIFICATION.md`](./CAMPAIGNS_STEP0_VERIFICATION.md) | Campaigns pre-flight verification |
| [`features/social-campaigns/STEP7_HANDOFF.md`](./features/social-campaigns/STEP7_HANDOFF.md) | Campaign strategy workflow handoff |
| [`podcast-ingestion-build-plan.md`](./podcast-ingestion-build-plan.md) | Podcast ingestion build plan and handoff |
| [`news-source-email-build-progress.md`](./news-source-email-build-progress.md) | Email newsletter ingestion progress |
| [`features/ecosystem/build-progress.md`](./features/ecosystem/build-progress.md) | Ecosystem signals progress |
| [`features/html-pdf-monitoring/build-progress.md`](./features/html-pdf-monitoring/build-progress.md) | Report ingestion progress |
| [`features/onchain-indicators/IMPLEMENTATION.md`](./features/onchain-indicators/IMPLEMENTATION.md) | On-chain indicators implementation summary |
| [`CHANGE_REQUEST_SIGNAL_CLI.md`](./CHANGE_REQUEST_SIGNAL_CLI.md) | The Signal CLI integration change request |

## Reviews

Snapshot judgements. Each was accurate when written and none is maintained afterwards — check
the code before acting on one.

| Doc | Subject |
|---|---|
| [`reviews/readme-review-plan.md`](./reviews/readme-review-plan.md) | This documentation set (Aug 2026) — findings and the plan this index came from |
| [`reviews/nextjs-app-review.md`](./reviews/nextjs-app-review.md) | `apps/web` — five improvements |
| [`reviews/web-app-refactor-review.md`](./reviews/web-app-refactor-review.md) | `apps/web` — refactoring opportunities |
| [`reviews/agent-memory-management.md`](./reviews/agent-memory-management.md) | Agent memory — top 3 improvements |
| [`AGENT_IMPROVEMENT_SPEC_1.md`](./AGENT_IMPROVEMENT_SPEC_1.md) | `apps/agents` architecture review |
| [`dependency-audit.md`](./dependency-audit.md) | `apps/agents` dependency audit |

## Adding a doc

Put feature work in `features/<name>/` with a README that maps the folder — see
[`features/economic-indicators/README.md`](./features/economic-indicators/README.md) for the
pattern. Give it a `Status:` and `Last updated:` line. Then add it to the right table above,
and run `node ../scripts/check-doc-links.mjs` before pushing — relative links in the
entry-point docs are CI-gated.
