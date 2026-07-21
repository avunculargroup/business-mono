# Podcast & Episode pages

Reference for the web UI at `/news/podcasts` (the ingestion dashboard),
`/news/podcasts/feeds` (the per-show podcasts list with feed health),
`/news/podcasts/[id]` (a single episode), `/news/podcasts/decisions` (the
stalled-episode triage worklist), and `/news/podcasts/search` (semantic
transcript search). This document describes the **current state** of the UX and
UI only — the ingestion pipeline itself lives in `apps/agents` and is specced in
`docs/podcast-ingestion-spec.md`.

Both pages are server components that read from Supabase and hand data to a
client component. They live under the authenticated `app/(app)/` shell, in the
**News** section, and share the app-wide `PageHeader`, design tokens, and UI kit
(`DataTable`, `StatusChip`, `Button`, `Modal`, toasts).

## File map

| File | Role |
|------|------|
| `page.tsx` | Server component for the dashboard. Fetches the two data sets and renders `PodcastDashboard`. |
| `PodcastDashboard.tsx` | Client component. All dashboard UI: KPIs, charts, recent grid, filterable table, ingest modal. |
| `podcasts.module.css` | Dashboard styles (shared by the decisions page). |
| `feeds/page.tsx` | Server component for the podcasts list. Aggregates per-feed health + artwork and renders the card grid directly (no client child). |
| `feeds/feeds.module.css` | Podcasts list styles. |
| `feeds/page.test.tsx` | Page tests for the podcasts list (query wiring, aggregation, artwork pick, empty state). |
| `decisions/page.tsx` | Server component for the triage worklist. Fetches only `failed`/`skipped` episodes and renders `DecisionsList`. |
| `decisions/DecisionsList.tsx` | Client component. The "Needs a decision" lane with optimistic Retry / Deepgram actions. |
| `[id]/page.tsx` | Server component for one episode. Fetches the episode, its transcript segments, and its source name; reads `?t=<seconds>` and passes it as `initialSeek`. |
| `[id]/EpisodeDetail.tsx` | Client component. Header + actions, media, description, transcript (with in-transcript find + copy-with-citation), provenance sidebar. |
| `[id]/detail.module.css` | Episode styles. |
| `[id]/EpisodeDetail.test.tsx` | Component tests for the episode view. |
| `search/page.tsx` | Server component for the transcript search page. Renders `PageHeader` + `TranscriptSearch`. |
| `search/TranscriptSearch.tsx` | Client component. Query box + ranked segment results with timestamped deep-links. |
| `search/search.module.css` | Search page styles. |
| `search/TranscriptSearch.test.tsx` | Component tests for the search UI. |
| `../../../components/podcasts/` | Shared media components: `MediaEmbed`, `YouTubeFacade`, `AudioPlayer`. |
| `../../../lib/podcasts.ts` | Client-safe helpers: video-ID parsing, HTML→text, timestamp formatting, status/source label + colour maps, Deepgram spend estimate (`estimateDeepgramCost`, `formatAud`), and in-transcript highlight (`highlightText`). |
| `../../../lib/openaiEmbedding.ts` | Server-only query embedding (`embedQuery`) via the OpenAI REST endpoint — used by transcript search. |
| `../../../app/actions/podcasts.ts` | Server actions: `requestEpisodeAction`, `ingestEpisodeBrief`, `generateEpisodeBrief`, `decideEpisodeBrief`. |
| `../../../app/actions/podcastSearch.ts` | Server action: `searchTranscripts` (embed query → `transcriptVectorSearch` RPC). |
| `packages/db/src/rpc/transcriptSearch.ts` | `transcriptVectorSearch` wrapper over the `vector_search_transcripts` pgvector RPC. |
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

Titled **"Podcast ingestion"**, with three `PageHeader` links: **"Podcasts"** →
the per-show list with feed health, **"Needs a decision"** → the triage
worklist (showing a warning-coloured count badge when any episode is stalled),
and **"Search transcripts"** → the transcript search page. This is a monitoring
surface, not a media library: it answers "is ingestion healthy, what's it
costing, and what needs my attention?" The server component (`page.tsx`) issues
two parallel queries:

1. `v_podcast_ingestion_status` — one row per episode with source + status
   (the monitoring view).
2. `podcast_episodes` — the extra fields the view omits (`created_at`,
   `duration_seconds`, `topic_tags`), joined back by id.

Everything below is laid out top to bottom inside a single centred column
(`max-width: var(--content-max-width)`, `--space-5` gaps).

### 1. KPI row

Five cards across the top (`grid`, collapsing to 2 columns under 880px). Each
card is icon + big mono number + uppercase label:

- **Episodes** — total count. This is the *headline* card: its icon and value
  use the gold accent (`--color-accent-dark`) while the others stay neutral.
- **Transcripts available** — count of `available`.
- **In research index** — count of episodes with `embedded_at` set. "Available"
  means a transcript is stored; "in research index" means it is embedded and so
  actually retrievable by search and by Rex. The gap between the two is a silent
  hole in the searchable library, so it gets its own card.
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

Beneath the gauge, an **estimated Deepgram spend** readout: `A$X.XX this month ·
A$X.XX all time` (mono figures). Deepgram is billed *per minute of audio*, so
counting episodes hides that one 3-hour episode costs more than ten short ones;
this sums `duration_seconds` of `deepgram`-sourced episodes × a per-minute rate
(`DEEPGRAM_COST_PER_MINUTE_AUD` in `lib/podcasts.ts` — a display estimate, not a
billing figure). "This month" buckets on `created_at` as a proxy for when the
transcription ran.

**"Ingested over 30 days"** — a hand-rolled SVG area chart of episodes ingested
per day (bucketed by `created_at` over the trailing 30 days). Gold line over a
faint gold fill (`--color-accent-glow`), with the first and last date labels on
a mono axis. The hint — *"A gap means the daily routine did not run"* — frames
it as an uptime check. Empty state: "No ingestion history yet."

### 3. Recent episodes

Rendered when at least one episode has playable media. A grid (`auto-fill`, min
240px) of up to **4** cards, sorted by recency (`published_at`, falling back to
`created_at`), filtered to episodes that have a `youtube_url` or `audio_url`.
Each card is an inline `MediaEmbed` (click-to-play video facade, or a native
`<audio>` element) above a linked title, a source chip, and a status chip. This
is the one spot on the dashboard that leans "media library"; the title links to
the episode detail page.

### 4. All episodes (filterable table)

The main working surface.

- Header row: section title + a secondary **"Ingest an episode"** button
  (opens the brief modal, below).
- **Filter bar** — four native `<select>`s with uppercase labels: **Status**
  (all statuses), **Source** (all ingesting feeds), **Transcript** (Any / Has
  transcript / No transcript), and **Topic** (only shown when episodes carry
  `topic_tags`). Filters compose and are applied client-side via `useMemo`.
- **`DataTable`** with columns: **Episode** (title + a source chip beneath),
  **Published** (date or em-dash), **Status** (`StatusChip`), **Transcript**
  (source label or em-dash — with a subtle `· not indexed` marker when the
  transcript is `available` but has no `embedded_at`), **Duration**
  (right-aligned mono `M:SS`/`H:MM:SS`).
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

### 5. "Ingest an episode" modal

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

## Podcasts — `/news/podcasts/feeds`

Titled **"Podcasts"**, with a back link → the dashboard. One card per subscribed
`podcast`/`youtube` source, replacing the "Feed health" panel that used to sit
inline on the dashboard. Reached from the dashboard's **"Podcasts"** header
link.

The server component (`feeds/page.tsx`) renders the whole page — there is no
client child. It queries `news_sources` (podcast/youtube types, ordered by
name) and `podcast_episodes` (`source_id`, `transcript_status`, `image_url`,
`published_at`), then aggregates per source: episode count, `coverage` (percent
of episodes with an `available` transcript), and the show artwork. Artwork
prefers `news_sources.image_url` — the channel-level feed art the
`podcast_ingest` routine stores on each successful scan (see
`20260717000000_add_news_source_image.sql` and `feedImageUrl` in
`apps/agents/src/lib/podcastFeed.ts`) — falling back to the most recently
published episode with an `image_url` (YouTube sources have no scan path, so
they only ever get the fallback); sources with neither get a placeholder tile
with a Lucide `Podcast`/`Youtube` icon.

Each card in the responsive grid (`auto-fill`, min 220px): square artwork on
top, then the feed name, a **Deepgram on/off** pill (for `podcast` sources
only — the read-only per-feed paid-transcription toggle, gold dot with a glow
ring when on), a `N episodes · N% transcribed` stats line (mono numerals), and
`Last run <relative time>` from `last_scanned_at`, or "never". Empty state
links to the news sources page.

---

## Needs a decision — `/news/podcasts/decisions`

Titled **"Needs a decision"**, with a back link → the dashboard. The triage
worklist that used to sit inline on the dashboard, split out to its own page so
the monitoring surface stays compact. Reached from the dashboard's **"Needs a
decision"** header link (which carries the stalled count as a badge).

The server component (`decisions/page.tsx`) queries `v_podcast_ingestion_status`
filtered to `failed` + `skipped` episodes only — the ones that stalled without a
transcript — and hands them to `DecisionsList`.

`DecisionsList` renders one row per episode: the linked title, a source chip,
the status chip, and the reason inline (the stored `transcript_error` for
`failed`; "No free transcript; Deepgram was off for this feed." for `skipped`),
with the one relevant action per row — **Retry** for `failed`, **Transcribe with
Deepgram** for `skipped`. Actions are **optimistic** (`useOptimisticList`): the
row flips to `resolving` and leaves the lane immediately, and a toast confirms or
surfaces an error. Like the dashboard's row actions, this only writes intent
(`pending_action`) to `podcast_episodes`; the agents server reacts over Supabase
Realtime. When nothing is stalled the page shows a **"Nothing needs a decision"**
empty state. Styles are shared from `podcasts.module.css` (the `triage*` classes).

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
timestamps can seek the same element. Arriving with a `?t=<seconds>` query param
(the deep-link the search page emits) seeks that same element **once on mount**
via the `initialSeek` prop — opening the video facade at the moment, or seeking
and playing the audio.

### Description

Feed show-notes arrive as raw HTML; `htmlToText` converts block tags to line
breaks, strips the rest, and decodes entities. Rendered with `pre-wrap` so the
preserved newlines read as paragraph breaks. Muted, relaxed line height.

### Episode brief (intelligence pass)

Between the description and the transcript sits the **episode brief** — a short,
agent-written summary plus **key takeaways** a reader can skim instead of the full
transcript. Summary is Phase 1 (`docs/reviews/podcast-pages-review` P0-1);
takeaways are Phase 2 (P1-5) — 4–7 short points, each anchored to a
`start_seconds` so it deep-links into the media at the moment it's discussed
(rendered under the summary; untimed takeaways render without a link). Takeaways
ride the **same** `summary_status` publish-wall and the **same** Lex review as the
summary — one gate, not two. The brief renders by `summary_status`:

- **`none`** (transcript `available`) → a **"Generate brief"** button.
  `generateEpisodeBrief` writes `pending_action = 'summarize'`; the agents
  server's `podcastActionListener` claims it and runs the pass (roger narrates →
  Lex reviews → persist a `proposed` summary). The web app can't reach the agent
  server, so it only writes intent — same seam as the row actions. After a
  request the UI shows an optimistic "generating" note until the next load.
- **`proposed`** → the draft, badged **"Draft · team only"**, with Lex's
  compliance verdict inline (cleared/needs-review + rationale + any flagged
  phrases) and **Approve and publish / Reject / Regenerate** controls.
  `decideEpisodeBrief(id, 'approve'|'reject')` flips `summary_status`
  (approve → `approved` + `summary_approved_at`/`summary_approved_by`; reject →
  back to `none`, clearing the draft). Approval is a plain DB write — nothing
  runs after it — so there is no suspend/resume workflow here.
- **`approved`** → the published brief, rendered plainly (no draft controls).
  This is the only state a client-facing surface would ever show.

`summary_status = 'none'` with no transcript renders nothing. The agent pass
(roger + Lex, model-configurable via the `podcast_intel.*` scopes) lives in
`apps/agents/src/workflows/podcastIntel/`.

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
  buttons are disabled when there's no playable media. Each segment also has a
  hover-revealed **copy-with-citation** button that writes
  `"…quote…" — Speaker, Episode title @ MM:SS` to the clipboard.
- `available` with only **plain text** (no segments) → the text split on blank
  lines into paragraphs.
- `available` but nothing stored → "Transcript text is not available."

When a transcript is available, a **find-in-transcript** bar sits above it: a
literal (case-insensitive) substring search that highlights matches (`<mark>`),
shows an `N / M` count, and steps through them with prev/next (each scrolls the
active match into view). While a find is active the clamp is dropped so matches
below the fold are reachable. A **"Copy transcript"** action in the transcript
header copies the whole body with a title citation.

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

## Transcript search — `/news/podcasts/search`

Titled **"Search transcripts"**, back link → the dashboard. Semantic ("ask the
library") search across every ingested transcript, giving the embedding pipeline
a UI: `transcript_segments` are embedded on ingest, but until this page nothing
in the web app queried them.

- **`search/page.tsx`** is a thin server component; **`TranscriptSearch.tsx`** is
  the client component holding the query box and results. Submitting calls the
  `searchTranscripts` server action inside a `useTransition` (the Search button
  shows a loading state; the button is disabled until the query is ≥ 3 chars).
- **`searchTranscripts`** (`app/actions/podcastSearch.ts`) embeds the query with
  `embedQuery` (`lib/openaiEmbedding.ts` → OpenAI `text-embedding-3-small`, 1536
  dims, the same model the ingestion pipeline used so the vectors are
  comparable), then runs `transcriptVectorSearch` (the `vector_search_transcripts`
  pgvector RPC, joined back to the episode + source). It returns one row per
  matching **segment** — not best-per-episode — so each result can deep-link to
  its exact moment. This is the same retrieval Rex uses via his
  `query_transcripts` tool.
- **Results** are cards: linked episode title, a `NN% match` (cosine similarity,
  mono), source + published date, the matched passage (with the speaker prefixed
  when known), and a **"Play at MM:SS"** link → `/news/podcasts/{id}?t={start}`
  (the episode page seeks the media to that second on arrival). Segments with no
  timestamp show "Open episode" instead.
- **States:** an initial prompt (`EmptyState`) before any search; a humane error
  note if the action fails (e.g. the key is unset or OpenAI errors); and a
  "No matching passages" empty state when nothing clears the similarity
  threshold.

> **Scope.** This is the minimum (retrieval + deep-links) version — the "P0-2"
> item from `docs/reviews/podcast-pages-review`. The elevated RAG
> *answer-with-citations* and the Lex compliance gate for client-facing prose are
> deliberately **not** built here; see that review for the roadmap.

**Environment.** The search action needs `OPENAI_API_KEY` in the web app's
server environment (Vercel). Without it, `searchTranscripts` returns a humane
error rather than throwing; the rest of the podcast pages are unaffected.

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
- **Search needs a key:** transcript search calls OpenAI to embed the query, so
  the web app's server environment needs `OPENAI_API_KEY`. It degrades to a
  humane error when absent; nothing else on these pages depends on it.
- **Tests:** `feeds/page.test.tsx`, `[id]/EpisodeDetail.test.tsx`,
  `search/TranscriptSearch.test.tsx`, `lib/openaiEmbedding.test.ts`,
  `lib/podcasts.test.ts`, and `components/podcasts/AudioPlayer.test.tsx` cover the
  interactive and pure pieces (`pnpm --filter @platform/web test`).
