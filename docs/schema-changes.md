# Schema Changes

Changelog of schema changes and design decisions.

Add an entry here whenever you create a new migration file. Format: date, what changed, why.

---

## 2026-07-04 — `onchain_indicators`/`onchain_observations` — Bitcoin snapshot (block height, BTC/AUD price, Fear & Greed)

**Migration:** `20260704160000_add_bitcoin_snapshot_indicators.sql`

Adds three indicators the founders wanted on the daily market report: block height, Bitcoin price in AUD, and the Crypto Fear & Greed Index. Reuses the existing `onchain_indicators`/`onchain_observations` registry (from `20260621170000`) rather than a new table, so they get daily-history storage and revision handling for free via the existing generic `onchain_poll` routine/adapter loop — no changes needed there.

- Widens `onchain_indicators.provider` and `onchain_observations.source` CHECKs to add two new keyless providers: **`coingecko`** (Bitcoin/AUD spot price) and **`alternative_me`** (Fear & Greed Index) — the same endpoints `apps/web`'s dashboard widgets (`BitcoinPriceAUD.tsx`, `FearGreedIndicator.tsx`) already call for live display.
- Widens `onchain_indicators.metric_group` CHECK to add **`market_snapshot`** — none of the three are network-security or holder-behaviour/valuation metrics.
- Seeds `block_height` (mempool, new `/blocks/tip/height` branch on the existing adapter), `btc_price_aud` (new `coingecko` adapter), `fear_greed` (new `alternative_me` adapter).

Unlike every other `market_report` line, these three render from a **live fetch at send time** (same adapters, called directly, no DB write) rather than the last `onchain_poll` run's stored value — see `apps/agents/src/lib/report/runMarketReport.ts`. The stored observations exist for history and to compute the report's day-over-day delta; if the live fetch fails, the report falls back to the last stored value like everything else.

---

## 2026-06-30 — `brand_voice.content_policy` — canon topic & positioning policy

**Migration:** `20260630000000_add_brand_voice_content_policy.sql`

Part of the move to make social/content generation voice-driven rather than hard-coded. The strategic-content lists that previously lived only as prose in `docs/brand-voice.md` (and as dangling references in Charlie's hard-coded system prompt) move into a structured, editable canon field:

- **`content_policy`** (JSONB, `NOT NULL DEFAULT '{}'`) on `brand_voice`. Shape: `topics_endorsed` / `topics_avoided` / `aligned_voices` / `contrarian_views`, all optional `string[]`.

Canon-only (not on `social_accounts.voice_profile`): topic policy is a company stance, not a per-account voice override. Surfaced through the voice resolver (`@platform/voice` → `ResolvedVoiceContext.contentPolicy`) and rendered into the `<brand-voice>` prompt block, so every generation gets topic guidance from data instead of hard-coded text. Editable in Brand Hub (Company Voice tab). Seeded from the doc lists via `seed:voice`. Default `'{}'` leaves existing rows valid.

---

## 2026-06-22 — Variant Gate 3 web-approval columns on `content_items`

**Migration:** `20260622020000_add_variant_gate_columns.sql`

Step 6 of the Social Campaigns build. The Variant Generation workflow suspends at Gate 3 for human approval; the variant editor in the web app drives it. Mirroring the newsletter web gate (`newsletter_runs.gate_message`/`pending_decision`), three nullable columns are added to `content_items` (which *is* the variant) so the suspended gate context and the web→agents decision handoff have a home:

- **`workflow_run_id`** (TEXT) — the Mastra run to resume, written when the gate suspends.
- **`gate_state`** (JSONB) — the suspend preview payload the variant editor renders (platform, copy/segments, char count + limit, Lex verdict).
- **`pending_decision`** (JSONB) — the web writes the approve / request-change decision here; the `variantGateWeb` listener claims it atomically and resumes the run.

All nullable, so existing non-variant `content_items` rows are unaffected.

---

## 2026-06-22 — Campaign agents: register Margot and Lex in the `agent_name` CHECKs

**Migration:** `20260622010000_add_campaign_agents.sql`

Step 5 of the Social Campaigns build (`docs/CAMPAIGNS_BUILD_ORDER.md`). Margot (marketer/strategist) is a new first-class agent (`docs/agents/margot.md`) and logs to `agent_activity`, so the `agent_name` CHECK on `agent_activity`, `platform_capabilities`, and `routines` is extended to include **`margot`**; `VALID_AGENT_NAMES` (`agentActivityProcessor.ts`) gains `margot` so its spans are recorded. **`lex`** (the shared compliance officer) was already added to `agent_activity` + `platform_capabilities` by the on-chain indicators feature (`20260621170002`); this migration re-affirms it and extends it to `routines`. Lex stays out of `VALID_AGENT_NAMES` (it logs via its own explicit insert, not the span processor — matching the on-chain feature, to avoid double-logging). Each change is a strict superset of the prior constraint — safe against existing rows. The campaigns compliance role reuses the existing `lex` agent (`docs/agents/compliance.md`), not a second one.

---

## 2026-06-22 — Campaigns schema: strategy, beats, variants, compliance, metrics

**Migration:** `20260622000000_add_campaigns_schema.sql`

Step 4 of the Social Campaigns build (`docs/CAMPAIGNS_BUILD_ORDER.md`), per `docs/social-campaigns-spec.md`. The strategy layer above the existing content pipeline: a campaign produces ordered beats, each beat fans out into per-account, per-platform variants that reuse `content_items`. `social_accounts` / `brand_voice` / `voice_snippets` already existed (Step 1).

- **`campaigns`** — the strategy container + global cadence config. `strategy` JSONB **locks at the application layer** once `status = plan_approved` (no DB enforcement); major pivots require a new campaign. `audience_filter` conditions the copy (it is not a recipient list — social is broadcast). `post_slots` + `posts_per_week` drive Phase-1 planning targets; precise dispatch is Phase 2. `timezone` defaults to `Australia/Melbourne`.
- **`campaign_accounts`** — composite-PK join of which accounts a campaign fans out to (`ON DELETE CASCADE` from `campaigns`).
- **`campaign_beats`** — ordered platform-agnostic core messages. `status` is a light roll-up (`planned`/`generating`/`variants_ready`/`complete`); authoritative state lives on the variant rows.
- **`content_items` (ALTER)** — reused **as** the variant. Adds `campaign_id` / `beat_id` / `social_account_id` (all `ON DELETE SET NULL`), `is_thread`, `char_count`, the Lex compliance columns (`compliance_status`, `compliance_classification`, `needs_disclaimer`, `disclaimer_snippet_id`, `compliance_rationale`, `compliance_checked_at`, `compliance_overridden_by`), and `approved_by` / `approved_at`. New columns are nullable (or default false) so existing non-campaign rows are unaffected. The **`source` CHECK** is dropped and re-added extended from `manual`/`coordinator_agent`/`content_agent`/`archivist_agent` to also include **`margot`** and **`charlie`** (the live constraint already carried `archivist_agent`, which is preserved). The existing `type` and `status` CHECKs already cover the variant values, so they are untouched.
- **`thread_segments`** — ordered child rows of a threaded variant, `UNIQUE (content_item_id, sequence)`, `ON DELETE CASCADE`.
- **`content_images`** — images at variant level, or (for threads) at segment level via `thread_segment_id` (NULL = applies to the post). Bytes live in the private Supabase bucket via `packages/storage`; the row holds path + alt text + crop. `source` reserves `ai_generated` for Phase 2.
- **`platform_specs`** — editable per-platform limits (`UNIQUE platform`), so a limit change is a row edit, not a deploy. Conformance is enforced in the app (at generation and at save), not by a DB constraint. **Seeded** X (280 / premium 25000) and LinkedIn (3000).
- **`compliance_snippets`** — keyed (`UNIQUE`), versioned, reusable disclaimers Lex selects from; `applies_to` lets them be shared with Contracts/Compliance. **Seeded** `general_advice_warning` and `no_personal_advice` (AU general-advice framing, on-voice). Created before the `content_items` ALTER because `disclaimer_snippet_id` FKs it.
- **`post_metrics`** — manual post-hoc numbers, one row per published variant (`UNIQUE content_item_id`), updated in place — no snapshots — with a platform-flexible `extra` JSONB.
- **Views** — `v_campaign_overview` (progress + timeline, with `end_date` = `start_date + duration_weeks*7`), `v_campaign_matrix` (every variant with beat/account/platform/status/compliance), `v_ready_to_post` (approved + scheduled variants with the resolved disclaimer text). Thread segments and images are fetched per-row by the app — a view can't cleanly nest ordered children.
- **RLS** — `authenticated` *and* `service_role` with `WITH CHECK` on all new tables, matching the Step 1 convention (agents write via `service_role`).

Type generation (`pnpm db:generate-types`) is a post-merge follow-up once the migration applies on `main`.
## 2026-06-20 — Economic indicators: `indicator_poll` routine (Session 2)

**Migration:** `20260620000001_add_indicator_poll_routine.sql`

Session 2 (ingest workflow) wiring. Extends `routines_action_type_check` with `'indicator_poll'` and seeds one active daily routine (`agent_name='simon'`, 08:00 Australia/Melbourne, `action_config={"backfill_periods":18}`). The poll runs inside the existing `executeRoutineWorkflow` (new `runIndicatorPoll` handler): for each active indicator that is due per its own `poll_frequency` (weekly indicators poll only on Mondays) and whose provider has an adapter (FRED/RBA; ABS deferred), it fetches via the provider adapter, applies the fetch-date `released_at` fallback, runs the insert/supersede/no-op revision rules, and — for an already-tracked series printing a new latest value, when `alert_on_new_print` or `alert_change_threshold` fires and no beat was proposed in the last 7 days — writes an `agent_activity` `proposed_actions:[{agent:'charlie'}]` row that `contentCreatorListener` turns into a `content_items` **draft** (publish wall respected). No schema change beyond the CHECK + seed; the data layer (tables/views) shipped in `20260620000000`.

---

## 2026-06-20 — Economic indicators: `economic_indicators`, `indicator_observations`, two views

**Migration:** `20260620000000_add_economic_indicators.sql`

Session 1 (data layer) of the Economic Indicators feature (`docs/features/economic-indicators/`). Adds the slow-moving macro layer (money supply, inflation, policy rates) beneath the existing live tickers, persisted as a time series so it serves both the dashboard and the agents (Rex citing exact figures; a fresh print triggering a content beat). This migration is the schema only — the ingest workflow (Session 2) and dashboard panel (Session 3) are separate, gated for review.

- **`economic_indicators` table** — the source-discriminated registry, one row per tracked series. `region` (`au`/`us`/`global`, drives local/global grouping), `category` (`policy_rate`/`money_supply`/`inflation`), `provider` (`fred`/`rba`/`abs` — the adapter discriminator), `provider_series_code` (FRED series_id) / `provider_table_ref` (RBA/ABS table or dataflow). `poll_frequency` (`daily`/`weekly`) is **stored deliberately** as operational config — it is how often we hit the API, distinct from the data's natural frequency, which is *computed* in `v_indicator_latest` and never stored. `alert_on_new_print` + optional `alert_change_threshold` gate the content-beat proposal. `updated_at` trigger reuses the shared `update_updated_at()`.
- **`indicator_observations` table** — the observation time series, agnostic to which provider delivered it. One row per **(indicator, period, vintage)**: uniqueness is `(indicator_id, period_date, released_at)` so multiple revisions of one period coexist. `period_date` (reference period, normalised to the first day of the period) is deliberately distinct from `released_at` (when the provider published — v1 substitutes the fetch date). Revisions flip the prior row's `is_current=false`, set `is_revision=true` and `superseded_value`. Append/supersede-only: **no `updated_at`**, never edited in place, which is what makes it a clean audit trail.
- **Views (computed, nothing stored)** — `v_indicator_series` (current-vintage observations oldest→newest, for sparklines and Rex) and `v_indicator_latest` (one row per active indicator: current value, change-since-prior, and YoY via a **calendar-year `period_date` join** — frequency-agnostic and gap-tolerant, which works because adapters normalise `period_date` to first-of-period — plus a computed cadence: median release gap → `expected_next_release`). The view exposes both `yoy_change` (pp, for policy rates) and `yoy_pct_change` (the rate itself, for inflation/money supply); the component picks by `category`.
- **RLS** — `"<table>_all"` FOR ALL to `authenticated` + `service_role` (with `WITH CHECK`), matching the project convention for tables agents write to (the scheduled poll runs as `service_role`).
- **Seed** — six v1 indicators (RBA cash rate target, US Fed funds, US M2, AU broad money, US CPI; **AU CPI seeded `is_active=false`** until the ABS adapter exists). FRED series codes are stable; the RBA target column headers and the ABS dataflow must be confirmed against the live sources at Session 2 build. `routines_action_type_check` is **unchanged** here — the `'indicator_poll'` action type and the routine row land in Session 2 with the workflow.

---

## 2026-06-17 — Email newsletter sources + Rex relevance rubric

**Migration:** `20260617000000_add_email_news_sources_and_rubric.sql`

Extends the news ingestion stack to a third source type — paid email newsletters that never surface via RSS or podcast (Gromen *Tree Rings*, Bitwise CIO memos, Fidelity Digital Assets, Lyn Alden Premium). Per `docs/news-source-email-spec.md`, but scoped to **extend the existing pipeline** rather than build a parallel one: email items land in the same `news_items` table and `/news` UI as RSS/podcast. Newsletters arrive at per-source plus-addresses (`research+{slug}@<domain>`) filed into a dedicated Fastmail folder, polled by a listener (`researchMailListener`, Phase 3) — so this is **not** a cron routine and `routines_action_type_check` is unchanged.

- **`news_sources` extended** — `'email'` added to `source_type`. Email columns: `slug` (plus-address suffix + URL slug, **partial unique index** `WHERE slug IS NOT NULL`), `inbound_address` (the computed `research+{slug}@<domain>`), `sender_allowlist` (`TEXT[]`, may start empty and seed from the first email's From via "Trust this sender"). Shared curation fields for the Rex rubric across all source types: `tier` (`tier_1`/`tier_2`/`tier_3`, nullable) and `relevance_threshold` (`NUMERIC(3,2)`, default `0.70`). The `news_sources_feed_required` CHECK gains a third arm: `source_type='email'` requires `inbound_address`.
- **`news_items` extended** — `source_id` FK → `news_sources` (`ON DELETE SET NULL`); legacy rows linked by `source_name` text only, email items carry the FK. `ingestion_ref` (email Message-ID) is the idempotency key, deduped via a **partial unique index** `(source_id, ingestion_ref) WHERE ingestion_ref IS NOT NULL` *before* the existing URL + semantic dedup. `canonical_url` keeps the real "view in browser" link (`url` stays `NOT NULL UNIQUE` and is synthesized from the Message-ID for emails without a URL, leaving the existing dedup path untouched). Email metadata: `author`, `has_pdf_attachment`, `attachment_count`. Rex rubric output: `relevance_reasoning` (candid internal voice), `curator_notes` (Rex's suggestion, human-editable), `rex_metadata` JSONB (dimension scores, flags, `rubric_version`).
- **Fastmail** — `fastmail_accounts.research_folder` (the folder the research listener polls) and `fastmail_sync_state.research_query_state` (its JMAP incremental marker), keeping research mail wholly separate from the Inbox/Sent CRM sync (no `interactions`, no Della dispatch).

---

## 2026-06-06 — Podcast ingestion: `podcast_episodes`, `transcript_segments`, `news_sources` podcast columns

**Migration:** `20260606120000_add_podcast_ingestion.sql`

Backend for the podcast ingestion feature (`docs/podcast-ingestion-spec.md`, build plan `docs/podcast-ingestion-build-plan.md`). A podcast is just another feed, so the existing `news_sources` registry is reused with a `source_type` discriminator; episodes and their transcripts get dedicated tables.

- **`news_sources` extended** — `source_type` (`rss`/`podcast`/`youtube`, default `rss`), `youtube_channel_url`, `transcribe_with_deepgram` (the Deepgram opt-in, default off), `preferred_transcript_lang`, `max_backfill_episodes`, `max_episode_age_days`. `feed_url` was `NOT NULL UNIQUE`; a `youtube` source has no feed URL, so it is now nullable with a **partial unique index** (`WHERE feed_url IS NOT NULL`) plus a per-type presence CHECK. The daily `news_source_scan` routine now filters to `source_type='rss'` so podcast rows don't get parsed as article feeds.
- **`podcast_episodes` table** — one row per episode. Transcript state machine (`transcript_status`: pending→resolving→[transcribing]→available / skipped / failed), provenance (`transcript_source`, `transcript_format`, `has_timestamps`), Deepgram correlation (`deepgram_request_id`, indexed), and a `curator_note` for brief-driven ingestion. Dedupe: `UNIQUE (source_id, guid)` for feed episodes plus a **partial unique index on `guid WHERE source_id IS NULL`** for ad-hoc/brief episodes (NULLs are distinct in Postgres, so the composite unique misses them). FTS generated column mirrors `news_items`.
- **`transcript_segments` table** — chunked, embedded transcript content for RAG. Per-chunk `start_seconds`/`end_seconds`/`speaker` (NULL when the source had no timestamps) so retrieval can deep-link to a moment. `embedding VECTOR(1536)` with an **HNSW `vector_cosine_ops`** index, matching `content_embeddings`. `ON DELETE CASCADE` from the episode.
- **Views** — `v_podcast_ingestion_status` (health dashboard) and `v_episodes_awaiting_action` (stuck/errored episodes for Simon).
- **RPC `vector_search_transcripts`** — cosine search over `transcript_segments` joined to episode + source. Unlike `vector_search_content`, returns **one row per matching segment** (not best-per-source) because timestamp deep-links need the individual segment.
- **`routines_action_type_check`** extended with `podcast_ingest`; seeds one active daily `podcast_ingest` routine (`agent_name='archie'`), a no-op until podcast sources are added.

---

## 2026-06-05 — Voice foundations: `social_accounts`, `brand_voice`, `voice_snippets`

**Migration:** `20260605120000_add_voice_foundations.sql`

Step 1 of the Social Campaigns build (`docs/CAMPAIGNS_BUILD_ORDER.md`), and the structural half of the brand-voice migration (`docs/brand-voice-migration-spec.md`). Moves company voice from `docs/brand-voice.md` into tables and introduces per-account voice. Row content (the seeded `brand_voice` singleton and company-canon `voice_snippets`) lands in Step 3; this migration creates the structure.

- **`social_accounts` table** — the destinations a campaign posts from, and the voice each writes in. A founder on X and the same founder on LinkedIn are separate rows. `platform` (`linkedin`/`twitter_x`, matching `content_items.type`), `account_type` (`company`/`founder`), `team_member_id` (NULL for company accounts), and a per-account `voice_profile` JSONB (the account-specific application/override of the company canon). `api_credentials_ref` is reserved for Phase 2 (a secret-store reference, never the secret).
- **`brand_voice` table** — singleton company-voice canon, enforced at the application layer (same pattern as `company_profile`; no DB uniqueness constraint). `profile` JSONB shares the `social_accounts.voice_profile` shape so one editor/validator serves both. `bitcoin_capitalisation_rule` is a separate column because it is a hard editorial rule applied across all agent output, not a soft tone preference.
- **`voice_snippets` table** — the embeddable exemplar library. `social_account_id` NULL = company canon (serves every voice); a scoped row is account-specific (`ON DELETE CASCADE`). `curator_note` (why a snippet demonstrates the voice) is first-class. `embedding VECTOR(1536)` (OpenAI `text-embedding-3-small`) with an **HNSW `vector_cosine_ops`** index — chosen in Step 0 after confirming pgvector 0.8.0 is installed (the project's established index form). `source_content_item_id` (`ON DELETE SET NULL`) closes the promote-from-post loop.
- **RLS** — `authenticated` *and* `service_role` (with `WITH CHECK`), the project's real convention, because agents embed snippets via `service_role`. This is broader than the simplified `USING`-only snippet in the spec; the broader form is required for the embed-on-save path.

Pre-flight findings backing these choices are recorded in `docs/CAMPAIGNS_STEP0_VERIFICATION.md`.

---

## 2026-06-05 — `match_voice_snippets` RPC (voice retrieval)

**Migration:** `20260605130000_add_match_voice_snippets.sql`

Step 2 of the Social Campaigns build — the retrieval half of `packages/voice`. A `LANGUAGE sql STABLE` function returning the top-N `voice_snippets` by cosine similarity (`embedding <=> query_embedding`) to a query embedding, modelled on the existing `vector_search_*` functions.

- **Scoping** — `p_account_id` set returns the account's own snippets *plus* company-canon (`social_account_id IS NULL`) snippets (umbrella + override); `p_account_id` NULL returns company-canon only (non-account content like a newsletter has no override).
- **Platform** — matches the requested platform or platform-agnostic (`NULL`) rows; `p_platform` NULL imposes no filter.
- **Starred weighting** — a flat `star_boost` (default 0.05) added to similarity so best-of-best exemplars rank up. Exposed as a parameter so Step 6 can tune it against real generations.
- Default PUBLIC execute (authenticated + service_role), consistent with the other vector-search functions — no explicit GRANT.

Consumed via `retrieveVoiceSnippets` in `packages/voice`. The merge half (umbrella + override, `vocabulary_avoid` unioned, Bitcoin rule always-on) is pure TypeScript in the same package.

---

## 2026-06-02 — Newsletter `no_stories` terminal status

**Migration:** `20260602000000_newsletter_no_stories_status.sql`

Widens the `newsletter_runs.status` CHECK to allow `'no_stories'`. The newsletter retrieval step now draws primarily from `news_items` (via `vector_search_news`) with `content_items` / `interactions` as supplementary internal context. When retrieval + Rex's selection still produce no candidates, the workflow bails *before* the first approval gate — there is nothing to approve — and records a diagnostic reason in `notes` / `gate_message`. That terminal state is `no_stories`. Previously the run would suspend at gate 1 with an empty "0 stories" shortlist, asking the director to approve nothing.

---

## 2026-05-31 — Newsletter workflow: `content_embeddings`, `newsletter_runs`, `newsletter` routine action

**Migrations:** `20260531000000_add_content_embeddings.sql`, `20260531000001_add_newsletter_runs.sql`, `20260531000002_add_newsletter_routine_action.sql`

Backs the new AI newsletter workflow (Rex selects stories → Charlie drafts → an editorial agent reviews → two human Signal approval gates → saved to `content_items`).

- **`content_embeddings` table** — pgvector RAG store indexing `content_items` and `interactions` (`source_table` + `source_id`, chunked `chunk_text`, `embedding VECTOR(1536)`, HNSW `vector_cosine_ops`). Embeddings are (re)generated in the application layer by the new `contentEmbeddingListener` (embed-on-write when content reaches `approved`/`published` or an interaction gains a `summary`, plus a bounded startup backfill) — deliberately not a DB trigger, to keep the OpenAI key server-side. Queried via the **`vector_search_content`** RPC (cosine similarity, best chunk per source, optional recency window + source filter), modelled on `vector_search_news`.
- **`newsletter_runs` table** — one row per workflow run. Tracks the lifecycle including the two suspend gates (`suspended_gate1`/`suspended_gate2`/`suspended_hold`), stores the Mastra `workflow_run_id` (for cross-process resume), `requested_by_signal` (so the Signal listener can match an inbound gate reply to the suspended run), the editorial scorecard, and the final `content_item_id`. Realtime-enabled for the `/content` in-progress status indicator.
- **`routines.action_type` constraint widened** to include `'newsletter'`. The handler (`runNewsletter` in `executeRoutineWorkflow.ts`) only *launches* the newsletter — which is its own suspendable Mastra workflow — via `startNewsletterRun`, keeping the routine batch loop's semantics intact. A dormant (`is_active = FALSE`) "Monthly newsletter" routine is seeded with a `monthly_guard` flag that gates the weekly tick down to the first Monday of each calendar month and skips if a run already exists that month.

Footer `{{...}}` placeholders resolve against the existing `company_records` table (`legal_name`, `trading_name`, `abn`, `website`, `tagline`) — no new company table was needed.

---

## 2026-05-25 — Add `news_sources` table and `news_source_scan` routine

**Migration:** `20260525000000_add_news_sources.sql`

- **`news_sources` table** — a user-curated list of publications to watch (e.g. Bitcoin Magazine, macro Substack blogs), managed from the web app (`/news/sources`) or by Simon (the `manage_news_sources` tool). Each row stores a display `name`, optional `site_url`, the `feed_url` (RSS/Atom, `UNIQUE`) actually scanned, an `is_active` flag, and per-source scan status (`last_scanned_at`, `last_status`, `last_error`). Distinct from the keyword-search `news_ingest` routines — sources name specific publications rather than search queries.
- **`routines.action_type` constraint widened** to include `'news_source_scan'`. The new handler (`runNewsSourceScan` in `executeRoutineWorkflow.ts`) reads every active source's feed, keeps items within a lookback window, dedupes (URL + semantic) against `news_items`, enriches each via the existing extractor (which now also classifies the article's `category`), and inserts into `news_items`. Unlike `news_ingest`, it applies no LLM-judge ranking and no relevance drop — the user hand-picked the source.
- **Seed** — one daily `'News: Source scan'` routine (`agent_name='rex'`, 06:30 Australia/Melbourne). It no-ops until sources are added.

---

## 2026-05-16 — Add `extraction_failed` status to `news_items`

**Migration:** `20260516000000_news_items_extraction_failed_status.sql`

Extends the `news_items.status` CHECK constraint to allow a new value `'extraction_failed'` alongside `'new' | 'reviewed' | 'archived' | 'promoted'`.

The `news_ingest` routine used to silently fall back to the raw Tavily snippet (and empty `key_points` / `topic_tags`) whenever the LLM metadata extraction call returned a response that did not parse as the expected JSON schema. The failures were invisible: `routines.last_status` was `'success'`, the rows were stored with `status='new'`, and the only signal was a `console.warn` in Railway. As a result ~61% of rows had empty `key_points`/`topic_tags` with a 500-char raw-page-boilerplate `summary`.

The workflow now uses Mastra's structured-output API (with a single retry), and on failure inserts the row with `status='extraction_failed'` so it can be excluded from digests and re-extracted later.

---

## 2026-05-02 — Fastmail account error tracking

**Migration:** `20260502000000_fastmail_account_error_tracking.sql`

Adds three columns to `fastmail_accounts`:

- **`last_error TEXT`** — most recent poll/auth failure message.
- **`last_error_at TIMESTAMPTZ`** — when that error occurred.
- **`consecutive_failures INTEGER NOT NULL DEFAULT 0`** — increments on each failed poll, resets on success.

The Fastmail listener uses these to auto-disable an account (`is_active = false`) after 3 consecutive auth (`401`) failures, so an expired token stops spamming the logs every 5 minutes and the failure becomes visible in the integrations UI. Re-activating the account through the UI clears the error fields.

---

## 2026-04-29 — Add documents tables

- **`documents`** — general-purpose document records with `type` (report, proposal, brief, memo, strategy), title, description, and tags. Mirrors `mvp_templates` structure.
- **`document_versions`** — versioned content for each document with the same `draft → approved → deprecated` status workflow as `mvp_template_versions`. Content stored as JSONB with `{ markdown: string }` shape.
- Supports the new `/docs` Docs page in the web app for free-form document writing with version management.

---

## 2026-04-28 — Fix platform-files storage RLS

**Migration:** `20260428120000_fix_platform_files_storage_rls.sql`

The `20260427120000_add_platform_files` migration created the `platform_files` table and its RLS policy, but did not create the corresponding Supabase Storage bucket or `storage.objects` policies. Supabase's `createSignedUploadUrl` checks the `storage.objects` INSERT policy before issuing a token, so all uploads to the files page were failing with "new row violates row-level security policy".

This migration adds:
- **`storage.buckets` insert** — creates the `platform-files` private bucket (50 MB limit) if not already present.
- **`storage.objects` policies** — INSERT, SELECT, UPDATE, DELETE for `authenticated` and `service_role` roles scoped to `bucket_id = 'platform-files'`.

---

## 2026-04-26 — News Items (news aggregation feed)

**Migration:** `20260426120000_add_news_items.sql`

- **`news_category` enum** — four values: `regulatory`, `corporate`, `macro`, `international`. Focused on news relevant to Australian Bitcoin/treasury customers.
- **`news_items` table** — dedicated news aggregation store. Separate from `knowledge_items` because news is high-volume, ephemeral, and freshness-centric; `knowledge_items` is curated and durable. Key fields: `url` (unique, deduplication anchor), `url_hash` (generated md5 for fast lookups), `embedding VECTOR(1536)` (semantic search + near-duplicate detection), `fts` (generated tsvector for keyword search), `relevance_score`, `status` (`new → reviewed/archived/promoted`), `knowledge_item_id` (FK to `knowledge_items` when promoted).
- **`vector_search_news` RPC** — pgvector HNSW cosine similarity search with optional category and recency filters. Used for semantic deduplication (threshold 0.95) and Rex's internal news query tool.
- **`routines.action_type` constraint** — extended to include `news_ingest`. Four seed routines inserted (regulatory, corporate, macro, international) set to run daily at 07:00 AEST.

**Design rationale:** pgvector (already in Supabase) handles all required news use cases — semantic search, deduplication, topic clustering — without adding a dedicated graph DB. The graph layer (`knowledge_connections`) remains available if promoted articles need relationship edges.

---

## 2026-04-25 — Company Domains and Subscriptions

Adds two tables for tracking BTS's own operational data on the `/company` page. These are **not** CRM tables — they hold BTS-internal records rather than client company data, following the same pattern as `company_records` (no `company_id` FK; implicitly scoped to the single BTS organisation).

- **`company_domains` table** — stores domain registrations owned by BTS: `name`, `provider`, `renewal_date`, `notes`. Separate table (not JSONB on `companies`) because `renewal_date` is time-sensitive data that warrants a dedicated index for future expiry queries. Index on `renewal_date`.

- **`company_subscriptions` table** — stores SaaS accounts and service subscriptions: `business`, `website`, `service_type`, `payment_type` (`free | paid | trial`), `expiry`, `account_email`, `notes`. Same reasoning: `expiry` benefits from a dedicated index. Index on `expiry`.

Migration: `20260425000000_add_company_domains_and_subscriptions.sql`

---

## 2026-04-24 — Company Records

Adds a flexible key-value record system for BTS's own company data (logo, legal name, mission, etc.), managed via the `/company` page.

- **`company_record_types` table** — catalogue of record types (built-in + custom). `content_type` constrains to `text | markdown | image | file`. `is_singleton` prevents duplicate records for types like `logo` or `legal_name`. `is_builtin` marks platform-defined types that cannot be deleted.

- **`company_records` table** — the actual data rows, each linked to a type via `type_key`. Text/markdown stored in `value`; files/images stored in Supabase Storage with `storage_path`, `filename`, `mime_type`. `is_pinned` surfaces records at the top of the company page. `display_order` controls card ordering within a category.

Migration: `20260424000000_add_company_records.sql`

---

## 2026-04-22 — Slide Builder

Adds the browser-first slide authoring tool so directors can create presentation decks without leaving the platform.

- **`assets` table** — shared media library for uploaded slide images. Stores bucket, path, filename, mime_type, dimensions, and alt_text. `org_id` column kept for future multi-tenancy; hardcoded to the BTS constant in MVP. `uploaded_by` FK to `auth.users`. Storage bucket: `slide-assets` (private).

- **`decks` table** — top-level deck entity. `theme_id` defaults to `'company-default'` (neutral white theme); `status` is `draft | published | archived`; `aspect_ratio` defaults to `16:9`. Both `created_by` and `updated_by` FK to `auth.users` for audit trail.

- **`deck_slides` table** — individual slides belonging to a deck (`deck_id` cascades on delete). `type` is constrained to the 8 template types: `title | section | agenda | two_column | image_caption | kpi_grid | quote | closing`. `order_index` determines display order; `content_json` is the JSONB payload whose shape is discriminated by `type` (validated by Zod in `apps/web/lib/decks/schema.ts`). No `deck_exports` table — PPTX files are streamed on demand.

Migration: `20260422000000_add_slide_builder.sql`

---

## 2026-04-21 — Routines supersede research_monitors

Replaces the Rex-only `research_monitors` table with a generic `routines` table that schedules any agent on a daily/weekly/fortnightly cadence. The internal platform needed a UI for directors to CRUD scheduled agent jobs (e.g. "every morning Rex pulls daily bitcoin headlines"), and the old table was too specialised to the monitor change-detection flow.

- **`routines` table** — `name`, `description`, `agent_name` (same CHECK as `agent_activity`), `action_type` (`research_digest` | `monitor_change`), `action_config JSONB` (shape depends on action_type — see `packages/shared/src/routines.ts`), `frequency` + `time_of_day` + `timezone` (default `Australia/Melbourne`) define the schedule, `next_run_at`/`last_run_at` drive the listener, `last_result JSONB` holds the structured output (shape common across action types so dashboard tiles can render generically), `last_status`/`last_error` for observability, `show_on_dashboard` + `dashboard_title` gate dashboard tile rendering, `is_active` pauses without deletion. Partial indexes on `next_run_at WHERE is_active` and `show_on_dashboard WHERE show_on_dashboard`. Standard `updated_at` trigger and authenticated+service_role RLS policy.
- **Data migration** — every existing `research_monitors` row is INSERT'd into `routines` as `agent_name='rex'`, `action_type='monitor_change'`, with `action_config` preserving `subject`/`context`/`search_queries`/`notify_signal`/`notify_agent`/`last_digest` and `last_result.digest` populated from the prior `last_digest`. Then `research_monitors` is dropped.
- **`platform_capabilities` augmented** — `rex.topic_monitoring` row's note updated to reference the new table; new `rex.scheduled_digests` row added for `action_type='research_digest'`.

Migration: `20260421000000_add_routines_table.sql`

---

## 2026-04-18 — Phase 2: Professional Presence & Testing

Adds four new capabilities on top of the Phase 1 discovery foundation: a corporate lexicon, MVP template library, feedback repository, and insight pipeline (LinkedIn content Kanban).

- **`pain_points` table** — normalises `discovery_interviews.pain_points TEXT[]` into individual rows (id, interview_id, content). Backfilled from existing data via `unnest()`. `feedback` and `content_items` (insight pipeline) FK to this table so items can be linked to a specific pain point, not just an interview. FK cascades on interview delete.

- **`corporate_lexicon` table** — term/professional_term pairs with definition, category, example usage, status (`draft`/`approved`/`deprecated`), and version counter. `approved_by` FK to `team_members`. GIN index on FTS vector (`term || professional_term`). Version increments on every update, tracking terminology evolution.

- **`mvp_templates` + `mvp_template_versions` tables** — two-table design: `mvp_templates` holds metadata (type: `one_pager`/`briefing_deck`, title, tags) and `mvp_template_versions` holds versioned JSONB content. Only one version per template can be `approved` at a time; approval action deprecates the previous approved version. UNIQUE constraint on `(template_id, version_number)`.

- **`feedback` table** — captures MVP test feedback and testimonials. FK to `contacts`, `companies`, and `pain_points` (all SET NULL on delete). `source` and `category` enums. `sentiment JSONB` (score, magnitude, label) populated by Della after creation. Soft-delete via `deleted_at`. Partial index on active entries.

- **`content_items` augmented** — three nullable columns added: `pain_point_id UUID` (FK to `pain_points`), `score INTEGER` (priority), `research_links JSONB DEFAULT '[]'`. The insight pipeline Kanban is a filtered view of `content_items WHERE type = 'linkedin'`; no new table needed.

All new tables have RLS enabled (authenticated read/write), `updated_at` triggers where applicable, and appropriate indexes.

Migration: `20260418000000_phase2_professional_presence.sql`

---

## 2026-04-17 — Discovery interviews foundation

Adds structured discovery interview tracking, pain point audit logging, stakeholder role tagging on contacts, and segment scorecards to support the 15–20 discovery interviews planned for Q2 validation.

- **`stakeholder_role` enum** — `CFO`, `CEO`, `HR`, `Treasury`, `PeopleOps`, `Other`. Applied to `contacts.role`.
- **`trigger_event_type` enum** — `FASB_CHANGE`, `EMPLOYEE_BTC_REQUEST`, `REGULATORY_UPDATE`, `OTHER`. Applied to `discovery_interviews.trigger_event`.
- **`contacts.role stakeholder_role`** — nullable column; existing contacts default to `NULL` (displayed as "Unassigned" in the portal).
- **`discovery_interviews`** — records each outreach or interview. Includes `status` (scheduled/completed/cancelled/no_show), `channel`, `pain_points TEXT[]`, `trigger_event`, and optional `email_thread_id` for future Fastmail thread linking. FK to `contacts` cascades on delete; FK to `companies` sets null on delete (preserving interview history if a company is removed).
- **`pain_point_log`** — audit trail for `pain_points` array changes. Populated by the `pain_points_audit` trigger, which guards against flooding on unrelated field updates (`NEW.pain_points IS DISTINCT FROM OLD.pain_points`).
- **`segment_scorecards`** — lightweight scorecard table: `need_score` and `access_score` (1–5 integers), `planned_interviews`, `notes`. Weighted score (`need × access`) is calculated client-side.
- All three new tables have RLS enabled (authenticated read/write), `updated_at` triggers, and appropriate indexes.

Migration: `20260417000000_add_discovery_interviews.sql`

---

## 2026-04-14 — Add source column to companies table

- **`companies.source`** — new nullable TEXT column with `DEFAULT 'manual'` and a CHECK constraint (`'manual'`, `'web'`, `'coordinator_agent'`, `'recorder_agent'`, `'call_transcript'`). The web UI (`apps/web/app/actions/companies.ts`) was inserting `source: 'web'` on every company creation, causing "Could not find the 'source' column of 'companies' in the schema cache" errors. Mirrors the pattern already established on `contacts.source`.

Migration: `20260414000000_add_source_to_companies.sql`

---

## 2026-04-01 — Fastmail watched_addresses filter

Added `watched_addresses TEXT[] NOT NULL DEFAULT '{}'` to `fastmail_accounts`.

When non-empty, the polling listener skips any email where none of the participants (From, To, Cc) match a watched address. This supports Fastmail accounts with multiple aliases where only specific addresses should be monitored. Empty array (the default) retains the original behaviour of logging all emails on the account.

Migration: `20260401130000_fastmail_watched_addresses.sql`

---

## 2026-04-01 — Fastmail JMAP email auto-logging

Three new tables plus extended source enums to support automatic email logging from Fastmail inboxes.

- **`fastmail_accounts`** — stores one row per team member Fastmail account (username, app-specific password token, display name, active flag). Managed via the web UI at `/settings/integrations/fastmail`. RLS allows `authenticated` and `service_role`.
- **`fastmail_exclusions`** — domains and email addresses to silently skip during sync (e.g. `stripe.com`, `noreply@example.com`). Type is `'domain'` or `'email'`. Managed via web UI.
- **`fastmail_sync_state`** — one row per `fastmail_accounts` row. Stores Fastmail's JMAP `queryState` for Inbox and Sent mailboxes to enable incremental sync (no re-processing old emails). Cascades on account deletion.
- **`contacts.source` extended** — `'fastmail_sync'` added to the check constraint. Contacts auto-created from email are tagged `['needs-review']` and have `pipeline_stage = 'lead'`.
- **`interactions.source` extended** — `'fastmail_sync'` added. Internal (team-to-team) emails land with `direction = 'internal'` and `contact_id = null`.
- **`platform_capabilities` seed** — `simon / fastmail_email_sync` row inserted.

Migration: `20260401120000_add_fastmail_sync.sql`

---

## 2026-03-30 — Fix agent_activity RLS, CHECK constraints, and workflow agent names

Three bugs that blocked all agent audit logging:

- **RLS missing `service_role`** — `agent_activity`, `platform_capabilities`, and `capacity_gaps` policies only allowed `auth.role() = 'authenticated'`. The Mastra server authenticates with the service role key, so every agent insert was rejected at the RLS layer. Policies now use `auth.role() IN ('authenticated', 'service_role')`, matching the pattern already set on `agent_conversations`.
- **`'della'` missing from CHECK constraints** — The `20260327000000_rename_agent_names` migration added `agent_activity_agent_name_check` and `platform_capabilities_agent_name_check` without including `'della'` (Relationship Manager). Her listener was writing `agent_name: 'della'`, causing every insert to fail with a constraint violation. Both constraints now include `'della'`.
- **Workflow agent_name mismatch (code fix)** — The Recorder workflow (`recorder/workflow.ts`) still wrote `'recorder'` and the PM workflow (`pm/workflow.ts`) still wrote `'pm'` — the pre-rename names. These were rejected by the CHECK constraints that require `'roger'` and `'petra'`. Fixed in TypeScript source; no additional schema migration needed.

Migration: `20260330000000_fix_agent_activity_rls_and_constraints.sql`

---

## 2026-03-29 — Add source_activity_id to tasks

- **`tasks.source_activity_id`** — new nullable FK column referencing `agent_activity(id)`. The PM workflow (`pmListener`) passes the `agent_activity.id` of the Simon dispatch row as `sourceActivityId` when creating tasks; the column was missing, causing every PM-triggered task creation to fail with "Could not find the 'source_activity_id' column". Note: `source_interaction_id` (FK to `interactions`) remains for tasks created from call/meeting interactions — these are semantically distinct audit links.
- **Index** — `idx_tasks_source_activity` added for efficient reverse-lookup.

---

## 2026-03-26 — Adopt Supabase CLI migration workflow with CI/CD auto-apply

- **Migration tooling adopted** — schema changes are now managed via the Supabase CLI. Migration files live in `supabase/migrations/` and are applied automatically on push to `main` via `.github/workflows/migrate.yml` (`supabase db push`). No manual SQL execution required.
- **Baseline migration** — `20260319000000_initial_schema.sql` captures the full schema as of the 2026-03-19 initial setup. Written idempotently (`CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE TRIGGER/VIEW`, `DROP POLICY IF EXISTS` + `CREATE POLICY`) so it can be safely applied to the existing live database.
- **Source-on-contacts migration** — `20260319000001_add_source_to_contacts.sql` records the `source` column addition as a discrete migration step (`ADD COLUMN IF NOT EXISTS` for idempotency against the baseline).
- **`schema.sql` role change** — `schema.sql` at the repo root is now a human-readable consolidated reference only. Do not execute it directly. The migration sequence in `supabase/migrations/` is the authoritative execution source of truth.
- **`supabase/seed.sql`** — the `platform_capabilities` INSERT block moved from `schema.sql` into `supabase/seed.sql`. Supabase CLI applies this automatically on `db reset` for local dev.
- **New scripts** — `db:migrate`, `db:diff`, `db:pull`, `db:reset` added to `packages/db/package.json` and mirrored at the root.
- **Developer workflow** — see `packages/db/MIGRATIONS.md` for the full day-to-day process.

---

## 2026-03-26 — Add research_monitors table for Researcher agent

- **`research_monitors` table** — stores scheduled research monitoring topics for the Researcher agent. Each monitor has a `subject`, an array of `search_queries` to run on each check, a `frequency` (daily/weekly/fortnightly), and a `last_digest` field storing a prose summary of the previous result for semantic change comparison. The `notify_signal` and `notify_agent` fields control how changes are surfaced. Supports the Researcher's `purpose: 'monitor'` workflow — a cron-triggered process queries due monitors, runs web searches, and compares current findings against the prior digest to detect material changes.
- **Partial index on `next_run_at`** — filtered `WHERE is_active = TRUE` so the hourly monitor check only scans active records.

---

## 2026-03-25 — Fix agent_conversations RLS policy for Supabase Realtime

- **`agent_conversations_all` policy** — added `'service_role'` to the `auth.role()` check. Standard Supabase API calls bypass RLS when using the `service_role` key, but `postgres_changes` Realtime subscriptions perform their own authorization check using the JWT claim. `auth.role()` returns `'service_role'` for that key, which the `= 'authenticated'`-only policy rejected — causing the Realtime subscription to hang silently until timeout and never reach `SUBSCRIBED`.

---

## 2026-03-19 — Initial schema

Consolidated schema established. Key design decisions:

- **`agent_activity` as universal audit trail** — every agent write operation logs here before touching the target table. Provides a tamper-evident record of all automated actions without relying on Postgres triggers.
- **`platform_capabilities` + `capacity_gaps`** — Simon uses these to track what the platform can and cannot do. `capacity_gaps` accumulates patterns of recurring capability shortfalls, informing what to build next.
- **`knowledge_items` with `VECTOR(1536)` + HNSW index** — uses pgvector for semantic search. Dimension matches OpenAI `text-embedding-3-small`. HNSW chosen over IVFFlat for lower query latency at the cost of higher build time (acceptable for this dataset size).
- **`knowledge_connections` graph edges** — separate table for entity relationships, traversed via recursive CTEs in `packages/db/src/rpc/`. Keeps the graph queryable without a dedicated graph DB.
- **`content_items` state machine** — `idea → draft → review → approved → published` enforced at application layer (not DB constraints) to allow agents to move items through the pipeline with human approval gates.
- **`requirements` with `user_stories` JSONB** — structured JSONB rather than a separate join table; the BA agent writes structured objects here during elicitation. Shape documented in `docs/agents/ba.md`.
- **`extracted_data` JSONB on several tables** — allows agents to store structured output without schema migrations during iteration. Shapes are documented per-agent in `docs/agents/`.
- **RLS: authenticated team members read/write everything** — two-person team, no row-level isolation needed between users. RLS is enabled (Supabase default) but policies grant full access to `authenticated` role.
