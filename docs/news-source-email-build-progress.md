# Email Newsletter Ingestion — Build Progress

**Branch:** `claude/email-newsletter-ingestion-kwe234`
**Spec:** `docs/news-source-email-spec.md`
**Status:** Phases 0–4 complete and pushed. Phase 5 (optional) + a few follow-ups remain.

This feature adds **email newsletters as a third news source type** (alongside RSS and
podcast), landing in the **existing `news_items` table and `/news` web UI**. It was
deliberately scoped to *extend the existing pipeline* rather than build the spec's
parallel `/research` system, which mostly already exists in a different shape.

---

## Decisions taken (where reality diverged from the spec)

The spec reads as greenfield, but the codebase already had a working news pipeline.
Agreed direction with Chris:

- **Scope:** extend the existing pipeline. Email items land in `news_items` and the
  existing `/news` UI. No new `packages/news-ingestion`, no `/research` section, no
  `processNewsItem` package, no `rex_calibration_log`.
- **Capture mechanism:** Fastmail **research folder + plus-addressing**
  (`research+{slug}@<domain>`), not a dedicated account or the CRM inbox.
- **Scoring:** adopt the **3-dimension Rex rubric** (material/novelty/citation) now.
  Implemented as a deterministic structured-output agent step (matching the existing
  `extractNewsMetadata` pattern), **not** as Rex tools — the novelty neighbours are
  computed in code and passed into the prompt.

Implementation choices worth remembering:

- **`news_items.url`** stays `NOT NULL UNIQUE` and is **synthesized** for email
  (`email://{slug}/{message-id}`); the real "view in browser" link goes in
  `canonical_url`. Keeps the existing URL/semantic dedup path untouched.
- **Empty `sender_allowlist` allows ingestion** (the onboarding case — first email
  seeds the list via a future "Trust this sender" button). **SPF/DKIM failure is
  always rejected.**
- The research listener **does not** run the CRM `shouldSkipEmail` filter — newsletters
  carry exactly the `List-Unsubscribe`/bulk headers it drops on.
- The rubric's **composite score, `rubric_version`, and `low_confidence_score` flag are
  computed in code**, not trusted to the model.

---

## What's done (Phases 0–4)

### Phase 0 — Database migration
`supabase/migrations/20260617000000_add_email_news_sources_and_rubric.sql` (+ `schema.sql`,
`docs/schema-changes.md`):
- `news_sources`: `'email'` source_type; `slug` (partial-unique), `inbound_address`,
  `sender_allowlist`, `tier`, `relevance_threshold`; email arm on the `feed_required` CHECK.
- `news_items`: `source_id` FK, `ingestion_ref` (+ partial-unique idempotency index),
  `canonical_url`, `author`, `has_pdf_attachment`, `attachment_count`,
  `relevance_reasoning`, `curator_notes`, `rex_metadata`.
- `fastmail_accounts.research_folder`, `fastmail_sync_state.research_query_state`.

### Phase 1 — JMAP client (`apps/agents/src/lib/fastmailJmap.ts`)
- `getMailboxIdByName` (resolve a folder by name; null if absent).
- `getEmails` now requests attachment metadata.
- Pure helpers: `findHeader`, `getMessageId`, `parseAuthResults`/`isAuthFail`,
  `parsePlusTag`/`extractResearchSlug`, `attachmentCount`, `hasPdfAttachment`.

### Phase 2 — Shared pipeline + rubric
- `lib/embedText.ts` — shared embedding helper.
- `workflows/newsRubric.ts` — rubric prompt, schema, `scoreNewsItem`,
  `composeRelevanceScore`, `deriveFlags`, `RUBRIC_VERSION`.
- `workflows/ingestNewsItem.ts` — dedupe (ingestion_ref → url → semantic 0.88) → embed
  → score → persist. Everything that arrives is stored; scoring failure persists a null
  score + `scoring_failed`.
- `executeRoutine.news_rubric_score` registered in `packages/shared/src/modelScopes.ts`.

### Phase 3 — Email ingestion
- `workflows/newsExtract.ts` — `extractNewsMetadata` pulled out of
  `executeRoutineWorkflow` for reuse.
- `lib/newsletterExtract.ts` — `getHtmlBody`, `htmlToMarkdown` (Turndown; strips
  img/style/script), `extractCanonicalUrl`, `synthesizeEmailUrl`, `senderAllowed`.
- `listeners/researchMailListener.ts` — polls the research folder, `processResearchEmail`
  routes by slug → validates allowlist + SPF/DKIM → HTML→markdown → `extractNewsMetadata`
  → `ingestNewsItem`. Registered in `mastra/index.ts`. Added `turndown` dep.

### Phase 4 — Web UI + docs
- `@platform/shared` news types extended; `packages/db/src/types/database.ts` hand-patched.
- `apps/web/lib/news/emailSource.ts` (`slugify`, `computeInboundAddress`,
  `parseSenderAllowlist`).
- `newsSources` action + `NewsSourceForm` gain an Email type (slug auto-suggest, tier,
  threshold, allowlist, inbound-address preview). Sources list shows the inbound address.
- `NewsCard` surfaces relevance score + a "Why this matters" curator note.
- CLAUDE.md and README updated.

**Tests/typecheck:** all green — 413 agents tests, 89 web tests, 10/10 package typechecks.
New unit tests cover the JMAP helpers, rubric scoring math, the ingest pipeline branches,
the newsletter extraction helpers, `processResearchEmail`, and the email-source helpers.
LLM-touching evals were not run (not in CI).

---

## Remaining

### Phase 5 — Retrofit RSS/podcast to the rubric (optional, deferred)
Chris opted into broad rubric adoption. Email runs on the rubric; routing
`news_source_scan`/`podcast_ingest` through the same `ingestNewsItem`/`scoreNewsItem`
path is deferred as the riskiest change (it alters scoring on already-working feeds).
Do email-first validation, then retrofit.

### Smaller follow-ups
- **Editable curator notes** on an item-detail view (currently read-only on the card) +
  a server action to save them.
- **"Trust this sender"** button on the source detail page (adds the observed From
  domain to `sender_allowlist`) — supports the empty-allowlist onboarding flow.
- **PDF attachment content extraction** (v2) — currently only flagged.

### Operational prerequisites (not code — Chris)
1. A real `research@<domain>` address with a **Sieve rule** filing `research+*` into a
   dedicated Fastmail folder.
2. Set `fastmail_accounts.research_folder` to that folder's name for the relevant account.
3. Set `NEXT_PUBLIC_RESEARCH_INBOUND_DOMAIN` in the web app's env (Vercel) if the domain
   isn't `btreasury.com.au`.
4. After this branch merges to `main`, the migration applies automatically; then run
   `pnpm db:generate-types` to reconcile the hand-patched DB types.
