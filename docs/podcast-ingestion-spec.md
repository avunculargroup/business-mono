# Feature Spec — Podcast Ingestion & Transcripts

**Platform:** Bitcoin Treasury Solutions Internal Platform
**Feature:** Podcast feeds, episode ingestion, transcript acquisition (waterfall), transcript embeddings
**Status:** Draft
**Last updated:** 2025-06-04

-----

## Overview

We already ingest RSS article feeds daily into `news_sources` via a scheduled workflow. This feature extends that pipeline to **podcasts** — capturing episodes and, crucially, their **transcripts**, so spoken Bitcoin treasury content becomes first-class, searchable, embeddable knowledge alongside written articles.

A podcast is just another feed, so it reuses the `news_sources` registry. The hard part is the transcript: an episode is an audio file, and audio is useless to Rex until it is text. There are three ways to get that text, in descending order of “free and effortless”:

1. **Feed-supplied transcript** — the Podcasting 2.0 `<podcast:transcript>` tag in the feed item. Free, instant, publisher-provided.
1. **YouTube transcript** — many podcasts publish to YouTube; we already have YouTube transcript capability. Free, but requires mapping the episode to a video and is fragile.
1. **Deepgram** — download the audio enclosure and transcribe it ourselves with Nova-3. Universal, but it costs money and takes minutes-to-hours, so it’s the fallback, not the default.

The design treats these as a **waterfall**: try the cheapest source first, fall through to the next only when needed. This minimises both cost and latency while guaranteeing we can transcribe *anything* if we choose to.

This is not a client-facing feature. It feeds agent context — Archie ingests, Rex researches against the embeddings, Charlie mines transcripts for content angles, and Simon surfaces failures and ad-hoc ingestion briefs.

-----

## Scope

### In scope

- Registering podcast feeds in `news_sources` (`source_type = 'podcast'`)
- Daily episode ingestion (dedupe by feed item GUID) into a new `podcast_episodes` table
- **Transcript waterfall**: `<podcast:transcript>` tag → YouTube → Deepgram
- Parsing the common transcript formats (JSON, VTT, SRT, HTML, plain text)
- Deepgram async transcription via the existing callback/webhook pattern
- Chunking + embedding transcripts into `transcript_segments` (pgvector) for RAG
- Brief-driven ad-hoc ingestion (Simon hands Archie a single episode/video with a *why*)
- Per-feed cost guardrails (Deepgram opt-in, backfill cap, max-age cap)
- Agent-readable views for ingestion status and research retrieval

### Out of scope

- Audio playback hosting (we link out to the publisher’s audio / YouTube)
- Speaker identification beyond what the source transcript already provides
- Real-time / live-stream transcription
- Translating non-English transcripts (we capture `language`, we don’t translate — yet)
- A general media library UI (episodes surface inside the existing news/content area)

-----

## The Transcript Waterfall

The single most important design decision in this feature. Each new episode runs through these stages until one succeeds:

```
                 ┌─────────────────────────────┐
   episode  ───▶ │ 1. <podcast:transcript> tag │ ──found──▶ parse ──▶ available
   (pending)     └──────────────┬──────────────┘
                                │ none
                                ▼
                 ┌─────────────────────────────┐
                 │ 2. YouTube transcript        │ ──found──▶ parse ──▶ available
                 │    (if a video is mapped)    │
                 └──────────────┬──────────────┘
                                │ none / unmapped
                                ▼
                 ┌─────────────────────────────┐
                 │ 3. Deepgram (audio enclosure)│
                 │    only if feed opts in      │ ──submit──▶ transcribing
                 └──────────────┬──────────────┘            (webhook resolves → available)
                                │ feed opted out
                                ▼
                            skipped
```

**Why this order.** Source 1 is free, instant, and authored by the publisher (best quality, often with speaker labels and timestamps). Source 2 is free but requires a video mapping and YouTube’s caption endpoint is notoriously flaky — good when available, never to be relied on. Source 3 always works but costs real money and real time, so it is gated behind an explicit per-feed opt-in. Letting it run unsupervised across a 600-episode back catalogue is the fastest way to turn a daily cron into a surprise invoice.

**Transcript source preference within a single feed item.** A `<podcast:transcript>` item may appear multiple times (different formats / languages). Pick in this order, filtered to the configured language: `application/json` (Podcasting 2.0 — richest, speaker + timestamps) → `application/srt` / `text/vtt` (timestamped) → `text/html` → `text/plain`.

-----

## User Stories

**As a founder, I need to:**

- Add a podcast feed once and have new episodes ingested daily without touching it again
- See, per episode, whether we have a transcript and *where it came from*
- Decide per feed whether Deepgram is allowed to spend money transcribing it
- Hand Simon a one-off episode or YouTube link (“transcribe this, it’s relevant because…”) and have it ingested with that note attached
- Search episode transcripts the same way I search articles
- Cap how far back a new feed back-fills, so adding a 10-year-old show doesn’t transcribe a decade overnight

**As Archie (Archivist), I need to:**

- Run the daily podcast ingestion as part of the existing scheduled workflow
- Resolve each new episode’s transcript through the waterfall
- Submit audio to Deepgram with a callback and reconcile the result when the webhook fires
- Chunk and embed every resolved transcript, preserving timestamps where available
- Accept an ingestion brief from Simon for content without a clean feed URL

**As Rex (Researcher), I need to:**

- Retrieve transcript segments by semantic similarity, with episode + timestamp provenance
- Cite “Episode X at 23:14” and deep-link to the moment in the source audio/video

**As Simon (coordinator agent), I need to:**

- Forward an ad-hoc ingestion brief to Archie
- Surface transcript failures (e.g. a feed that opted out of Deepgram and has no captions) as a pending action, not a silent gap
- Know ingestion is healthy via `v_podcast_ingestion_status`

-----

## Data Model

### `news_sources` (existing — additive changes)

The existing feeds table gains a discriminator and podcast-specific config. (Column names below assume the existing table already carries generic feed fields — `id`, `name`, `feed_url`, `is_active`, `last_fetched_at`. Adjust to match production.)

|Column                     |Type   |Notes                                                               |
|---------------------------|-------|--------------------------------------------------------------------|
|`source_type`              |TEXT   |`rss`, `podcast`, `youtube`. Default `rss`. CHECK constrained.      |
|`youtube_channel_url`      |TEXT   |Optional — used to map episodes to videos for the YouTube fallback  |
|`transcribe_with_deepgram` |BOOLEAN|Default `false`. The Deepgram opt-in gate. Off = cheap by default.  |
|`preferred_transcript_lang`|TEXT   |Default `en`. Filters multi-language `<podcast:transcript>` tags.   |
|`max_backfill_episodes`    |INT    |Default `25`. Cap on episodes ingested on first fetch of a new feed.|
|`max_episode_age_days`     |INT    |Default `NULL` (no cap). Skip episodes older than this on Deepgram. |

-----

### `podcast_episodes`

One row per episode. The transcript lives here for display and full-text search; embeddings live in `transcript_segments`.

|Column                 |Type       |Notes                                                                                  |
|-----------------------|-----------|---------------------------------------------------------------------------------------|
|`id`                   |UUID       |PK                                                                                     |
|`source_id`            |UUID       |FK → `news_sources`. NULL for brief-driven ad-hoc episodes with no feed.               |
|`guid`                 |TEXT       |Feed item GUID (or video ID / URL hash for ad-hoc). Dedupe key.                        |
|`title`                |TEXT       |                                                                                       |
|`description`          |TEXT       |Episode show notes (often where a YouTube link hides)                                  |
|`episode_url`          |TEXT       |Public episode page                                                                    |
|`audio_url`            |TEXT       |Enclosure URL — the input to Deepgram                                                  |
|`audio_mime_type`      |TEXT       |e.g. `audio/mpeg`                                                                      |
|`duration_seconds`     |INT        |From feed `<itunes:duration>` if present — used for Deepgram cost estimation           |
|`youtube_url`          |TEXT       |Mapped video, if any                                                                   |
|`season`               |INT        |                                                                                       |
|`episode_number`       |INT        |                                                                                       |
|`image_url`            |TEXT       |                                                                                       |
|`published_at`         |TIMESTAMPTZ|                                                                                       |
|`transcript_status`    |TEXT       |`pending`, `resolving`, `transcribing`, `available`, `failed`, `skipped`               |
|`transcript_source`    |TEXT       |`feed_tag`, `youtube`, `deepgram`, `manual`, NULL                                      |
|`transcript_format`    |TEXT       |`json`, `vtt`, `srt`, `html`, `text`, NULL                                             |
|`transcript_lang`      |TEXT       |                                                                                       |
|`transcript_text`      |TEXT       |Full plain-text transcript for display + Postgres FTS                                  |
|`transcript_raw_url`   |TEXT       |Original transcript URL (feed tag case) — kept for re-parse / audit                    |
|`has_timestamps`       |BOOLEAN    |Default `false`. True for json/vtt/srt/deepgram — enables timestamp deep-links         |
|`deepgram_request_id`  |TEXT       |Correlation key for matching the async Deepgram callback                               |
|`transcript_error`     |TEXT       |Why it failed, if `failed` — surfaced to Simon                                         |
|`ingestion_origin`     |TEXT       |`feed`, `brief`, `manual`. Default `feed`.                                             |
|`curator_note`         |TEXT       |The *why* — populated from Simon’s brief. First-class, per the curator-notes principle.|
|`topic_tags`           |TEXT[]     |e.g. `['treasury', 'regulation', 'mining']` — for relevance filtering                  |
|`transcript_fetched_at`|TIMESTAMPTZ|                                                                                       |
|`embedded_at`          |TIMESTAMPTZ|NULL until segments are embedded                                                       |
|`created_by`           |UUID       |FK → `team_members` (NULL for agent-only ingestion)                                    |
|`created_at`           |TIMESTAMPTZ|                                                                                       |
|`updated_at`           |TIMESTAMPTZ|Auto-updated                                                                           |

**Unique constraint:** `(source_id, guid)` — the dedupe guarantee for feed ingestion. For ad-hoc (`source_id IS NULL`), enforce uniqueness on `guid` (a hash of the audio/video URL).

**`transcript_status` lifecycle:**

```
pending → resolving → available            (feed tag or YouTube hit)
pending → resolving → transcribing → available   (Deepgram path, resolved by webhook)
                    → skipped              (no transcript + feed opted out of Deepgram)
                    → failed               (all sources errored — Simon is told)
```

-----

### `transcript_segments`

Chunked, embedded transcript content for RAG. One row per chunk.

|Column         |Type         |Notes                                                                       |
|---------------|-------------|----------------------------------------------------------------------------|
|`id`           |UUID         |PK                                                                          |
|`episode_id`   |UUID         |FK → `podcast_episodes` ON DELETE CASCADE                                   |
|`segment_index`|INT          |Ordinal within the episode                                                  |
|`start_seconds`|NUMERIC(10,2)|NULL when the source has no timestamps                                      |
|`end_seconds`  |NUMERIC(10,2)|                                                                            |
|`speaker`      |TEXT         |If the source labelled speakers (Podcasting 2.0 JSON / Deepgram diarization)|
|`content`      |TEXT         |The chunk text — target ~500–800 tokens with ~15% overlap                   |
|`token_count`  |INT          |                                                                            |
|`embedding`    |VECTOR(1536) |`text-embedding-3-small`                                                    |
|`created_at`   |TIMESTAMPTZ  |                                                                            |

**Index:** an `ivfflat` (or `hnsw`) index on `embedding` consistent with the rest of the pgvector setup, plus `idx_transcript_segments_episode ON transcript_segments(episode_id)`.

**Timestamp deep-links:** when `start_seconds` is present, a retrieved segment can render a play link — `{youtube_url}&t={start}s` or an audio player seek. This is the payoff for preferring timestamped transcript formats earlier in the waterfall.

-----

## Database Views

### `v_podcast_ingestion_status`

Health dashboard for Archie and the UI — counts and stragglers by status.

```sql
CREATE VIEW v_podcast_ingestion_status AS
  SELECT
    e.id,
    e.title,
    e.published_at,
    e.transcript_status,
    e.transcript_source,
    e.has_timestamps,
    e.embedded_at,
    e.transcript_error,
    ns.name AS source_name,
    ns.transcribe_with_deepgram
  FROM podcast_episodes e
  LEFT JOIN news_sources ns ON ns.id = e.source_id
  ORDER BY e.published_at DESC;
```

### `v_episodes_awaiting_action`

What the workflow (and Simon) should look at: episodes stuck mid-waterfall or in error.

```sql
CREATE VIEW v_episodes_awaiting_action AS
  SELECT
    e.id,
    e.title,
    e.transcript_status,
    e.deepgram_request_id,
    e.transcript_error,
    ns.name AS source_name
  FROM podcast_episodes e
  LEFT JOIN news_sources ns ON ns.id = e.source_id
  WHERE e.transcript_status IN ('pending', 'resolving', 'transcribing', 'failed')
  ORDER BY e.created_at ASC;
```

-----

## Ingestion Workflow (Mastra)

This is a **Workflow**, not an Agent — it’s a deterministic pipeline (fetch → dedupe → resolve → embed) with no open-ended reasoning. The only fuzzy step (episode → YouTube video matching) is a bounded helper, not a reason to reach for an Agent.

### Daily batch (extends the existing news workflow)

1. **Fetch** each active `news_sources` row where `source_type = 'podcast'`; parse the feed.
1. **Upsert episodes** — for each `<item>`, dedupe on `(source_id, guid)`. New episodes insert as `pending`, respecting `max_backfill_episodes` on first fetch.
1. **Resolve transcript** per new episode (the waterfall step):
- **a.** Read `<podcast:transcript>` tags; if present, fetch the best-format URL, parse, store, `available`.
- **b.** Else, if a `youtube_url` is known (from show notes) or derivable from `youtube_channel_url` + title/date match, call the existing YouTube transcript capability; on success store, `available`.
- **c.** Else, if the feed has `transcribe_with_deepgram = true` (and the episode passes `max_episode_age_days`), submit `audio_url` to Deepgram **with a callback URL**, store `deepgram_request_id`, set `transcribing`. **Do not block.**
- **d.** Else `skipped`.
1. **Chunk + embed** every episode that reached `available` this run; write `transcript_segments`; stamp `embedded_at`.
1. **Log** the run summary to `agent_activity` (`agent_name: 'archie'`, `trigger_type: 'scheduled'`).

### Deepgram async leg — deliberately decoupled

The Deepgram path does **not** suspend the daily workflow. A batch could contain many hours of audio; holding a single workflow run suspended for the slowest episode to come back is brittle and blocks everything behind it. Instead:

- The workflow submits with a callback and moves on.
- A **webhook endpoint** (Next.js route handler) receives Deepgram’s callback, matches `deepgram_request_id`, stores the transcript (`transcript_source: 'deepgram'`, `has_timestamps: true`), sets `available`, and triggers a small **process-transcript workflow** that does the chunk + embed for just that episode.

> Suspend/resume *is* the right tool for the **on-demand single-episode** case — Simon’s brief: “transcribe this one.” There, a single tracked run can suspend on the Deepgram callback and resume cleanly, because there’s exactly one thing in flight and a human is waiting on it. Batch and on-demand want different shapes; build both.

**Implementation note:** verify Mastra workflow/step + suspend/resume signatures against the installed version (`node_modules/@mastra/core`) before writing it — these APIs move, and training data lies about them with a straight face.

-----

## Agent Integration

### Archie — ingestion owner

Owns the daily workflow above and the brief-driven path. Reads `v_episodes_awaiting_action` to retry stragglers. Never advances anything past data capture — it ingests, it doesn’t publish.

### Brief-driven ingestion (Simon → Archie)

For content without a clean feed (a one-off YouTube interview, an audio file someone sent over Signal), Simon forwards a brief: `{ audio_url | youtube_url, title?, why }`. Archie creates a `podcast_episodes` row with `source_id = NULL`, `ingestion_origin = 'brief'`, and `curator_note = why`. The episode then runs the same waterfall (skipping step a if there’s no feed tag). The curator note rides along into retrieval, so Rex knows *why this was worth saving* — the difference between generic retrieval and contextually intelligent recall.

### Rex — research consumer

Queries `transcript_segments` by embedding similarity, returns content with episode title, `start_seconds`, and `curator_note` so citations carry provenance and a timestamp deep-link.

### Simon — surfacing failures

Episodes in `failed`, or `skipped` on a feed the human probably *wanted* transcribed, get surfaced as a pending action, not buried. Example Signal message:

```
Podcast ingestion — 2 items need a decision:

FAILED — "The Treasury Standard, Ep 142": no feed transcript, no YouTube
         match, audio download 403'd. Want me to retry or skip?
SKIPPED — "Macro & Sats" added 6 new episodes with no captions.
          Deepgram is off for this feed — turn it on?

Reply to action either.
```

-----

## Web App

Surfaces inside the existing news/content area, not a new top-level section. Everything here follows `DESIGN_BRIEF.md`: warm off-white surfaces, Playfair for headings, `JetBrains Mono` for every number, gold used sparingly and *earned*, Lucide icons at `stroke-width: 1.5`, skeleton loaders over spinners, no exclamation marks in copy.

Two pieces of net-new work, plus the existing episode views.

### 1. Source registry — type-aware add / edit form

The existing add-source form currently assumes an article RSS feed. The change: it gains a **`source_type` selector** at the top that drives **progressive disclosure** of type-specific fields. Pick the type first; the form reshapes to ask only what that type needs.

**Field visibility by `source_type`:**

|Field                      |`rss`|`podcast`|`youtube`|Notes                                                    |
|---------------------------|:---:|:-------:|:-------:|---------------------------------------------------------|
|`name`                     |✓    |✓        |✓        |Display name                                             |
|`feed_url`                 |✓    |✓        |—        |RSS / podcast feed URL                                   |
|`youtube_channel_url`      |—    |optional |✓        |Channel/playlist; for podcasts, aids the YouTube fallback|
|`is_active`                |✓    |✓        |✓        |Toggle                                                   |
|`transcribe_with_deepgram` |—    |✓        |—        |The money switch — default **off**                       |
|`preferred_transcript_lang`|—    |✓        |✓        |Default `en`                                             |
|`max_backfill_episodes`    |—    |✓        |✓        |Default `25`                                             |
|`max_episode_age_days`     |—    |✓        |✓        |Optional                                                 |

**Design notes:**

- The type selector is a segmented control or select at the very top. Changing it reveals/hides the conditional block with a subtle reveal (≤150ms fade/height, no bounce — per the motion rules).
- **The Deepgram toggle is a money switch and should look like one without shouting.** Default off. When switched on, a `--color-warning` helper line appears beneath it in plain language: *“Deepgram transcription is billed per minute of audio. Only used when no free transcript (feed or YouTube) is available.”* No alarm, no exclamation — just an honest heads-up in the warning tone.
- Inputs use the brief’s form styling: `--color-border`, `6px` radius, gold focus border + `rgba(201,168,76,0.15)` glow.
- Submit label is specific: “Add source” / “Save source”, never “Submit”.
- Feed list (below the form) shows: name, type chip, last-fetched, episode count, transcript-coverage %, and a Deepgram on/off indicator (gold dot = on).

### 2. Ingestion dashboard (the daily routine’s monitoring surface)

A dashboard component for the scheduled ingestion workflow — not a raw table, a *glanceable* health view. Reads `v_podcast_ingestion_status` and aggregates. Top-to-bottom:

**a. KPI stat-card row** — four cards: total episodes, transcripts available, in-progress (`resolving` + `transcribing`), needs-attention (`failed` + `skipped`). Big `JetBrains Mono` numerals, a Lucide icon per card, gold reserved for the headline metric only. `--shadow-sm`, white surface, `12px` radius.

**b. Transcript-source breakdown** — a single horizontal stacked bar (not a pie — the brief wants restraint), segmented by where transcripts came from this period:

- `feed_tag` → **gold** (`--color-gold`) — free and best
- `youtube` → **success green** (`--color-success`) — free
- `deepgram` → **warning** (`--color-warning`) — *the paid one*
- `skipped` / none → **muted** (`--color-text-tertiary`)

This bar quietly doubles as a **spend gauge**: the more warning-coloured it gets, the more we’re paying Deepgram. One look tells you whether the free sources are pulling their weight. (The colour of money leaving the building is, fittingly, gold-adjacent.)

**c. Ingestion-over-time** — an area/line chart of episodes ingested per day over the trailing ~30 days. Gold line, warm-grey gridlines (`--color-border`), `JetBrains Mono` axis labels. Its real job: confirm at a glance that the daily routine *actually ran* — a flat-line gap means the cron died, which is exactly the thing you want to notice without reading logs.

**d. Per-feed health** — compact cards or a table: feed name, last run, new episodes last run, transcript coverage %, Deepgram on/off chip. A feed at 0% coverage with Deepgram off is a candidate for Simon’s nudge.

**e. Recent episodes** — cards with title, source chip, status badge, and — where `youtube_url` is present — an **embedded video** (see below). This is where the dashboard stops being abstract and lets you actually watch/listen to what just came in.

### 3. Embedded media

When an episode has a video or audio source, the UI plays it inline rather than bouncing the user out.

- **Video (when `youtube_url` present):** responsive 16:9 embed via privacy-friendly `https://www.youtube-nocookie.com/embed/{videoId}`. Use a **click-to-play facade** — render the poster thumbnail + a gold play button, and only swap in the real `<iframe>` on click. This keeps the dashboard from loading a dozen heavy YouTube players on mount (a real perf and “lightness is the aesthetic” win), and avoids YouTube’s chrome until the user actually wants it.
- **Timestamp deep-link:** to jump to a transcript moment, append `?start={start_seconds}` to the embed URL — so a retrieved `transcript_segments` row deep-links straight into the video.
- **Audio-only fallback:** no video but `audio_url` + `has_timestamps` → a native `<audio>` element with the transcript rendered alongside; clicking a segment seeks the player (`audio.currentTime = start_seconds`).
- **Video ID extraction:** derive `videoId` from `youtube_url` once (the `v=` query param, or the `youtu.be/<id>` path) — store it or compute in a small helper; don’t re-parse in the render path.

### 4. Episodes list & detail (unchanged from prior section, now linking the embed)

- **List** — table: title, source, published, status badge, transcript-source chip, duration. Filters: status, source, has-transcript, topic tag. Per-row actions: “Fetch transcript” (re-run waterfall), “Transcribe with Deepgram” (manual override of the opt-out), “Retry”. Numbers in `JetBrains Mono`.
- **Status badges** (design tokens): `available` → success green; `transcribing` → warning; `pending`/`resolving` → secondary; `skipped` → muted; `failed` → destructive.
- **Detail** — embedded media at the top (video facade or audio player), rendered transcript with speaker labels and clickable timestamps, a provenance panel (source, format, language, fetched/embedded times, curator note), and a brief-ingest entry point: “Ingest an episode” → paste audio or YouTube URL + a note.

-----

## Cost & Rate-Limit Guardrails

- **Deepgram is opt-in per feed** (`transcribe_with_deepgram`, default off). Nothing spends money unless explicitly switched on.
- **Backfill cap** (`max_backfill_episodes`, default 25) prevents transcribing a full back catalogue on first fetch.
- **Age cap** (`max_episode_age_days`) optionally skips Deepgram on old episodes even when opted in.
- **Duration-based estimate** before submitting to Deepgram (`duration_seconds`) — log estimated cost to `agent_activity` so spend is auditable.
- **YouTube fragility budget:** treat YouTube failures as non-fatal — fall through to Deepgram (if enabled) or `skipped`; never let a flaky caption endpoint fail the whole run.
- **Embedding batching:** batch `text-embedding-3-small` calls per episode rather than per chunk.

-----

## Open Questions

- **Episode → YouTube mapping reliability.** Title/date fuzzy-matching against a channel is error-prone. Safer: only use YouTube when the feed item or show notes contain an explicit video link; otherwise skip straight to Deepgram. Recommend starting with explicit-link-only and revisiting if the hit rate is poor.
- **Cross-source duplication.** The same episode may exist as an RSS item *and* a mapped YouTube video. The `(source_id, guid)` constraint dedupes within a feed but not across. Defer until it actually bites — likely rare given we prefer the feed tag first.
- **Raw transcript storage.** `transcript_text` (plain text) lives on the row; should the original VTT/SRT/JSON also be archived in the Supabase storage bucket via `packages/storage` for re-parsing? Recommend yes for Deepgram output (we paid for it), optional for feed tags (re-fetchable from `transcript_raw_url`).
- **Chunking strategy.** Token-based fixed windows with overlap to start. If retrieval quality is poor on long rambling interviews, consider semantic / speaker-turn chunking. Defer until Rex usage shows the seams.
- **Relevance gating before embedding.** Should every episode be embedded, or only those passing a topic-relevance check (to avoid filling pgvector with off-topic chatter)? Recommend embedding everything ingested for now — the human/brief already decided it was worth ingesting — and add gating only if vector noise becomes a problem.
- **Reuse vs. separate table.** Episodes could be shoehorned into the existing article-items table with nullable audio/transcript columns. Recommend the dedicated `podcast_episodes` table: the transcript state machine, audio fields, and Deepgram correlation don’t belong on an article row, the same way contracts didn’t belong on compliance documents.