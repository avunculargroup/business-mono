# Feature Spec — Research Feed

**Platform:** Bitcoin Treasury Solutions Internal Platform
**Feature:** Unified news source ingestion (RSS, Podcast, Email) with Rex relevance scoring, surfaced in a web app research feed
**Status:** Draft
**Last updated:** 2026-05-30

-----

## Overview

A unified pipeline for ingesting upstream research content from three source types — RSS feeds, podcast episodes, and paid newsletter emails — into a single `news_items` table, with each item scored for relevance to BTS’s positioning by Rex and surfaced in a dedicated `/research` section of the web app.

Free newsletters and podcast feeds flow via RSS. Paid newsletters (Gromen *Tree Rings*, Bitwise CIO memos, Fidelity Digital Assets, Lyn Alden Premium) arrive by email and are ingested by extending the existing Fastmail polling job already used for customer mail.

The downstream consumers (Charlie for content ideation, Bruno for analysis context, Rex itself for ad-hoc research) all query `news_items` agnostically — the ingestion path is an implementation detail they don’t need to know about.

V1 ships the ingestion pipeline, the database, the web app, manual ingestion, and Rex’s scoring. Signal notifications via Simon are deferred to a later sprint — the web app is the v1 reading surface.

-----

## Scope

### In scope

- Single `news_sources` table covering RSS, podcast, and email source types
- Extension of the existing Fastmail polling job to cover a new `/research` folder
- Per-source plus-addressing (`research+gromen@btreasury.com.au`)
- Sender allowlist and `Authentication-Results` header checking for email sources
- RSS / podcast fetcher workflows using conditional GET (ETag, Last-Modified)
- HTML-to-markdown extraction with newsletter chrome stripped
- Deduplication via content hash plus ingestion reference (Message-ID / GUID)
- PDF attachment detection — flagged on the row, content not extracted in v1
- Embedding generation via `text-embedding-3-small`
- Relevance scoring via Rex with structured output, three dimensions, weighted composition
- Manual ingestion of one-off items from the web app
- `/research` section in the web app: feed view, archive, item detail, source management, manual add
- Rex calibration log (groundwork for tuning the rubric over time)

### Out of scope (v1)

- Signal notifications routed via Simon — Chris reads the feed in the web app
- PDF attachment content extraction (v2) — items with PDFs are flagged so Chris can open the original
- Substack canonical URL re-fetching — free Substacks come via RSS; paid Substacks deferred
- Ad-hoc forwarding from personal addresses
- Reply threading
- Transcript ingestion for podcasts — handled separately by Roger; the news item is the episode announcement, not the transcript
- Sending outbound email
- Automated source discovery

-----

## User Stories

**As Chris, I need to:**

- Configure RSS feeds, podcast feeds, and email newsletter sources in one place
- Read newsletters and podcast announcements in a calm, magazine-style feed without context-switching to Fastmail or my podcast app
- See Rex’s relevance score and reasoning on every item so I can trust (and audit) the prioritisation over time
- Edit Rex’s suggested curator notes to capture *why this matters for BTS* in my own words
- Flag an item for Charlie when it has content value
- Add a one-off item from a URL or pasted markdown when something useful arrives outside a configured source
- Calibrate Rex’s scoring by adjusting individual scores and capturing why

**As Rex (Researcher agent), I need to:**

- Receive a normalised payload regardless of ingestion path (email / RSS / podcast)
- Have BTS positioning, content pillars, editorial constraints, and worked-example anchors loaded in my system prompt
- Query the nearest neighbours of the current item via the `embedding` column to assess novelty
- Return structured JSON conforming to the scoring rubric — never prose

**As Charlie (Content Creator agent), I need to:**

- Query `news_items` filtered by `status = 'flagged_for_charlie'` for content prompts Chris has explicitly surfaced
- Search by topic embedding similarity when drafting on a given subject
- Read Rex’s summaries and Chris’s curator notes as the primary signal of *why this is worth using*

**As Bruno (BA agent), I need to:**

- Pull recent items by topic and tier when preparing analysis that references the upstream macro context

-----

## Architecture

```
       RSS / Podcast feeds              Newsletter publishers
              ↓                                  ↓
       Scheduled cron fetcher            research+{slug}@btreasury.com.au
              ↓                                  ↓
                                         Fastmail /research folder
                                                ↓
                                  Existing customer-mail polling job
                                  (extended to watch this folder too)
                                                ↓
       inbound-rss-ingestion       inbound-research-ingestion       inbound-podcast-ingestion
       (per source, cron)          (per message, on poll)           (per source, cron)
              └────────────────────────┬─────────────────────────────────┘
                                       ↓
                       Shared pipeline (Mastra step group):
                         dedupe → embed → Rex scoring → persist
                                       ↓
                              news_items (PostgreSQL + pgvector)
                                       ↓
                              Next.js /research section
                                       ↓
                                     Chris
```

**Why this split:**

- **One table, one pipeline, three feeders.** The variation between source types is at the front end of the workflow (how do you extract content from an RSS XML item vs an email body vs a podcast feed entry). The back end — dedupe, embed, score, persist — is identical. Three workflows fan into one shared step group keeps the agent logic defined exactly once.
- **No new persistent services.** RSS and podcast workflows are scheduled cron jobs on the existing Mastra server. Email arrives via the customer-mail polling pattern that already exists. There is no new long-running process to monitor.
- **Rex is the only Agent step in the workflow.** Everything else is deterministic. This is consistent with the architectural principle that fuzzy reasoning lives in agents and pipelines live in workflows.

-----

## Data Model

### `news_sources`

Single table for all upstream sources. Type-specific fields are nullable; the application layer enforces which fields are required per `source_type`.

|Column                       |Type        |Notes                                                                    |
|-----------------------------|------------|-------------------------------------------------------------------------|
|`id`                         |UUID        |PK                                                                       |
|`name`                       |TEXT        |e.g. `Gromen Tree Rings`, `Bitcoin Optech Newsletter`, `What Bitcoin Did`|
|`slug`                       |TEXT        |URL slug and email plus-address suffix. Unique.                          |
|`source_type`                |TEXT        |`rss`, `podcast`, `email` — drives which ingestion workflow runs         |
|`tier`                       |TEXT        |`tier_1`, `tier_2`, `tier_3` — drives visual prominence in the feed      |
|`relevance_threshold`        |NUMERIC(3,2)|Default `0.70`                                                           |
|`is_active`                  |BOOLEAN     |Default `true` — pause without deleting                                  |
|`default_tags`               |TEXT[]      |Applied to every item from this source                                   |
|`description`                |TEXT        |Internal notes — why we follow this source                               |
|**RSS / podcast fields**     |            |                                                                         |
|`feed_url`                   |TEXT        |The RSS/Atom URL. Required for `rss` and `podcast`.                      |
|`feed_last_etag`             |TEXT        |For conditional GET — politeness                                         |
|`feed_last_modified`         |TEXT        |For conditional GET                                                      |
|**Email fields**             |            |                                                                         |
|`inbound_address`            |TEXT        |Computed: `research+{slug}@btreasury.com.au`. Required for `email`.      |
|`sender_allowlist`           |TEXT[]      |Approved From addresses/domains for `email` sources                      |
|**Shared operational fields**|            |                                                                         |
|`last_received_at`           |TIMESTAMPTZ |Updated on every successful item ingestion                               |
|`last_attempted_at`          |TIMESTAMPTZ |Updated on every fetch attempt (success or empty)                        |
|`last_error`                 |TEXT        |Last failure message, cleared on next success                            |
|`created_by`                 |UUID        |FK → `team_members`                                                      |
|`created_at`                 |TIMESTAMPTZ |                                                                         |
|`updated_at`                 |TIMESTAMPTZ |Auto-updated                                                             |

**Application-layer validation:**

- `source_type IN ('rss', 'podcast')` → `feed_url` required; `inbound_address` and `sender_allowlist` must be NULL
- `source_type = 'email'` → `inbound_address` and `sender_allowlist` required; `feed_url` must be NULL

**Notes:**

- No `expected_interval_days` column. Expected cadence is computed at query time from the trailing 90 days of `news_items.published_at` per source. New sources show “Awaiting first items” in the UI until ≥3 items exist.
- `default_tags` are merged with Rex’s extracted topics on each `news_items` insert. Source-level tags give Chris a way to enforce categorisation without restating it per item.

### `news_items`

The canonical store for all ingested research, regardless of ingestion path.

|Column               |Type        |Notes                                                                     |
|---------------------|------------|--------------------------------------------------------------------------|
|`id`                 |UUID        |PK                                                                        |
|`source_id`          |UUID        |FK → `news_sources`                                                       |
|`title`              |TEXT        |                                                                          |
|`body`               |TEXT        |Cleaned markdown                                                          |
|`summary`            |TEXT        |Rex-generated, 2–3 sentences in BTS voice                                 |
|`author`             |TEXT        |                                                                          |
|`published_at`       |TIMESTAMPTZ |From email Date header, RSS `<pubDate>`, or podcast `<pubDate>`           |
|`canonical_url`      |TEXT        |Best-effort extraction; the source’s own URL for this item                |
|`audio_url`          |TEXT        |For podcast items only — the enclosure URL                                |
|`content_hash`       |TEXT        |SHA-256 of normalised body, for dedup                                     |
|`ingestion_ref`      |TEXT        |Fastmail Message-ID, RSS `<guid>`, podcast `<guid>` — for idempotency     |
|`is_manual_entry`    |BOOLEAN     |True if Chris added the item manually. Default `false`.                   |
|`has_pdf_attachment` |BOOLEAN     |Flagged for v2; surfaced in UI. Default `false`.                          |
|`attachment_count`   |INT         |Default `0`                                                               |
|`word_count`         |INT         |Computed at ingestion; powers reading-time estimate                       |
|`relevance_score`    |NUMERIC(3,2)|Rex’s composed 0.00–1.00 score                                            |
|`relevance_reasoning`|TEXT        |Why Rex scored it that way — internal voice                               |
|`rex_metadata`       |JSONB       |Dimension scores, flags, rubric version. See “Rex Scoring Rubric” section.|
|`curator_notes`      |TEXT        |Human annotation. Pre-filled with Rex’s suggestion; editable in UI.       |
|`tags`               |TEXT[]      |Source defaults + Rex’s extracted topics                                  |
|`topics`             |TEXT[]      |Rex’s classification — `['macro', 'fed-policy', 'btc-treasury']`          |
|`embedding`          |VECTOR(1536)|`text-embedding-3-small` over `title + body`                              |
|`status`             |TEXT        |`unread`, `read`, `flagged_for_charlie`, `archived`                       |
|`read_at`            |TIMESTAMPTZ |When marked read in the UI                                                |
|`created_at`         |TIMESTAMPTZ |When ingested                                                             |
|`updated_at`         |TIMESTAMPTZ |Auto-updated                                                              |

**Status defaults to `unread`** — this makes the home feed query trivially simple (“show me unread research”) and matches the mental model of an inbox without making the UI feel like one.

### `rex_calibration_log`

Lightweight log of human adjustments to Rex’s scores. Used to spot systemic biases over time. Not used to auto-tune the rubric.

|Column          |Type        |Notes                                            |
|----------------|------------|-------------------------------------------------|
|`id`            |UUID        |PK                                               |
|`news_item_id`  |UUID        |FK → `news_items`                                |
|`original_score`|NUMERIC(3,2)|Rex’s score at the time of adjustment            |
|`adjusted_score`|NUMERIC(3,2)|Chris’s adjusted score                           |
|`rubric_version`|TEXT        |Snapshot of the rubric version at adjustment time|
|`reason`        |TEXT        |Free text from Chris — why this score felt wrong |
|`adjusted_by`   |UUID        |FK → `team_members`                              |
|`created_at`    |TIMESTAMPTZ |                                                 |

-----

## Database Views

### `v_research_feed`

The primary feed query. Returns unread items above their source’s relevance threshold, ordered by published date, with source context joined.

```sql
CREATE VIEW v_research_feed AS
  SELECT
    n.id,
    n.title,
    n.summary,
    n.author,
    n.published_at,
    n.canonical_url,
    n.audio_url,
    n.word_count,
    n.relevance_score,
    n.tags,
    n.topics,
    n.has_pdf_attachment,
    n.is_manual_entry,
    n.status,
    s.id AS source_id,
    s.name AS source_name,
    s.source_type,
    s.tier
  FROM news_items n
  JOIN news_sources s ON s.id = n.source_id
  WHERE n.status = 'unread'
    AND n.relevance_score >= s.relevance_threshold
  ORDER BY n.published_at DESC;
```

### `v_news_sources_overview`

Used by the sources management page. Includes computed cadence and item counts.

```sql
CREATE VIEW v_news_sources_overview AS
  SELECT
    s.id,
    s.name,
    s.source_type,
    s.tier,
    s.is_active,
    s.last_received_at,
    s.last_attempted_at,
    s.last_error,
    COUNT(n.id) FILTER (
      WHERE n.published_at >= NOW() - INTERVAL '30 days'
    ) AS items_last_30d,
    AVG(n.relevance_score) FILTER (
      WHERE n.published_at >= NOW() - INTERVAL '30 days'
    ) AS avg_relevance_30d,
    -- Median interval between items in the last 90 days, in hours
    (
      SELECT EXTRACT(EPOCH FROM PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY gap)) / 3600
      FROM (
        SELECT published_at - LAG(published_at) OVER (ORDER BY published_at) AS gap
        FROM news_items
        WHERE source_id = s.id
          AND published_at >= NOW() - INTERVAL '90 days'
      ) gaps
      WHERE gap IS NOT NULL
    ) AS median_interval_hours
  FROM news_sources s
  LEFT JOIN news_items n ON n.source_id = s.id
  GROUP BY s.id;
```

-----

## Ingestion Workflows

### Shared pipeline — `processNewsItem`

A reusable step group (or shared function) that takes a normalised payload and produces a persisted `news_items` row. Called by all three ingestion workflows.

**Input shape:**

```typescript
{
  source: NewsSource,
  title: string,
  body: string,                  // already cleaned markdown
  author?: string,
  publishedAt: Date,
  canonicalUrl?: string,
  audioUrl?: string,
  ingestionRef: string,
  hasPdfAttachment: boolean,
  attachmentCount: number,
  isManualEntry: boolean,
}
```

**Steps:**

1. **`dedupe`** — compute `content_hash = sha256(normalize(body))`; query `news_items` by `content_hash`; if exists, exit successfully (no-op)
1. **`generate_embedding`** — call `text-embedding-3-small` on `title + body`, truncated to fit
1. **`score_relevance`** — Rex agent step; see “Rex Scoring Rubric” section for full detail
1. **`persist`** — insert row with `status = 'unread'`, `curator_notes` pre-filled with Rex’s `suggested_curator_notes`, all dimension scores in `rex_metadata`

### `inbound-research-ingestion` (email)

Dispatched by the existing Fastmail polling job when it finds a new unread message in the `/research` folder.

**Inputs:** `{ messageId: string, uid: number, parsed: ParsedMail }` — the polling job has already fetched and parsed the message

1. **`validate_sender`** — extract plus-address suffix from `To`; look up `news_sources` by slug; reject if `is_active = false` or not found; check `From` against `sender_allowlist`; reject on `spf=fail` or `dkim=fail` in `Authentication-Results`
1. **`detect_attachments`** — count attachments; flag any `application/pdf`
1. **`extract_content`** — HTML → markdown via Turndown; strip footer, unsubscribe links, tracking pixels, “view in browser” prelude, social share buttons; extract title from subject, author from From name, published_at from Date header; best-effort canonical URL from first matching anchor
1. → hand to `processNewsItem`
1. **Existing polling job** marks message `\Seen` on its own loop after successful dispatch

### `inbound-rss-ingestion` (RSS)

Scheduled cron — runs every 15 minutes per source, staggered to avoid hammering any one publisher.

1. **`fetch_feed`** — HTTP GET with `If-None-Match: {feed_last_etag}` and `If-Modified-Since: {feed_last_modified}`; on `304 Not Modified`, exit; on `200`, parse with `rss-parser`; update `feed_last_etag` and `feed_last_modified` from response headers
1. **`identify_new_items`** — for each item in the feed, check if `ingestion_ref` (the item’s `<guid>`) already exists in `news_items`; skip if so
1. **`extract_content`** — for each new item, fetch the article body via Jina Reader using the item’s `<link>`; fall back to `<content:encoded>` or `<description>` if Jina fails; convert to clean markdown
1. → hand each new item to `processNewsItem`
1. **`update_source`** — set `last_attempted_at`; set `last_received_at` if any new items; clear `last_error` on success

### `inbound-podcast-ingestion` (podcast)

Scheduled cron — runs every 30 minutes per source.

Functionally identical to RSS but with two podcast-specific differences:

1. Episode body is the show notes (`<description>` or `<content:encoded>`), not a fetched article
1. `audio_url` is populated from the `<enclosure url="...">` attribute

Transcripts are out of scope here — they’re handled by Roger and live in `transcript_segments`, linked to `news_items` via `podcast_episodes.news_item_id` (see the existing podcast spec).

### Manual ingestion

Triggered from `/research` via “Add item” button. Two modes:

- **URL mode** — Chris pastes a URL; the server fetches via Jina Reader to populate title and body; Chris reviews and confirms
- **Markdown mode** — Chris pastes the markdown directly; populates title from a separate field

Both modes:

1. Require selecting a `source_id` from existing `news_sources` (with “Create new source” link in the dropdown for the common case where this is content from an unconfigured source — better to add it as a configured source than to keep adding manual one-offs)
1. Set `is_manual_entry = true`
1. Hand to `processNewsItem` — same dedupe / embed / score / persist pipeline as automated ingestion

Manual items don’t bypass Rex’s scoring. Chris’s manual addition still gets a relevance score and reasoning, which is useful: if Rex consistently scores Chris’s manual additions low, it’s a signal the rubric needs review.

-----

## Web App — `/research` Section

The primary surface for v1. The brief is unambiguous about gravitas, warmth, whitespace, and the Stripe-or-Linear polish target; the research feed should feel like opening a curated journal, not triaging Gmail.

### Information architecture

```
/research                        Feed (default: unread, above threshold)
/research/all                    Full archive with filters and search
/research/[id]                   Single item detail
/research/sources                Source management list
/research/sources/new            Add source
/research/sources/[id]           Source detail / edit
/research/calibration            Rex calibration view (admin)
```

### `/research` — Feed view

The primary screen. Reading-first, not management-first.

**Layout:** Single-column feed, max-width 760px, centred. No sidebar — the design brief is explicit that whitespace is a feature. Filter chips above the feed; search lives in `/research/all`.

**Filter chips:**

- **Status** — Unread (default) · All · Flagged · Archived
- **Type** — All (default) · RSS · Podcast · Email
- **Source** — multi-select from active sources
- **Tier** — Tier 1 · Tier 2 · Tier 3
- **Time** — Past 7 days (default) · Past 30 · All time

Filter state persists in the URL so any view is shareable and back-button friendly.

**Each card shows:**

- Caption row: source type icon (Lucide RSS waveform / headphones / envelope, stroke-width 1.5, 12px) · source name in DM Sans 12px uppercase with `letter-spacing: 0.04em` · tier indicator (gold dot for tier_1, gold ring for tier_2, neutral for tier_3)
- Title in Playfair Display, 24px, weight 600
- Rex’s 2–3 sentence summary in DM Sans 16px, `line-height: 1.6`
- Footnote row: author · published date · `≈12 min` reading time (computed as `ceil(word_count / 220)`) · `📎 PDF` pill if attached · relevance score in JetBrains Mono (`0.87`, not `87%`)
- Hover: `translateY(-2px)`, shadow → `--shadow-md`, 200ms ease

**No source images, no inline figures.** Newsletter HTML is full of stock photography and tracking pixels disguised as images. Strip all `<img>` at extraction time. The feed is text — the way a serious reading view should be.

**Empty state:** “No new research today. The feed updates automatically as new items arrive. Configure sources or add an item manually.” Links to `/research/sources` and an Add item modal trigger.

**`Add item` button** — top-right of the feed, opens the manual ingestion modal.

### `/research/[id]` — Item detail

The reading view. Where Chris actually reads a Tree Rings issue, a Bitwise memo, or listens to a What Bitcoin Did episode.

**Layout:** Two-column on desktop ≥1024px, single-column below.

**Main column (max-width 700px):**

- Caption row: source · author · published date
- Title in Playfair Display 36px
- Rex’s summary in a `surface-subtle` card with `border-left: 3px solid var(--color-gold)` — visually distinguishes Rex’s read from the source’s words
- For podcast items: audio player at the top of the main column with playback position persisted to local storage keyed by item id
- The article body, rendered from stored markdown using the platform’s standard typography
- Canonical URL link at the bottom: “Read original →”

**Right rail (288px, sticky on desktop ≥1280px):**

- **Curator notes** — editable textarea, label “Why this matters”. Pre-filled with Rex’s `suggested_curator_notes`. Inline save on blur with subtle “Saved” affordance. This is the most valuable field long-term; it’s the data that makes embedding-based retrieval contextually intelligent.
- **Tags** — chip group, editable; add/remove inline
- **Status actions** — buttons: `Mark as read` · `Flag for Charlie` · `Archive`
- **Related items** — list of 3–5 nearest neighbours by embedding cosine similarity, scoped to the past 90 days, each showing source name + title only. Genuinely useful for “I just read a Gromen piece on Treasury issuance; what else has Lyn Alden said on this recently?”
- **Rex’s reasoning** — collapsible (collapsed by default), expands to show `relevance_reasoning` and dimension scores. Surfacing this builds trust in the scoring; hiding by default keeps the page calm.
- **Adjust score** — small “Adjust” link beside the score; opens a tiny inline form for new score + reason, writes to `rex_calibration_log`
- **Source metadata** — small block: source name, tier, link to source page

**Reading position:** Persist scroll position per item; restore on return. For long Tree Rings issues, this matters.

### `/research/all` — Archive

Same card pattern as `/research`, but:

- Filters default to `Time = All time`, `Status = All`
- Order by `published_at DESC`
- A search input at the top — full-text on `title + body` (Postgres `tsvector`), with embedding-similarity fallback if literal search returns no results
- The embedding fallback is a “Did you mean…” moment that the column already enables for free

### `/research/sources` — Source list

Table view, design-brief-correct (lightness, generous padding):

|Source|Type|Tier|Last received|Items (30d)|Avg relevance|Status|
|------|----|----|-------------|-----------|-------------|------|

- Source name links to source detail page
- Type column shows the Lucide icon plus the type word
- Last received in JetBrains Mono — relative (“2 days ago”), precise timestamp on hover
- Items (30d) as a small inline sparkline using recharts — visual sense of cadence
- Avg relevance in JetBrains Mono — `0.74` over the past 30 days
- Status: green dot if last received < 2× median interval; warning dot if overdue; grey if `is_active = false`

`Add source` button top-right.

### `/research/sources/new` — Add source

Single-column form with a `Type` selector at the top. Form fields are conditional on type:

**RSS / Podcast:**

- Name
- Feed URL — with a “Validate feed” button that does a HEAD plus a small GET to confirm the feed parses and shows the feed’s title and description for confirmation
- Tier (radio: Tier 1 · Tier 2 · Tier 3 with one-line descriptions)
- Relevance threshold (slider, default 0.70)
- Default tags

**Email:**

- Name
- Slug (auto-suggested from name; live-validated for uniqueness against existing sources)
- Tier
- Relevance threshold (slider, default 0.70)
- Default tags

On save for an email source, the form surfaces the computed inbound address with a copy-to-clipboard button: *“Subscribe to this newsletter using `research+gromen@btreasury.com.au`. The first email will be ingested as a test.”*

After the first ingestion from a new email source, the source detail page shows a “Trust this sender” button next to the observed From address that adds the domain to `sender_allowlist`.

### `/research/sources/[id]` — Source detail

- Source metadata at top, editable
- Recent items from this source — same card pattern as the feed, last 20
- Sender allowlist management (email sources only) — add/remove rows
- Stats: total items, average relevance, items per month sparkline, last received, median cadence

### `/research/calibration` — Rex calibration view

Admin/internal view. Lists items where Chris has adjusted scores, with original score, adjusted score, and reason. Filterable by source, time range, and direction of adjustment (Chris bumped Rex up vs down).

The point isn’t to drive automated re-tuning — it’s qualitative pattern-spotting. If Chris is consistently bumping Tree Rings scores up, the source’s tier or the rubric’s anchors may need revisiting.

### Manual ingestion modal

Triggered from the `Add item` button on `/research`. Two-step form:

1. **Mode selection** — URL vs Markdown radio
1. **Form**:
- Source — required dropdown from `news_sources WHERE is_active = true`. With “Create new source” link.
- URL — if URL mode; on blur, fetch via Jina Reader and populate title and body, with a small spinner
- Title — editable; pre-filled if URL fetched
- Body — markdown editor; pre-filled if URL fetched
- Tags — chip input

On submit, the modal calls the manual ingestion path. Success state shows “Item added. View it in the feed.” with a link to the new `/research/[id]` page.

-----

## Design Choices Worth Calling Out

- **Reading-first, not inbox-first.** The brief is explicit about gravitas and whitespace; the feed should feel like opening a curated journal. Cards are tall and readable, not dense rows.
- **Rex’s read is visually separated from the source’s words.** A gold-left-bordered summary card on each item makes it clear which sentences are Rex’s synthesis and which are the author’s. Chris should never wonder whether something he’s reading is Gromen’s view or Rex’s paraphrase.
- **Curator notes prominent on detail, hidden on feed.** The notes field is the most valuable long-term data — putting it in the right rail of every detail page keeps the friction near zero.
- **JetBrains Mono for relevance scores.** Per the design brief, numbers are mono. `0.87` reads as data; `87%` reads as marketing.
- **No source logos.** The temptation to render Substack and Bloomberg favicons is real, but it pulls the design toward generic SaaS and away from editorial. The source name in DM Sans caption case carries the weight.
- **No emoji in chrome.** The `📎` PDF pill is the one exception — it reads as a universal “attachment” affordance in a way that text would not.

-----

## Agent Integration

### Rex — relevance scoring and summarisation

Rex’s role here is the fuzzy-reasoning step in an otherwise deterministic workflow. Rex needs:

- A `score_news_item` tool that returns structured JSON conforming to the rubric in the next section
- A `find_similar_news_items` tool that returns the 3 nearest neighbours from the past 60 days by embedding cosine similarity, for the novelty check
- System prompt context defined inline in this workflow’s agent step — BTS positioning, content pillars, editorial constraints, calibration anchors
- No web access at this step — Rex is reading content that’s already arrived

The Agent is configured with:

- Temperature `0.2` — the rubric should produce stable scores for the same input
- Structured output / JSON mode enforced
- Rubric version pinned in the system prompt and echoed in `rex_metadata.rubric_version`

### Charlie — downstream consumption

Charlie doesn’t read the feed directly. Charlie queries `news_items` filtered by `status = 'flagged_for_charlie'` (set manually from the detail view’s right rail) or by topic embedding similarity when drafting on a given subject.

Note: `news_items` (inbound research) is distinct from `content_items` (outbound BTS-authored content for publication). The naming distinction reads cleanly and matters for downstream queries.

### Bruno — analysis context

Bruno uses the `embedding` column to retrieve relevant research as context when preparing analysis. No UI involvement.

### Simon — deferred to a later sprint

Once Chris has a feel for what’s actually high-signal in practice, Simon’s notification routing (real-time Signal for Tier 1, daily digest for Tier 2, silent for Tier 3) lands as a small follow-up. Setting thresholds before having the data would have been guessing.

-----

## Rex Scoring Rubric

The rubric is the single most leveraged piece of this feature — it determines what Chris pays attention to. It lives here so the workflow’s agent step prompt has a canonical source.

### Purpose

When a new item lands in `news_items` from any ingestion path, Rex reads it and produces a structured judgement: *how relevant is this to BTS’s positioning, and what should a human know about it in one glance?*

The output drives three things in the platform:

1. **Card surface area** — items above the source’s `relevance_threshold` are visually elevated; items below are still ingested but de-emphasised
1. **Curator notes seed** — Rex’s `suggested_curator_notes` pre-fills the human-editable field. Chris edits, doesn’t write from scratch.
1. **Trust building** — Rex’s `relevance_reasoning` is visible on the detail page. Every score is auditable.

Rex is *not* deciding what gets ingested — everything that arrives gets stored. Rex is deciding what’s worth Chris’s attention, and saying out loud why.

### What Rex knows before scoring

Loaded as a system prompt at agent step initialisation:

**BTS positioning.** Bitcoin Treasury Solutions is an Australian Bitcoin treasury consulting and education firm. Primary audience is Australian CFOs and finance executives of mid-market and enterprise companies considering, planning, or executing a corporate bitcoin treasury allocation. BTS operates under an AFSL/AR structure. The tone of all client-facing work is plain, confident, advisory — the voice of a private wealth manager, not a crypto evangelist.

**Content pillars (in priority order):**

1. **Macro thesis for corporate bitcoin treasury allocation** — debasement, fiscal dominance, long-duration risk, the Gromen/Alden framing
1. **Regulatory landscape (AU and global)** — ASIC, AUSTRAC, ATO, FASB, AASB, SEC, Basel, MiCA — anything that changes what an AU CFO can legally or operationally do
1. **Institutional bitcoin adoption signals** — ETF flows, corporate treasury announcements, sovereign accumulation, pension allocations, accounting standard changes
1. **Bitcoin-specific market structure** — ETF mechanics, custody, miners, on-chain treasury data
1. **Australian economic conditions** — RBA policy, AUD positioning, AU housing/credit cycle (relevant to AU CFO decision context)

**What is *not* relevant:**

- Altcoin / token / NFT / DeFi commentary that doesn’t materially affect bitcoin
- Crypto exchange drama, hacks, or personality conflicts
- Bitcoin price punditry without underlying thesis change
- Trading setups, technical analysis, “is BTC going to $X” speculation
- US political commentary that isn’t directly about monetary, fiscal, or regulatory policy
- General macro commentary with no transmission mechanism to bitcoin or AU CFO decisions

The non-relevant list is as important as the relevant list. Rex’s job is partly to be a filter against the noise that pollutes everyone else’s feeds.

**Editorial constraints carried into summaries:**

- Bitcoin (capital B) = network/protocol; bitcoin (lowercase b) = currency/unit
- No hype language (“moon”, “to the stars”, “game-changing”)
- No exclamation marks
- CFO-audience tone — plain, declarative, no jargon without explanation

These apply to `summary` and `suggested_curator_notes`. They do *not* apply to `relevance_reasoning`, which is internal and can be more candid.

### The three dimensions

Each scored 0–1, weighted composition.

#### Dimension 1: Material relevance (weight 0.5)

*Does this item materially relate to BTS’s content pillars?*

|Score  |Meaning                                                                                                                                                                               |
|-------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
|0.9–1.0|Directly addresses a content pillar with substantive new information. Tree Rings on Treasury issuance. ASIC consultation on crypto AFSL conditions. Fidelity quarterly Signals Report.|
|0.7–0.8|Adjacent to a pillar with material implications. Fed speech signalling a policy shift relevant to the debasement thesis. US accounting standard change affecting fair-value treatment.|
|0.5–0.6|Tangentially related; useful as background. General macro piece mentioning bitcoin in passing. Foreign regulatory item with limited AU read-across.                                   |
|0.3–0.4|Touches the territory but doesn’t move the conversation. Restates known thesis points without new evidence.                                                                           |
|0.0–0.2|Off-topic, altcoin-focused, or pure speculation.                                                                                                                                      |

#### Dimension 2: Novelty (weight 0.3)

*Is this saying something the BTS team doesn’t already know?*

The BTS team is deeply familiar with the Alden/Gromen/Hayes macro framework. Rex distinguishes between a *new instantiation* of a known thesis and a *new development* in the thesis itself.

|Score  |Meaning                                                                                                                                                          |
|-------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------|
|0.9–1.0|Genuinely new development — a regulatory ruling, a major institution moving, a data point that changes the picture, an articulation of a frame Chris hasn’t seen.|
|0.7–0.8|Familiar thesis applied to a new event or data set. Useful citation material even if the thesis is known.                                                        |
|0.5–0.6|Restatement of known thesis with marginal new framing. Worth skimming, not deep reading.                                                                         |
|0.3–0.4|Pure restatement; could have been generated by summarising the past six months of the source.                                                                    |
|0.0–0.2|Recycled or aggregator content with no original synthesis.                                                                                                       |

Rex performs one retrieval at this step: call `find_similar_news_items(embedding, limit=3, days=60)`. If the new item is cosine-similarity > 0.85 with multiple recent items, novelty is almost certainly low.

#### Dimension 3: Citation value (weight 0.2)

*Could this be cited in BTS client work?*

Some items are valuable not because Chris will personally read them but because Charlie could pull a quote, Bruno could use a data point, or a CFO conversation could reference the source.

|Score  |Meaning                                                                                                                        |
|-------|-------------------------------------------------------------------------------------------------------------------------------|
|0.9–1.0|High-authority source (Fidelity, BlackRock, RBA, ASIC, IMF, BIS) with citable data or a defensible position. CFO-meeting-grade.|
|0.7–0.8|Respected practitioner source (Alden, Gromen, Hayes, Hougan) with a position worth attributing.                                |
|0.5–0.6|Solid analysis from a credible commentator; usable in supporting context but not as a primary citation.                        |
|0.3–0.4|Opinionated piece with limited evidence — fine to read, not fine to cite.                                                      |
|0.0–0.2|Anonymous, low-credibility, or pseudonymous source whose name on a slide would undermine BTS’s credibility.                    |

#### Composition

```
relevance_score = (material × 0.5) + (novelty × 0.3) + (citation × 0.2)
```

Rounded to two decimal places. Always between 0.00 and 1.00.

### What Rex returns

A single JSON object. No prose preamble, no markdown wrapper.

```json
{
  "relevance_score": 0.84,
  "dimension_scores": {
    "material": 0.95,
    "novelty": 0.70,
    "citation": 0.80
  },
  "relevance_reasoning": "Tree Rings issue directly addresses Treasury issuance dynamics central to the debasement thesis (material 0.95). Gromen's framing of net interest expense crossing defence spending is a development on the recurring thesis rather than a restatement (novelty 0.70). Authoritative practitioner source; quotable in CFO-facing material with attribution (citation 0.80).",
  "summary": "Gromen argues US net interest expense crossing defence spending in Q1 marks a structural fiscal inflection: the Treasury can no longer issue long-duration debt without monetisation pressure. The piece extends his 2024 framework with new CBO data and traces the mechanism through to commodity-backed monetary assets, including bitcoin.",
  "topics": ["fiscal-dominance", "treasury-issuance", "debasement-thesis"],
  "suggested_curator_notes": "Useful for the AU CFO macro brief — the net-interest-vs-defence framing is a one-line hook that anchors the structural case for bitcoin as a treasury asset without requiring the listener to follow the full debasement argument. Charlie could pull this for the Q3 newsletter.",
  "needs_human_review": false,
  "flags": [],
  "rubric_version": "v1"
}
```

Persisted shape: `relevance_score`, `relevance_reasoning`, `summary`, `topics`, `curator_notes` (from `suggested_curator_notes`) go to top-level columns. `dimension_scores`, `flags`, `needs_human_review`, and `rubric_version` go to `rex_metadata` JSONB.

### Field rules

- **`relevance_score`** — composed per the formula. Must match dimension scores within ±0.01.
- **`relevance_reasoning`** — 2–4 sentences, internal voice (can be candid). References dimensions explicitly. Never marketing copy.
- **`summary`** — 2–3 sentences, ≤ 60 words, CFO-audience tone, follows editorial constraints. Text shown on the feed card.
- **`topics`** — 1–5 short kebab-case tags. Prefer reusing existing topics for clustering.
- **`suggested_curator_notes`** — *why this matters for BTS*, 1–3 sentences. Most important field. Should address: who would use this, in what context, why now.
- **`needs_human_review`** and **`flags`** — see flagging rules below.

### Flagging rules

Rex sets `needs_human_review: true` and adds a structured flag in any of these cases:

|Flag value              |Trigger                                                                                          |UI behaviour                                                                     |
|------------------------|-------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------|
|`compliance_implication`|Item discusses ASIC, AUSTRAC, ATO, AFSL, or AR conditions that may affect BTS’s operating posture|`⚠ Compliance` chip on card; Lex notified via `agent_activity`                   |
|`factual_uncertainty`   |Rex isn’t confident a specific claim is correct or current                                       |`?` chip on card; Chris can verify before citing                                 |
|`tone_concern`          |Item contains language or claims that wouldn’t translate well into BTS’s voice                   |Surfaces in right rail; warns Charlie not to draft from this without paraphrasing|
|`breaking_signal`       |Item appears to be a genuinely new development that may move BTS’s positioning today             |Pinned to top of feed for 24 hours regardless of relevance threshold             |
|`low_confidence_score`  |Rex’s three dimensions diverge widely (range > 0.5)                                              |Right rail of detail shows uncertainty; useful for calibration                   |

These are independent signals — an item can carry multiple flags.

**The `breaking_signal` flag** is used sparingly — no more than ~5% of ingested items. Triggers:

- An AU regulatory announcement directly affecting bitcoin treasury rules
- A G-SIB or top-50 ASX company announcing a treasury allocation
- A major accounting standard change (FASB, AASB) affecting fair-value treatment
- A Fed/RBA emergency action or unscheduled policy statement
- A bitcoin network event with systemic implication

Rex should *not* use `breaking_signal` for: scheduled Fed meetings, ETF flow updates, price moves, or routine ASIC consultation releases.

### Calibration anchors

These live in Rex’s system prompt as worked examples to keep scoring stable across runs.

**Anchor 1 — Tree Rings issue on Treasury issuance:** `0.84` (the worked example above).

**Anchor 2 — Cointelegraph: “Bitcoin Could Hit $250K by Year End, Analyst Says”:**

- Material 0.20 · Novelty 0.10 · Citation 0.10 · Composite **0.16**
- Summary: “An analyst quoted in Cointelegraph suggests bitcoin could reach 250,000 USD this year, citing technical patterns and ETF inflow trends.”
- Curator notes: “Not useful — pure price speculation from a non-citable source.”

**Anchor 3 — RBA media release: Statement on Monetary Policy:**

- Material 0.75 · Novelty 0.80 · Citation 0.95 · Composite **0.81**
- Summary: “The RBA held the cash rate at 4.10 percent in May, citing persistent services inflation and a still-tight labour market. The accompanying statement noted the timeline for reaching the 2–3 percent inflation band has extended.”
- Curator notes: “Background context for any AU CFO conversation this month. Doesn’t change the bitcoin thesis directly but anchors the AUD-real-rate frame that supports it.”

**Anchor 4 — Bitwise CIO weekly market commentary:**

- Material 0.70 · Novelty 0.65 · Citation 0.85 · Composite **0.72**
- Summary: “Bitwise’s weekly note reports US spot bitcoin ETF inflows of 1.2 billion USD across the week, the third consecutive week of net inflows above one billion. Hougan attributes the pace to RIA-platform availability widening in Q2.”
- Curator notes: “ETF flow data point for the institutional adoption story. Useful for Charlie’s monthly LinkedIn post; the RIA-platform observation is the angle worth pulling forward.”

**Anchor 5 — Anonymous Substack: “Why Banks Hate Bitcoin”:**

- Material 0.45 · Novelty 0.20 · Citation 0.10 · Composite **0.29**
- Summary: “An anonymous Substack author argues that banks resist bitcoin adoption because it threatens their fee revenue model, drawing on examples from late-1990s internet payments rollout.”
- Curator notes: “Skip. The thesis is known and the source is not citable for BTS work.”

### What Rex must not do

- **Score from the title alone.** Rex reads the body. A misleading title is common.
- **Inflate scores to be helpful.** A 0.30 is a 0.30. Inflation defeats the threshold logic and erodes trust over time.
- **Hedge with confidence theatre.** “It’s hard to say” is not a score. Rex commits to a number; uncertainty goes in `flags`, not in the score.
- **Score on prestige alone.** A Bloomberg article restating a known thesis is still novelty 0.30. Prestige feeds citation, not novelty.
- **Apply different rubrics by source type.** A podcast episode and a Tree Rings email are scored on the same three dimensions.
- **Write summaries in the source’s voice.** The summary is Rex’s synthesis for a BTS reader, not a paraphrase of the author’s tone.
- **Quote from the source.** Summaries are paraphrased. Specific direct quotes belong in the body. Avoids inadvertent reproduction-at-scale issues across hundreds of items.

### Rubric versioning

`rubric_version` is stored on every `news_items` row inside `rex_metadata`. When the rubric changes, the version bumps for new items only. Re-scoring historical items against a new rubric is a deliberate operation, not an accident of a prompt edit.

-----

## Indexes

```sql
CREATE INDEX idx_news_sources_type ON news_sources(source_type);
CREATE INDEX idx_news_sources_active ON news_sources(is_active) WHERE is_active = true;
CREATE INDEX idx_news_sources_slug ON news_sources(slug);

CREATE INDEX idx_news_items_source ON news_items(source_id);
CREATE INDEX idx_news_items_published ON news_items(published_at DESC);
CREATE INDEX idx_news_items_relevance ON news_items(relevance_score DESC);
CREATE INDEX idx_news_items_status ON news_items(status);
CREATE INDEX idx_news_items_unread ON news_items(published_at DESC) WHERE status = 'unread';
CREATE INDEX idx_news_items_pdf ON news_items(has_pdf_attachment) WHERE has_pdf_attachment = true;
CREATE UNIQUE INDEX idx_news_items_dedup ON news_items(content_hash);
CREATE INDEX idx_news_items_embedding ON news_items USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX idx_news_items_fts ON news_items USING gin (to_tsvector('english', title || ' ' || body));

CREATE INDEX idx_rex_calibration_item ON rex_calibration_log(news_item_id);
CREATE INDEX idx_rex_calibration_created ON rex_calibration_log(created_at DESC);
```

-----

## RLS Policies

```sql
ALTER TABLE news_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "news_sources_all" ON news_sources
  FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE news_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "news_items_all" ON news_items
  FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE rex_calibration_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rex_calibration_log_all" ON rex_calibration_log
  FOR ALL USING (auth.role() = 'authenticated');
```

-----

## Package Structure

Suggested layout for the Mastra side:

```
packages/news-ingestion/
  ├── src/
  │   ├── shared/
  │   │   ├── process-news-item.ts      # The shared step group
  │   │   ├── dedupe.ts
  │   │   ├── embed.ts
  │   │   ├── extract-canonical-url.ts
  │   │   └── normalize.ts
  │   ├── email/
  │   │   ├── workflow.ts                # inbound-research-ingestion
  │   │   ├── extract-content.ts         # HTML → markdown, strip chrome
  │   │   ├── validate-sender.ts
  │   │   └── detect-attachments.ts
  │   ├── rss/
  │   │   ├── workflow.ts                # inbound-rss-ingestion
  │   │   ├── fetch-feed.ts              # Conditional GET
  │   │   └── extract-content.ts         # Jina Reader fallback chain
  │   ├── podcast/
  │   │   ├── workflow.ts                # inbound-podcast-ingestion
  │   │   └── extract-content.ts
  │   └── manual/
  │       └── api.ts                     # Called from Next.js API route
  └── package.json

apps/web/app/(authed)/research/
  ├── page.tsx                           # /research feed
  ├── all/page.tsx                       # /research/all
  ├── [id]/page.tsx                      # /research/[id]
  ├── sources/page.tsx                   # /research/sources
  ├── sources/new/page.tsx
  ├── sources/[id]/page.tsx
  ├── calibration/page.tsx
  └── _components/
      ├── news-card.tsx
      ├── filter-chips.tsx
      ├── curator-notes-editor.tsx
      ├── rex-reasoning-panel.tsx
      ├── related-items-panel.tsx
      ├── source-form.tsx
      └── manual-ingestion-modal.tsx
```

-----

## Open Questions

- **Reading time accuracy.** 220 wpm is a reasonable default for non-fiction. For podcast items (show notes are typically short), the reading-time line could be replaced with episode duration if `<itunes:duration>` is present in the feed. Defer until the first podcast source is added and the data shape is concrete.
- **PDF attachment handling (v2).** Fidelity Digital Assets and similar institutional sources email PDF announcements. The v2 extraction step uses `pdfjs-dist` or `pdf-parse` as a pure-Node addition. Defer until the first such email arrives and the actual attachment shape is clear.
- **Embedding model migration.** `text-embedding-3-small` is the chosen default. If a future migration to a larger model is warranted, the dimension change means a full table re-embed. Worth noting now so the embedding column type isn’t treated as forever-fixed.
- **`content_items` vs `news_items` naming.** The existing schema’s `content_items` table is for outbound BTS-authored content for publication. `news_items` is for inbound research. The distinction reads cleanly; flagging so a future schema review doesn’t conflate them.
- **Tier-1 floor for high-trust sources.** Should Tree Rings items have a floor (e.g. can’t score below 0.50 on material because Gromen’s thesis is always BTS-relevant)? Probably not — but if tier_1 sources are routinely scoring below threshold, that’s a signal the source’s tier is wrong, not that the rubric needs a thumb on the scale.
- **Search ranking.** `/research/all` uses Postgres FTS over title + body, with embedding fallback. If FTS-then-fallback produces awkward “no results, but here’s some similar stuff” UX, a hybrid score that interleaves both could replace it. Defer until usage shows whether the simple cascade is enough.
- **Low-relevance archival.** After 12 months, items with `relevance_score < 0.30` and `read_at IS NULL` could be soft-archived to keep the feed performant. Not urgent.

-----

## Claude Code Kickoff Prompt

A suggested first prompt for the Claude Code session, to be adjusted as needed:

> We’re building the Research Feed feature per `docs/features/research-feed-spec.md`. Start with the database migration: create `news_sources`, `news_items`, `rex_calibration_log`, and the two views, with all indexes and RLS policies. Reference `schema.sql` as the canonical schema source. Once the migration is approved, scaffold the `packages/news-ingestion` package structure but do not implement any workflows yet — we’ll do those one at a time, starting with `inbound-research-ingestion`. For all Mastra code, verify API signatures against `node_modules/@mastra/core/dist/docs/` before writing — Mastra APIs change frequently and your training data is likely out of date.

Suggested follow-up sessions:

1. `inbound-research-ingestion` workflow + Rex agent step (scoring rubric)
1. `inbound-rss-ingestion` workflow
1. `inbound-podcast-ingestion` workflow
1. Manual ingestion API route
1. `/research` feed page + cards (read `DESIGN_BRIEF.md` first)
1. `/research/[id]` detail page
1. `/research/sources` management
1. `/research/calibration`