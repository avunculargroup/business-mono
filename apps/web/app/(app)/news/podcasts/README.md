# Podcast & Episode pages

Reference for the web UI at `/news/podcasts` (the ingestion dashboard) and
`/news/podcasts/[id]` (a single episode). This document describes the **current
state** of the UX and UI only — the ingestion pipeline itself lives in
`apps/agents` and is specced in `docs/podcast-ingestion-spec.md`.

Both pages are server components that read from Supabase and hand data to a
client component. They live under the authenticated `app/(app)/` shell, in the
**News** section, and share the app-wide `PageHeader`, design tokens, and UI kit
(`DataTable`, `StatusChip`, `Button`, `Modal`, toasts).

## File map

| File | Role |
|------|------|
| `page.tsx` | Server component for the dashboard. Fetches the three data sets, aggregates per-feed health, renders `PodcastDashboard`. |
| `PodcastDashboard.tsx` | Client component. All dashboard UI: KPIs, charts, feed health, recent grid, filterable table, ingest modal. |
| `podcasts.module.css` | Dashboard styles. |
| `[id]/page.tsx` | Server component for one episode. Fetches the episode, its transcript segments, and its source name. |
| `[id]/EpisodeDetail.tsx` | Client component. Header + actions, media, description, transcript, provenance sidebar. |
| `[id]/detail.module.css` | Episode styles. |
| `[id]/EpisodeDetail.test.tsx` | Component tests for the episode view. |
| `../../../components/podcasts/` | Shared media components: `MediaEmbed`, `YouTubeFacade`, `AudioPlayer`. |
| `../../../lib/podcasts.ts` | Client-safe helpers: video-ID parsing, HTML→text, timestamp formatting, status/source label + colour maps. |
| `../../../app/actions/podcasts.ts` | Server actions: `requestEpisodeAction`, `ingestEpisodeBrief`. |
| `packages/shared/src/podcasts.ts` | `TranscriptStatus`, `TranscriptSource`, `IngestionOrigin`, `PodcastEpisode`, `TranscriptSegment` types. |

## Data model (as the UI sees it)

An episode's transcript moves through a lifecycle, and both pages colour and
label it from the same maps in `lib/podcasts.ts`:

| Status | Label | Chip colour | Meaning |
|--------|-------|-------------|---------|
| `pending` | Pending | neutral | Queued, waterfall not started |
| `resolving` | Resolving | neutral | Looking for a free transcript (feed tag / YouTube) |
| `transcribing` | Transcribing | warning (amber) | Handed to Deepgram, awaiting its webhook |
| `available` | Available | success (green) | Transcript stored and usable |
| `failed` | Failed | destructive (red) | Every source errored |
| `skipped` | Skipped | neutral | No free transcript and Deepgram was off |

**Transcript source** (where a resolved transcript came from) is labelled:
`feed_tag → "Publisher feed"`, `youtube → "YouTube"`, `deepgram → "Deepgram"`,
`manual → "Manual"`. The cost story runs along this axis — publisher feed and
YouTube are free, Deepgram is billed per minute — and the UI reinforces it
everywhere (see the spend gauge and the Deepgram opt-ins below).

**Ingestion origin** distinguishes `feed` (arrived via a subscribed
podcast/YouTube source), `brief` (added ad hoc from the "Ingest an episode"
form), and `manual`.

---

## Dashboard page — `/news/podcasts`

Titled **"Podcast ingestion"**. This is a monitoring surface, not a media
library: it answers "is ingestion healthy, what's it costing, and what needs my
attention?" The server component (`page.tsx`) issues three parallel queries:

1. `v_podcast_ingestion_status` — one row per episode with source + status
   (the monitoring view).
2. `podcast_episodes` — the extra fields the view omits (`created_at`,
   `duration_seconds`, `topic_tags`), joined back by id.
3. `news_sources` filtered to `podcast`/`youtube` types — for per-feed health.

It then aggregates episode counts per source (total + how many are `available`)
into `coverage` percentages before rendering. Everything below is laid out top
to bottom inside a single centred column (`max-width: var(--content-max-width)`,
`--space-5` gaps).

### 1. KPI row

Four cards across the top (`grid`, 4 columns, collapsing to 2 columns under
880px). Each card is icon + big mono number + uppercase label:

- **Episodes** — total count. This is the *headline* card: its icon and value
  use the gold accent (`--color-accent-dark`) while the others stay neutral.
- **Transcripts available** — count of `available`.
- **In progress** — count of `resolving` + `transcribing`.
- **Needs attention** — count of `failed` + `skipped`.

Counts are computed client-side with `useMemo` over the (optimistic) episode
list, so they update instantly when a row action fires.

### 2. Charts row

Two side-by-side panels (collapse to stacked under 880px).

**"Where transcripts come from"** — a horizontal stacked bar acting as a spend
gauge, over only the `available` episodes. Segments: Publisher feed (gold
`--color-accent`), YouTube (green `--color-success`), Deepgram (amber
`--color-warning`), Skipped/none (grey). The hint text spells out the intent:
*"More warning-coloured means more Deepgram spend. Free sources keep the bar
gold and green."* Each segment has a hover `title` with its exact count, and a
legend below lists all four with counts. Zero-width segments are dropped from
the bar but kept in the legend. Empty state: "No episodes ingested yet."

**"Ingested over 30 days"** — a hand-rolled SVG area chart of episodes ingested
per day (bucketed by `created_at` over the trailing 30 days). Gold line over a
faint gold fill (`--color-accent-glow`), with the first and last date labels on
a mono axis. The hint — *"A gap means the daily routine did not run"* — frames
it as an uptime check. Empty state: "No ingestion history yet."

### 3. Feed health

Only rendered when there are `podcast`/`youtube` sources. A responsive grid of
cards (`auto-fill`, min 220px), one per feed:

- Feed name, and — for `podcast` sources only — a **Deepgram on/off** pill with
  a status dot (gold with a glow ring when on, grey when off). This is the
  per-feed toggle that governs whether paid transcription is allowed for that
  feed; the page surfaces it read-only.
- Stats line: `N episodes · N% transcribed` (mono numerals).
- `Last run <relative time>` from the source's `last_scanned_at`, or "never".

### 4. Recent episodes

Rendered when at least one episode has playable media. A grid (`auto-fill`, min
240px) of up to **4** cards, sorted by recency (`published_at`, falling back to
`created_at`), filtered to episodes that have a `youtube_url` or `audio_url`.
Each card is an inline `MediaEmbed` (click-to-play video facade, or a native
`<audio>` element) above a linked title, a source chip, and a status chip. This
is the one spot on the dashboard that leans "media library"; the title links to
the episode detail page.

### 5. All episodes (filterable table)

The main working surface.

- Header row: section title + a secondary **"Ingest an episode"** button
  (opens the brief modal, below).
- **Filter bar** — four native `<select>`s with uppercase labels: **Status**
  (all statuses), **Source** (all ingesting feeds), **Transcript** (Any / Has
  transcript / No transcript), and **Topic** (only shown when episodes carry
  `topic_tags`). Filters compose and are applied client-side via `useMemo`.
- **`DataTable`** with columns: **Episode** (title + a source chip beneath),
  **Published** (date or em-dash), **Status** (`StatusChip`), **Transcript**
  (source label or em-dash), **Duration** (right-aligned mono `M:SS`/`H:MM:SS`).
- **Row click** navigates to `/news/podcasts/[id]`.
- **Row actions menu** (`RowActionsMenu`), conditional per row:
  - *Fetch transcript* — re-runs the whole waterfall (always present).
  - *Transcribe with Deepgram* — only when the transcript isn't already from
    Deepgram.
  - *Retry* — only when status is `failed`.
- Empty state: "No episodes match these filters."

Row actions are **optimistic**: `useOptimisticList` immediately flips the row to
`resolving` while `requestEpisodeAction` runs, and a toast confirms
("Re-running the transcript waterfall", "Submitting to Deepgram", "Retrying") or
surfaces an error. The action writes `pending_action` + `transcript_status =
'resolving'` to the row; the agents server's listener picks that up over
Supabase Realtime and actually re-runs the pipeline (the web app can't reach the
agent server over HTTP).

### 6. "Ingest an episode" modal

A `Modal` (size `md`) holding the brief form for ad-hoc ingestion:

- Intro copy explaining the transcript waterfall runs once and the result joins
  the research index.
- Fields: **Title** (optional), **YouTube URL**, **Audio URL**, and a required
  **"Why ingest this"** textarea (the curator note).
- A checkbox: **"Allow Deepgram if no free transcript exists."** When ticked, an
  amber warning appears — *"Deepgram transcription is billed per minute of
  audio…"* — keeping the cost decision explicit and opt-in.
- Footer: Cancel / **Ingest episode** (shows a loading state while submitting).

Submitting calls `ingestEpisodeBrief`, which validates with Zod (a URL is
required — audio or YouTube — and the "why" note is mandatory), inserts a
`brief`-origin episode with `pending_action` set to `deepgram` or `refetch`
depending on the checkbox, then closes the modal and refreshes. Server errors
are humanised into a toast.

---

## Episode page — `/news/podcasts/[id]`

Titled **"Episode"**, with a back link labelled **"Podcast ingestion"** → the
dashboard. The server component (`[id]/page.tsx`) loads the full
`podcast_episodes` row, its ordered `transcript_segments`, and the source name
(`404`s via `notFound()` if the episode is missing). Layout is a narrower
centred column (`max-width: 980px`).

### Header + actions

- Episode **title** (wraps on long words), then a meta row: source chip,
  published date, and the status chip.
- Action buttons (small, secondary), mirroring the dashboard row actions but as
  buttons: **Fetch transcript** (always), **Transcribe with Deepgram** (unless
  already Deepgram-sourced), **Retry** (only when `failed`). Each calls
  `requestEpisodeAction` and, on success, shows a toast and `router.refresh()`s
  (the detail view is not optimistic — it re-fetches).

### Media

One of two treatments, chosen by whether a YouTube video ID can be parsed from
`youtube_url`:

- **Video** → `YouTubeFacade`: a click-to-play poster (YouTube thumbnail + a
  gold play button) that only swaps in the real privacy-friendly
  `youtube-nocookie.com` iframe on click. This keeps the page from mounting a
  heavy player until the user wants it, and lets transcript timestamps deep-link
  into it.
- **Audio** → an artwork block (the episode `image_url`, or a **branded
  placeholder** — BTS logo, "Podcasts" kicker, and the clamped title on a subtle
  surface — when there's no image) above a **custom `AudioPlayer`**. The player
  drives a hidden `<audio>` element and renders its own play/pause, scrubber
  (with a gold progress fill), and current/total time, because native
  `<audio controls>` can't be styled consistently. Duration falls back to the
  feed-supplied value until the element reports its own metadata.

The `audioRef`/video start state is owned by `EpisodeDetail` so transcript
timestamps can seek the same element.

### Description

Feed show-notes arrive as raw HTML; `htmlToText` converts block tags to line
breaks, strips the rest, and decodes entities. Rendered with `pre-wrap` so the
preserved newlines read as paragraph breaks. Muted, relaxed line height.

### Body — two columns

A grid: transcript (fluid) + a 280px provenance sidebar, collapsing to a single
column under 800px (where the sidebar stops being sticky).

**Transcript column.** Behaviour depends on status:

- Not `available` → a single explanatory note: the stored `transcript_error`
  for `failed`; "No free transcript was available and Deepgram was not enabled."
  for `skipped`; "Transcript is still being resolved." otherwise.
- `available` with **segments** → a list of segments, each with a monospace
  **timestamp button** and an optional uppercase **speaker** label above the
  text. Clicking a timestamp seeks the audio player or deep-links the video
  (revealing the facade's real iframe and jumping to that moment). Timestamp
  buttons are disabled when there's no playable media.
- `available` with only **plain text** (no segments) → the text split on blank
  lines into paragraphs.
- `available` but nothing stored → "Transcript text is not available."

Long transcripts are **clamped to 480px** with a fade-out gradient at the
bottom; a **"Show full transcript" / "Show less"** toggle (chevron rotates)
appears only once the content actually overflows (measured against
`scrollHeight` after render).

**Provenance sidebar** (sticky card). A definition list of where the transcript
came from and its processing state: **Source** (transcript source label),
**Format**, **Language**, **Timestamps** (Yes/No), **Origin** (ingestion
origin), **Fetched** (datetime), **Embedded** (datetime), and **Duration** (mono,
when known). Below the list, when present: a **Curator note** block (the "why"
from a brief) and a wrap of **topic tags**.

---

## Conventions & cross-references

- **Styling** uses design tokens only (`--color-*`, `--space-*`, `--radius-*`,
  `--text-*`) via the `bts-design` system — no raw hex. Gold (`--color-accent*`)
  is the brand/"free/primary" signal; amber `--color-warning` consistently means
  "Deepgram / costs money"; green `--color-success` means "available".
- **Status/source labels and colours** are centralised in `lib/podcasts.ts`
  (`TRANSCRIPT_STATUS_LABELS`, `TRANSCRIPT_STATUS_COLORS`,
  `TRANSCRIPT_SOURCE_LABELS`) — change them there, not inline.
- **The web app never runs the pipeline.** Both the row actions and the ingest
  brief only write intent (`pending_action`) to `podcast_episodes`; the agents
  server reacts via Supabase Realtime. See `docs/podcast-ingestion-spec.md`.
- **Responsive breakpoints:** dashboard reflows at 880px (KPIs → 2-up, charts →
  stacked); episode reflows at 800px (single column, sidebar unstuck) and 767px
  (tighter padding, stacked header, full-width artwork).
- **Tests:** `[id]/EpisodeDetail.test.tsx` and
  `components/podcasts/AudioPlayer.test.tsx` cover the interactive pieces
  (`pnpm --filter @platform/web test`).
