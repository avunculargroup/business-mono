# README Review — findings and update plan

**Scope:** every `README.md` in the repo (excluding `node_modules`), reviewed holistically
against the current state of the code.
**Status:** Proposal — no README has been changed yet.
**Last updated:** 2026-08-11

---

## 1. What exists today

| Document | Lines | Health |
|---|---|---|
| `README.md` (root) | 459 | Well-written, comprehensive — but materially stale. Last touched 16 Jul; ~1 month and several subsystems ago. |
| `apps/web/README.md` | 83 | Significantly stale. Describes roughly a third of the app that now exists. One broken link. |
| `apps/web/app/(app)/news/podcasts/README.md` | 500 | The best document in the repo. Accurate, deep, file-mapped. Undiscoverable where it sits. |
| `infra/signal-cli/README.md` | 34 | Accurate, thin, fit for purpose. |
| `docs/features/demo-app/README.md` | 130 | Good. Document map + build sequence + non-goals. |
| `docs/features/economic-indicators/README.md` | 67 | Good. Document map with "read it when" column. |
| `docs/features/onchain-indicators/README.md` | 81 | Good. Cross-links its sibling feature. |
| `docs/features/ecosystem/README.md` | 299 | Good — a current-state UI reference, like the podcasts one. |
| `docs/features/social-campaigns/README.md` | 58 | Good. Explicitly says "don't duplicate, the specs are canonical". |
| `.claude/skills/bts-design/README.md` | 271 | Design-system reference for the skill. Fine. |
| `.claude/skills/bts-design/HANDOFF_README.md` | 154 | Orphaned. Describes a `design_handoff_bts_design_system/` bundle layout that does not exist here — instructions for a copy that already happened. |
| `.claude/skills/bts-design/ui_kits/platform/README.md` | 28 | Fine. |
| `packages/db/MIGRATIONS.md` | 161 | Accurate and useful. Effectively `packages/db`'s README under another name. |

**No README at all:** `apps/agents` (the primary server), `packages/db`, `packages/shared`,
`packages/signal`, `packages/voice`, and `docs/` (70+ markdown files, no index).

---

## 2. Who the visitor is

Three distinct arrivals, currently served by one document:

1. **A returning director / the other co-founder** — needs "how do I run this, what changed".
2. **A coding agent starting cold** — served by `CLAUDE.md`, which is the better-maintained
   of the two and overlaps the root README by roughly 60%.
3. **A technical evaluator** — `docs/features/demo-app/README.md` states outright that the
   platform is being packaged as a portfolio artefact for "recruiters and technical
   evaluators". Nothing in the root README is written with that reader in mind: there is no
   licence or private-repo notice, no CI badge, no screenshot, and no paragraph explaining
   what is interesting about the architecture rather than how to boot it.

The root cause of the staleness is #1 and #2 sharing a document. The README restates
CLAUDE.md's tables (agent roster, conventions, workflows, listeners) and the two then drift
independently — CLAUDE.md gets updated as a working instruction file, the README does not.

---

## 3. Findings

### 3.1 Root README — factual drift

Each item verified against the tree at `220374b`.

| # | Claim in README | Reality |
|---|---|---|
| 1 | Monorepo structure lists `packages/db`, `shared`, `signal` | `packages/voice` also exists — a full workspace package with its own `vitest.config.ts` and test suite. It appears nowhere in the README: not in the structure diagram, not in the dependency graph, not in the import rules. It is in `mastra/index.ts`'s `transpilePackages`. |
| 2 | Agent roster of 10 | 13 directories under `apps/agents/src/agents/`. `newsVerifier` is undocumented. The "internal agents" note names only `editorial` and `marketAnalyst`. |
| 3 | Workflows table lists 6 | 8 are registered in `mastra/index.ts` — `pruneStorage` and `ecosystemScan` are missing. Separately, a large family of workflow modules (`ingestNewsItem`, `newsCuration*`, `newsDedup`, `newsRelevance`, `newsRubric`, `podcastIntel/`, `libraryAnswer/`, `socialPost/`) is invoked outside the registry and gets no mention. |
| 4 | Listeners described in one prose sentence covering ~8 | 19 listener modules exist. Undocumented: `libraryQuestion`, `podcastAction`, `socialPublish`, `voiceEmbedding`, `feedbackDistill`, `marketReportFeedback`, `strategyGateWeb`, `variantGateWeb`. |
| 5 | RPC wrappers table lists 3 | 7 exist — `contentSearch`, `newsSearch`, `reportSearch`, `transcriptSearch` are missing. (CLAUDE.md's key-files table already lists `newsSearch`.) |
| 6 | Web app areas table | Missing `market-reports` and `signals`. `decks` / `discovery` / `docs` / `files` are collapsed into one "supporting workspace pages" row despite several being substantial. |
| 7 | Env var table | `apps/agents/.env.example` is now the better-maintained source and carries careful rationale comments. The README omits `GITHUB_TOKEN`, `FRED_API_KEY`, `LLAMA_CLOUD_API_KEY`, `BGEOMETRICS_API_KEY`, `LOG_LEVEL`, `PLATFORM_URL`, `MASTRA_DEFAULT_EXPORTER`, `MASTRA_PROJECT_ID`, `CONTENT_EMBEDDING_LISTENER_ENABLED`, `VOICE_EMBEDDING_LISTENER_ENABLED`. |
| 8 | Web env var table | Omits `OPENAI_API_KEY` (podcast transcript search) and `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` (both documented in `apps/web/.env.example`). |
| 9 | Scripts table | Omits `db:migrate`, `db:diff`, `db:pull`, `db:reset`. |
| 10 | Getting started ends at `pnpm dev:agents` | Never starts the web app, and never mentions that it is auth-gated by `middleware.ts` — a first-time visitor reaches a login page with no account and no instruction for creating one. |
| 11 | — | Whole subsystems have no presence: podcast ingestion + transcript RAG library, market reports / report watch, economic indicators, on-chain indicators, ecosystem signals, social campaigns + LinkedIn publishing, SOPs, business discovery. |
| 12 | — | No licence or "private, internal" notice, no CI badge, no PR/contribution conventions, no screenshot. |

### 3.2 `apps/web/README.md`

- **Project structure lists 8 route directories; 22 exist.** Missing: `news`, `campaigns`,
  `advisors`, `products`, `market-reports`, `signals`, `decks`, `discovery`, `docs`,
  `files`, `routines`, `company`.
- **Env table lists 2 variables; `.env.example` documents 6**, each with a rationale the
  README does not carry.
- **Broken link.** "Visual design: `docs/design-brief.md`" — the file is
  `docs/DESIGN_BRIEF.md`, the path is wrong relative to `apps/web/`, and CLAUDE.md says not
  to read it directly but to invoke the `bts-design` skill instead. The link is wrong three
  ways.
- **No testing section**, despite a substantial Vitest suite and a non-obvious
  `node` / `jsdom` project split in `vitest.config.ts` that a contributor must understand
  to add a test.
- Server-actions list ("contacts, tasks, content, approvals, auth") is 5 of 50 files.

### 3.3 Structural findings

- **`docs/` has no index.** 70+ files across four genres with no signposting: durable specs
  (`webhooks.md`, `brand-voice.md`), build-progress logs (`CAMPAIGNS_BUILD_ORDER.md`,
  `news-source-email-build-progress.md`), point-in-time reviews (`docs/reviews/`), and
  session scratch (`docs/features/demo-app/temp.md`,
  `docs/features/economic-indicators/test_file.md`,
  `docs/features/onchain-indicators/test.md`). A visitor cannot tell which is which, and
  the scratch files are the most recent commits in the log.
- **The document-map pattern works and is applied inconsistently** — 5 of 9 `docs/features/`
  folders have a README; `html-pdf-monitoring`, `linkedin-posting`, `social-post-improve`
  and `findings-engine-spec.md` do not.
- **The best current-state docs are buried.** The 500-line podcasts README and the 299-line
  ecosystem README are exactly what a new reader wants and are linked from nowhere.
- **Freshness metadata is inconsistent.** Feature READMEs carry `Status` + `Last updated`;
  the root and app READMEs carry nothing, so there is no signal that the root README is a
  month behind.
- **`HANDOFF_README.md`** documents a bundle-copying step that has already happened.

### 3.4 Two items needing an owner decision, not a fix

- Is `newsVerifier` an internal (workflow-only) agent like `editorial` and `marketAnalyst`,
  or a roster agent? It is absent from both README and CLAUDE.md.
- The root README lists "CRM contact/company creation" as always-human-approved. CLAUDE.md's
  approval section does not. One of the two is wrong.

---

## 4. Plan

Ordered by visitor impact per unit of effort. Phases are independently shippable.

### Phase 1 — Root README: fix the front door

*Effort: ~2 h. Highest impact.*

1. Add a short **"What this is / what's interesting"** section above Architecture, written
   for the technical evaluator: the hub-and-spoke constraint, the approval-graduation
   model, the suspend/resume human gates. Three paragraphs, no marketing.
2. Add a **private-repo / no-licence notice** and a CI badge for
   `.github/workflows/test.yml`.
3. **Correct the drift** in §3.1 items 1–9: add `packages/voice` to the structure diagram,
   dependency graph and import rules; add `newsVerifier`; add `pruneStorage` and
   `ecosystemScan`; complete the RPC and web-area tables; add the four `db:*` scripts.
4. **Replace the two env-var tables with a pointer** to `apps/agents/.env.example` and
   `apps/web/.env.example`, keeping only a short "the five you cannot boot without" table.
   The example files are already better and already maintained; two copies is what caused
   the drift.
5. Extend **Getting started** to step 7 (`pnpm dev:web`), step 8 (`pnpm test`), and a note
   on creating the first Supabase auth user so the login page is passable.
6. Add a **"Subsystems" section** — one line and one doc link each for news/podcasts,
   market reports, indicators, campaigns, discovery — so the reader learns these exist.
7. Add a `Last updated` line under the title.

### Phase 2 — `apps/agents/README.md` (new) + `apps/web/README.md` (rewrite)

*Effort: ~2 h. `apps/agents` is the primary server and has no README at all.*

8. **New `apps/agents/README.md`** (~80 lines): run it locally, the `src/` layout
   (agents / workflows / listeners / webhooks / tools / lib), how a listener differs from a
   workflow, the test + eval commands, the logging rule (pino, never `console.*`), and the
   Railway deploy contract. This is where the listener and workflow inventories belong —
   next to the code, not in the root README, so they get updated in the same PR.
9. **Rewrite `apps/web/README.md`**: full route list, fix the `DESIGN_BRIEF` link to point
   at the `bts-design` skill, point env vars at `.env.example`, and add a testing section
   covering the `node`/`jsdom` project split and the `test/mocks/supabase.ts` pattern.
   Link out to the podcasts and ecosystem READMEs as worked examples.

### Phase 3 — Package READMEs

*Effort: ~1 h. Four files, 20–40 lines each — what it is, what it exports, who may import it.*

10. `packages/shared/README.md` — leaf package; `MODEL_SCOPES` registration duty.
11. `packages/db/README.md` — client, generated types, RPC wrappers; link to `MIGRATIONS.md`
    rather than restating it.
12. `packages/signal/README.md` — link to `infra/signal-cli/README.md`; note that
    `apps/web` must not import it.
13. `packages/voice/README.md` — currently undocumented anywhere in the repo.

### Phase 4 — `docs/` navigation

*Effort: ~1.5 h.*

14. **New `docs/README.md`** — a table of every doc grouped by genre (Source of truth /
    Agent specs / Feature workspaces / Build logs / Point-in-time reviews) with a one-line
    "read it when". This is the single highest-value new file after the root README.
15. **Link the buried current-state docs** from `docs/README.md` and from
    `apps/web/README.md`.
16. **Mark superseded docs** with a one-line `> Superseded — see X` banner rather than
    deleting them (build logs are useful history).
17. **Delete the scratch files** — `docs/features/demo-app/temp.md`,
    `economic-indicators/test_file.md`, `onchain-indicators/test.md` — after confirming with
    the owner that nothing depends on them.
18. Add the missing feature-folder READMEs for `html-pdf-monitoring`, `linkedin-posting`
    and `social-post-improve`, following the existing document-map pattern.

### Phase 5 — Stop the drift recurring

*Effort: ~1 h. Without this, Phase 1 is stale again by October.*

19. **Draw the README / CLAUDE.md line explicitly** and state it at the top of both:
    README = how a human runs and understands this; CLAUDE.md = conventions an agent must
    follow. Where the README needs a convention, link to the CLAUDE.md section instead of
    restating the table.
20. **Add rows to CLAUDE.md's "When working on…" table**: adding an agent, workflow,
    listener or workspace package requires updating the corresponding README in the same PR.
    This is the mechanism that would have caught nine of the twelve drift items above.
21. **Add a link-check step** to `.github/workflows/test.yml` (e.g. `lychee --offline`) so
    a broken relative link like `docs/design-brief.md` fails CI.
22. Adopt the `Status` + `Last updated` header uniformly.

---

## 5. Deliberately not proposed

- **No rewrite of the podcasts or ecosystem READMEs.** They are accurate and well-judged.
- **No shortening of the root README.** Its length is not the problem; its accuracy is.
- **No consolidation of `docs/` into a docs site.** An index file solves the navigation
  problem at a fraction of the cost.
- **No changes to `.claude/skills/bts-design/` content** beyond optionally removing
  `HANDOFF_README.md`, which is an owner call.

---

## 6. Suggested sequencing

Phases 1 and 2 together are one PR and deliver most of the value. Phase 5 should ride with
them so the fix holds. Phases 3 and 4 are independent follow-ups.

| Phase | Effort | Impact |
|---|---|---|
| 1 — Root README | ~2 h | High |
| 2 — App READMEs | ~2 h | High |
| 5 — Anti-drift | ~1 h | High (compounding) |
| 4 — `docs/` index | ~1.5 h | Medium-high |
| 3 — Package READMEs | ~1 h | Medium |
