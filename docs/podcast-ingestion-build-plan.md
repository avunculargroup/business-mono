# Podcast Ingestion & Transcripts — Build Plan / Handoff

**Status:** In progress (backend). **Spec:** `docs/podcast-ingestion-spec.md`.
This doc is the living source of truth for a multi-session feature. Update the checklists as
work lands. The spec is the *what*; this doc is the *how* and the *where we are*.

---

## Decisions made

- **Backend-first.** Land the full ingestion backend before any web UI.
- **Dedicated `transcript_segments` table** (pgvector) with per-chunk
  `start_seconds`/`end_seconds`/`speaker` — enables "Episode X at 23:14" timestamp deep-links.
  We deliberately did NOT reuse `content_embeddings` (it has no timestamp columns).
- **One Deepgram correlation mechanism** (`deepgram_request_id` + the existing webhook) for
  BOTH batch and brief ingestion. We did NOT build the spec's separate per-brief suspend/resume
  workflow — one waterfall, one reconciliation path.

## Spec corrections (verified against the codebase — do not re-litigate)

1. The Deepgram callback is **not** a Next.js route. Webhooks are served from the Mastra agents
   server via Hono `apiRoutes` (`apps/agents/src/mastra/index.ts:83-89`). The podcast callback
   stays in `apps/agents/src/webhooks/deepgram.ts`.
2. `handleDeepgramWebhook` is **hardcoded to resume the `recorder` workflow** (`runId =
   request_id`). It must disambiguate: match `podcast_episodes.deepgram_request_id` first, else
   fall through to the recorder resume.
3. `runNewsSourceScan` iterates **all** active `news_sources` with no type filter
   (`executeRoutineWorkflow.ts:892-895`). Must be filtered to `source_type='rss'` or it breaks
   on podcast feeds. (Regression guard — ships with the podcast routine.)
4. `news_sources.feed_url` is `NOT NULL UNIQUE` (`20260525000000_add_news_sources.sql:18`),
   which conflicts with `source_type='youtube'` (no feed URL). Make it nullable + partial unique
   index + a per-type presence CHECK.
5. `youtubeTranscript` (`apps/agents/src/tools/youtube.ts:89-92`) returns a pre-joined
   `[MM:SS] text` string, losing structured timestamps. Add a `fetchYoutubeSegments()` sibling.
6. `embedSource()` writes to `content_embeddings` — not reusable. Reuse only `embedText()` /
   `chunkText()`; write a dedicated `transcript_segments` writer.
7. Rex already does podcast→YouTube discovery in its `ingest_url` purpose
   (`researcher/index.ts:51-64`) but persists nothing. Brief ingestion shares the new
   `resolveTranscript` lib instead of duplicating it.
8. No `modelScopes` change — the pipeline is deterministic (no LLM step; YouTube mapping is
   explicit-link-only regex, not an LLM).

---

## Backend checklist

- [ ] **Step 1 — Migration** `supabase/migrations/<ts>_add_podcast_ingestion.sql`: extend
  `news_sources` (`source_type`, `youtube_channel_url`, `transcribe_with_deepgram`,
  `preferred_transcript_lang`, `max_backfill_episodes`, `max_episode_age_days`; nullable
  `feed_url` + partial unique + per-type CHECK); `podcast_episodes`; `transcript_segments`
  (HNSW cosine); views `v_podcast_ingestion_status` + `v_episodes_awaiting_action`; RPC
  `vector_search_transcripts` (one row per segment); extend `routines_action_type_check`; seed
  one daily `podcast_ingest` routine (`agent_name='archie'`). Then `pnpm --filter @platform/db
  generate-types`. Reference-update `schema.sql` + `docs/schema-changes.md`.
- [ ] **Step 2 — Shared types** `packages/shared/src/`: `RoutineActionType.PODCAST_INGEST` +
  `PodcastIngestConfig`/`PodcastIngestResult` (`routines.ts`); `source_type` + podcast fields on
  `NewsSourceRecord`, nullable `feed_url` (`news.ts`); new `podcasts.ts`
  (`TranscriptStatus`/`Source`/`Format`/`IngestionOrigin`, `PodcastEpisode`,
  `TranscriptSegment`, `PodcastBrief`).
- [ ] **Step 3 — Waterfall lib** `apps/agents/src/lib/transcripts/`: `parsers.ts`
  (vtt/srt/json/html/text → `{text, segments, hasTimestamps}`), `selectTranscriptTag.ts`
  (lang then `json>srt/vtt>html>text`), `resolveTranscript.ts` (feed tag → explicit-link
  YouTube → Deepgram-if-opted-in → skipped). Shared callback base in
  `apps/agents/src/lib/deepgramCallback.ts` (extracted from `recorder/workflow.ts:10-12`).
- [ ] **Step 4 — Routine** `executeRoutineWorkflow.ts`: filter `runNewsSourceScan` to
  `source_type='rss'`; add `runPodcastIngest` (load podcast sources → `fetchFeed` w/ rss-parser
  `customFields` → `normalizePodcastItems` in new `apps/agents/src/lib/podcastFeed.ts` → dedupe
  `(source_id,guid)` + `max_backfill_episodes` → `resolveTranscript` per new episode →
  chunk+embed available → update sources); `agent_name='archie'` in `persistAndSchedule` for
  podcast runs.
- [ ] **Step 5 — Webhook + process** `webhooks/deepgram.ts` disambiguation; new
  `lib/transcripts/processPodcastTranscript.ts` (plain async — build timed segments from
  `results.utterances`, set `available`/`deepgram`/`has_timestamps`, embed, log to
  `agent_activity`).
- [ ] **Step 6 — Segment builder/embedder** `lib/transcripts/embedSegments.ts`:
  `buildSegments` (timestamp-preserving windows / plain-text fallback), `embedEpisodeSegments`
  (batch embed via new `embedTexts(string[])` in `contentEmbeddings.ts`, idempotent
  delete-then-insert). Called from Step 4 and Step 5.
- [ ] **Step 7 — Rex retrieval** `packages/db/src/rpc/transcriptSearch.ts`
  (`transcriptVectorSearch`); `query_transcripts` tool in `researcher/tools.ts` + register in
  `researcher/index.ts` (deep-link compute + prompt line).
- [ ] **Step 8 — Brief ingestion** `archivist/tools.ts` `ingest_episode` tool (ad-hoc episode,
  `source_id=NULL`, `ingestion_origin='brief'`, `curator_note=why`, Deepgram allowed); Simon
  routing line.
- [ ] **Step 9 — modelScopes** — no change (documented why above).
- [ ] **Tests** — `parsers`, `selectTranscriptTag`, `resolveTranscript`, `podcastFeed`,
  `embedSegments`, `podcastIngest`, `deepgram` disambiguation. Add `buildPodcastSource` /
  `buildPodcastFeedItem` / `buildPodcastEpisodeRow` to `test/factories.ts`. Gate:
  `pnpm --filter @platform/agents test` + `typecheck`.

---

## Deferred: Web app (next session)

Surfaces **inside the existing news/content area**, not a new top-level section. Everything
goes through the `bts-design` skill (tokens, type, motion) and `docs/brand-voice.md` (microcopy,
no exclamation marks). Spec §"Web App" is the full brief; the actionable pieces:

1. **Type-aware add/edit source form.** Make `apps/web/app/(app)/news/sources/NewsSourceForm.tsx`
   type-aware: a `source_type` selector at top drives progressive disclosure (≤150ms reveal) of
   per-type fields (see spec field-visibility table). The **Deepgram toggle is a money switch** —
   default off; when on, show a `--color-warning` helper line ("Deepgram transcription is billed
   per minute of audio. Only used when no free transcript is available."). Update the server
   action `apps/web/app/actions/newsSources.ts` and `NewsSourceFormValues` for the new fields.
   Feed list row gains: type chip, episode count, transcript-coverage %, Deepgram on/off (gold
   dot).
2. **Ingestion dashboard** (reads `v_podcast_ingestion_status`): KPI stat-card row (total /
   available / in-progress / needs-attention); transcript-source horizontal **stacked bar** that
   doubles as a spend gauge (`feed_tag`=gold, `youtube`=success, `deepgram`=warning,
   skipped=muted); ingestion-over-time area chart (confirms the cron ran); per-feed health cards.
3. **Embedded media:** click-to-play facade → `youtube-nocookie.com/embed/{id}` (reuse
   `extractVideoId` from `apps/agents/src/tools/youtube.ts` — or port to web); timestamp
   deep-link via `?start=`; audio-only fallback with transcript-seek. Don't mount heavy players
   on list render.
4. **Episode list & detail:** list (title/source/published/status badge/transcript-source
   chip/duration; filters; per-row "Fetch transcript"/"Transcribe with Deepgram"/"Retry"); detail
   (media at top, rendered transcript w/ speaker labels + clickable timestamps, provenance panel,
   "Ingest an episode" brief entry point). Status badge tokens: available=success,
   transcribing=warning, pending/resolving=secondary, skipped=muted, failed=destructive.

New web data needs: a `podcast_episodes` read action/page and per-row actions that re-trigger the
waterfall (call the agents server or write a flag the routine/webhook picks up — decide next
session). Numbers in `JetBrains Mono`.

## Other follow-ups (deferred)

- Archive raw Deepgram VTT/SRT to the storage bucket (we paid for it); feed-tag raw optional.
- Relevance gating before embedding (only if pgvector noise becomes a problem) — would add an
  LLM step and a `modelScopes` entry then.
- Cross-source dedupe (same episode as RSS item *and* mapped YouTube video).
- Thin Rex's `ingest_url` podcast branch to delegate to Archie's `ingest_episode`.
