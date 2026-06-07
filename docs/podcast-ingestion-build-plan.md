# Podcast Ingestion & Transcripts — Build Plan / Handoff

**Status:** Backend + web UI complete (tests + typecheck + lint green). **Spec:** `docs/podcast-ingestion-spec.md`.
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

All backend steps below are **done** and verified by `pnpm typecheck` + `pnpm lint` +
`pnpm --filter @platform/agents test` (290 tests, 37 new). The migration has NOT yet been
applied to the remote DB — it auto-applies on push to `main` (or run `supabase db push`), after
which run `pnpm --filter @platform/db generate-types` to drop the boundary casts noted below.

- [x] **Step 1 — Migration** `supabase/migrations/<ts>_add_podcast_ingestion.sql`: extend
  `news_sources` (`source_type`, `youtube_channel_url`, `transcribe_with_deepgram`,
  `preferred_transcript_lang`, `max_backfill_episodes`, `max_episode_age_days`; nullable
  `feed_url` + partial unique + per-type CHECK); `podcast_episodes`; `transcript_segments`
  (HNSW cosine); views `v_podcast_ingestion_status` + `v_episodes_awaiting_action`; RPC
  `vector_search_transcripts` (one row per segment); extend `routines_action_type_check`; seed
  one daily `podcast_ingest` routine (`agent_name='archie'`). Then `pnpm --filter @platform/db
  generate-types`. Reference-update `schema.sql` + `docs/schema-changes.md`.
- [x] **Step 2 — Shared types** `packages/shared/src/`: `RoutineActionType.PODCAST_INGEST` +
  `PodcastIngestConfig`/`PodcastIngestResult` (`routines.ts`); `source_type` + podcast fields on
  `NewsSourceRecord`, nullable `feed_url` (`news.ts`); new `podcasts.ts`
  (`TranscriptStatus`/`Source`/`Format`/`IngestionOrigin`, `PodcastEpisode`,
  `TranscriptSegment`, `PodcastBrief`).
- [x] **Step 3 — Waterfall lib** `apps/agents/src/lib/transcripts/`: `parsers.ts`
  (vtt/srt/json/html/text → `{text, segments, hasTimestamps}`), `selectTranscriptTag.ts`
  (lang then `json>srt/vtt>html>text`), `resolveTranscript.ts` (feed tag → explicit-link
  YouTube → Deepgram-if-opted-in → skipped). Shared callback base in
  `apps/agents/src/lib/deepgramCallback.ts` (extracted from `recorder/workflow.ts:10-12`).
- [x] **Step 4 — Routine** `executeRoutineWorkflow.ts`: filter `runNewsSourceScan` to
  `source_type='rss'`; add `runPodcastIngest` (load podcast sources → `fetchFeed` w/ rss-parser
  `customFields` → `normalizePodcastItems` in new `apps/agents/src/lib/podcastFeed.ts` → dedupe
  `(source_id,guid)` + `max_backfill_episodes` → `resolveTranscript` per new episode →
  chunk+embed available → update sources); `agent_name='archie'` in `persistAndSchedule` for
  podcast runs.
- [x] **Step 5 — Webhook + process** `webhooks/deepgram.ts` disambiguation; new
  `lib/transcripts/processPodcastTranscript.ts` (plain async — build timed segments from
  `results.utterances`, set `available`/`deepgram`/`has_timestamps`, embed, log to
  `agent_activity`).
- [x] **Step 6 — Segment builder/embedder** `lib/transcripts/embedSegments.ts`:
  `buildSegments` (timestamp-preserving windows / plain-text fallback), `embedEpisodeSegments`
  (batch embed via new `embedTexts(string[])` in `contentEmbeddings.ts`, idempotent
  delete-then-insert). Called from Step 4 and Step 5.
- [x] **Step 7 — Rex retrieval** `packages/db/src/rpc/transcriptSearch.ts`
  (`transcriptVectorSearch`); `query_transcripts` tool in `researcher/tools.ts` + register in
  `researcher/index.ts` (deep-link compute + prompt line).
- [x] **Step 8 — Brief ingestion** `archivist/tools.ts` `ingest_episode` tool (ad-hoc episode,
  `source_id=NULL`, `ingestion_origin='brief'`, `curator_note=why`, Deepgram allowed); Simon
  routing line.
- [x] **Step 9 — modelScopes** — no change (documented why above).
- [x] **Tests** — added: `parsers.test.ts`, `selectTranscriptTag.test.ts`,
  `resolveTranscript.test.ts` (waterfall ordering/gating), `podcastFeed.test.ts`,
  `embedSegments.test.ts` (timestamp-preserving chunking), and the `deepgram.test.ts`
  disambiguation case. `runPodcastIngest` itself is NOT unit-tested directly — matching the repo
  convention (no routine handler, incl. `runNewsSourceScan`, has a unit test); its building
  blocks (waterfall, feed normalize, segment build, webhook) are covered. If desired later,
  extract the dedupe/backfill-cap logic to a pure helper and test it.

---

## Web app — done

All four pieces below shipped, surfaced under News (`/news/podcasts` dashboard + list,
`/news/podcasts/[id]` detail, and the type-aware `/news/sources` form). Nav entry added to the
sidebar's News group. `pnpm typecheck` + `pnpm lint` + `pnpm --filter @platform/agents test`
(300 tests) all green.

**Per-row re-run mechanism (the open decision) — resolved:** mirror the newsletter-gate web path.
A new migration adds `podcast_episodes.pending_action` (`refetch`/`deepgram`/`retry`); the web
server action `apps/web/app/actions/podcasts.ts` writes it, and a new Realtime listener
`apps/agents/src/listeners/podcastActionListener.ts` claims it atomically and re-runs the
waterfall for that one episode via the shared `apps/agents/src/lib/transcripts/reResolve.ts`
(`reResolveEpisode`, reusing `resolveTranscript` + `store.ts`). No HTTP from web → agents, in
keeping with the rest of the platform. The same path backs the web "Ingest an episode" brief
entry (ad-hoc `source_id=NULL` row, Deepgram opt-in).

- [x] **Type-aware source form** — `NewsSourceForm` reshapes by `source_type` with ≤150ms reveal;
  Deepgram money switch (warning helper line); `newsSources` server action + `NewsSourceFormValues`
  + the Simon-facing `manageNewsSources` tool all extended. Feed list row gains type chip, episode
  count, transcript-coverage %, and a gold Deepgram dot.
- [x] **Ingestion dashboard** (`v_podcast_ingestion_status`) — KPI cards, transcript-source stacked
  bar / spend gauge, 30-day ingestion-over-time SVG area chart, per-feed health.
- [x] **Embedded media** — click-to-play `youtube-nocookie` facade (`YouTubeFacade`) + audio
  fallback (`MediaEmbed`); `?start=` deep-links; `extractVideoId` ported to `apps/web/lib/podcasts.ts`.
- [x] **Episode list & detail** — filters + per-row actions (Fetch transcript / Transcribe with
  Deepgram / Retry); detail with media, clickable-timestamp transcript, provenance panel, brief entry.

### Original brief (for reference)

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

- ~~**Adding a podcast source today** requires a direct DB insert~~ — done. Use the type-aware
  `/news/sources` form, or Simon via the now-extended `manageNewsSources` tool
  (`apps/agents/src/tools/newsSources.ts`), which accepts `source_type` + the podcast/youtube fields.
- Archive raw Deepgram VTT/SRT to the storage bucket (we paid for it); feed-tag raw optional.
- Relevance gating before embedding (only if pgvector noise becomes a problem) — would add an
  LLM step and a `modelScopes` entry then.
- Cross-source dedupe (same episode as RSS item *and* mapped YouTube video).
- Thin Rex's `ingest_url` podcast branch to delegate to Archie's `ingest_episode`.
