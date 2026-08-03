# Feature Spec — Report Ingestion

**Platform:** Bitcoin Treasury Solutions Internal Platform
**Feature:** PDF and HTML report monitoring, acquisition, extraction and indexing
**Status:** Draft
**Last updated:** 2026-07-22

---

## Overview

The Research Feed currently ingests four source shapes: RSS, podcasts, YouTube and email. All four hand the platform a change signal for free — a feed item appears, an episode drops, an email lands. Report publishers do not. River Financial, Fidelity Digital Assets, ARK, Bitwise, Glassnode and the ASIC/AUSTRAC publication pages put a PDF on a marketing page and expect a human to notice.

This feature adds a fifth source type — `report_watch` — that monitors publisher index pages, detects genuinely new reports, downloads and stores the artefact immutably, extracts its text, embeds it, and surfaces it as a `news_item` in the existing feed so Rex scores it alongside everything else.

It also closes a deferral from the Research Feed spec: PDF attachment content extraction, flagged as v2 at the time. The extraction waterfall built here serves both — a PDF arriving by email from Fidelity and a PDF discovered on River's reports index run through the same steps once acquired.

Three design commitments shape everything below:

1. **Discovery is separate from acquisition.** Finding a URL and deciding it is worth downloading are different problems with different failure modes. They get different tables.
2. **The artefact is the record.** The stored PDF is immutable and permanent. If a River chart informs BTS commentary, the version actually read must be retrievable — not the one that was quietly revised three months later. This is the same argument as `variable_values` in `generated_documents`.
3. **Nothing about "is this new" involves an LLM.** Detection, deduplication and extraction quality assessment are deterministic. Rex scores. Charlie narrates. Neither decides what exists.

---

## Scope

### In scope

- New `source_type = 'report_watch'` on `news_sources`, with detection configuration
- Three detection strategies, tried per source in configured order: RSS/Atom, sitemap diff, index-page scrape
- `report_candidates` table — discovered URLs, evaluated and remembered, including rejections
- `reports` table — the acquired artefact with content hash, storage path and provenance
- Immutable artefact storage in Supabase Storage
- Extraction waterfall: PDF text layer → OCR fallback for scanned documents → HTML via Jina Reader
- Deterministic extraction quality assessment with a manual-review flag
- `report_segments` with pgvector embeddings, page-anchored for citation
- Unified `search_segments()` RPC across `report_segments` and the existing `transcript_segments`
- Surfacing into the existing research feed via `news_items` — Rex scores reports with the existing rubric
- Redistribution classification and licence notes at the source level
- Source health monitoring — silent scraper failure is the primary operational risk
- Crawl politeness: robots.txt, crawl delay, identified user agent, size caps

### Out of scope (v1)

- Firecrawl for JS-rendered or paginated archives — the ladder stops at index-page scraping
- Chart and figure extraction via a vision pass — deferred, see Open Questions
- Table extraction to structured data
- Paywalled or form-gated reports requiring authentication
- A separate report browse library — reports live in `/research` alongside everything else
- Automatic re-crawl of previously acquired URLs to detect silent revisions
- Client-facing report access of any kind

---

## User Stories

**As a founder, I need to:**

- Add a publisher to the watch list by pasting their reports index URL, without writing a scraper
- Be told when a new report appears, with enough context to decide whether to read it
- Paste a URL manually and have it ingested through the same pipeline
- Know that a source has stopped producing results because its page structure changed, rather than assume the publisher went quiet
- Record why a report matters in my own words, so agents inherit the judgement rather than the document
- Search across report text and podcast transcripts in one place
- See at a glance whether a report can be quoted, or is internal reference only

**As Rex (research agent), I need to:**

- Receive report items in `news_items` with the same shape as every other inbound item, so the scoring rubric needs no special case
- Read the extracted body, not the filename, when assessing relevance
- Know the extraction quality, so a partially-extracted scan is not scored as though it were clean text

**As Simon (coordinator), I need to:**

- Query `v_report_watch_health` and flag sources returning zero candidates for consecutive runs
- Surface newly acquired high-relevance reports in the daily digest

**As Lex (compliance officer), I need to:**

- Know the `redistribution` classification of any report a content pipeline draws on
- Block publication of content that quotes an `internal_only` source

---

## Data Model

### Additive changes to `news_sources`

The existing registry gains a source type and a configuration blob. No new sources table — a report watch is a source like any other.

|Column                          |Type       |Notes                                                                             |
|--------------------------------|-----------|----------------------------------------------------------------------------------|
|`source_type`                   |TEXT       |Add `report_watch` to the existing enum                                           |
|`detection_strategies`          |TEXT[]     |Ordered, e.g. `ARRAY['rss','sitemap','index_page']::text[]`. First to return candidates wins.|
|`detection_config`              |JSONB      |Strategy-specific configuration (see below)                                        |
|`detection_last_success_at`     |TIMESTAMPTZ|Last run that returned at least one candidate                                      |
|`detection_consecutive_empty`   |INT        |Reset to 0 on any candidate. Simon alerts above threshold.                         |
|`redistribution_default`        |TEXT       |`internal_only`, `quotable`, `client_shareable`. Default `internal_only`.          |
|`licence_notes`                 |TEXT       |Free text — terms of use, attribution requirements, known restrictions             |
|`ocr_enabled`                   |BOOLEAN    |Cost-bearing control. Default `false`.                                             |
|`ocr_page_limit`                |INT        |Per-document page cap when OCR fires. Default `40`.                                |
|`crawl_delay_seconds`           |INT        |Default `5`                                                                        |
|`max_candidates_per_run`        |INT        |Default `25`. Guards against a sitemap returning several thousand URLs.            |

**`detection_config` shape:**

```json
{
  "rss": {
    "feed_url": "https://river.com/learn/rss.xml"
  },
  "sitemap": {
    "sitemap_url": "https://river.com/sitemap.xml",
    "path_prefix": "/reports/",
    "path_exclude": ["/reports/archive/"]
  },
  "index_page": {
    "index_url": "https://river.com/reports",
    "item_selector": "article.report-card",
    "link_selector": "a[href]",
    "title_selector": "h3",
    "date_selector": "time",
    "date_format": "MMMM D, YYYY",
    "follow_to_pdf": true,
    "pdf_link_selector": "a[href$='.pdf']"
  },
  "url_filters": {
    "must_match": ["\\.pdf$", "/reports/"],
    "must_not_match": ["/tag/", "/author/"]
  }
}
```

`follow_to_pdf` handles the common pattern where the index links to a landing page and the PDF sits one hop further in. The fetch step follows exactly one hop, no more.

---

### `report_candidates`

Every URL discovery has ever surfaced, including the ones rejected. This table earns its place because a sitemap diff on a large publisher returns hundreds of URLs, of which perhaps three are reports. Without a memory of rejections, every run re-evaluates the same rubbish.

|Column                |Type       |Notes                                                                          |
|----------------------|-----------|-------------------------------------------------------------------------------|
|`id`                  |UUID       |PK                                                                             |
|`source_id`           |UUID       |FK → `news_sources`                                                            |
|`url`                 |TEXT       |Normalised: lowercase host, tracking params stripped, fragment removed         |
|`url_hash`            |TEXT       |`sha256(url)` — unique with `source_id`                                        |
|`raw_url`             |TEXT       |As discovered, before normalisation                                            |
|`discovery_method`    |TEXT       |`rss`, `sitemap`, `index_page`, `manual`, `email_attachment`                   |
|`title_hint`          |TEXT       |Scraped title, if the strategy provided one                                    |
|`published_at_hint`   |DATE       |Scraped date, if available — not authoritative                                 |
|`status`              |TEXT       |`new`, `queued`, `fetching`, `acquired`, `skipped`, `failed`, `duplicate`      |
|`skip_reason`         |TEXT       |`filter_mismatch`, `wrong_content_type`, `too_large`, `robots_disallowed`, `already_acquired`, `manual_reject`|
|`http_status`         |INT        |                                                                               |
|`etag`                |TEXT       |From HEAD, for conditional GET                                                 |
|`last_modified`       |TEXT       |From HEAD                                                                      |
|`content_type`        |TEXT       |                                                                               |
|`content_length`      |BIGINT     |From HEAD, checked against size cap before download                            |
|`attempts`            |INT        |Default `0`. Three failures moves status to `failed`.                          |
|`last_attempt_at`     |TIMESTAMPTZ|                                                                               |
|`report_id`           |UUID       |FK → `reports`, set on successful acquisition                                  |
|`first_seen_at`       |TIMESTAMPTZ|                                                                               |
|`last_seen_at`        |TIMESTAMPTZ|Updated each run the URL still appears — a URL disappearing is itself a signal |
|`created_at`          |TIMESTAMPTZ|                                                                               |
|`updated_at`          |TIMESTAMPTZ|Auto-updated                                                                   |

**URL normalisation rules** (applied before hashing, deterministic and versioned in code):

- Lowercase scheme and host
- Strip `utm_*`, `ref`, `fbclid`, `gclid`, `mc_cid`, `mc_eid`
- Strip trailing slash except at root
- Strip fragment
- Preserve all other query parameters — some publishers genuinely route by query string

---

### `reports`

The acquired artefact. One row per distinct piece of content, not per URL.

|Column                 |Type         |Notes                                                                     |
|-----------------------|-------------|--------------------------------------------------------------------------|
|`id`                   |UUID         |PK                                                                        |
|`source_id`            |UUID         |FK → `news_sources`                                                       |
|`candidate_id`         |UUID         |FK → `report_candidates`                                                  |
|`news_item_id`         |UUID         |FK → `news_items` — the feed representation                               |
|`title`                |TEXT         |From PDF metadata, then first heading, then `title_hint`, then filename    |
|`publisher`            |TEXT         |Denormalised from source at acquisition time                              |
|`report_type`          |TEXT         |`quarterly`, `annual`, `research_note`, `whitepaper`, `market_update`, `regulatory`, `survey`, `other`|
|`published_at`         |DATE         |Best available: PDF metadata → scraped date → HTTP `Last-Modified`         |
|`published_at_source`  |TEXT         |Which of the above was used — matters when dates disagree                 |
|`source_url`           |TEXT         |Where it was found                                                        |
|`canonical_url`        |TEXT         |Landing page, if acquisition followed a hop                               |
|`file_format`          |TEXT         |`pdf`, `html`                                                             |
|`storage_path`         |TEXT         |Supabase Storage path — the immutable original                            |
|`file_name`            |TEXT         |                                                                          |
|`file_size_bytes`      |BIGINT       |                                                                          |
|`content_hash`         |TEXT         |`sha256` of the raw bytes — the real identity key                         |
|`page_count`           |INT          |NULL for HTML                                                             |
|`word_count`           |INT          |Post-extraction                                                           |
|`body`                 |TEXT         |Full extracted markdown                                                   |
|`extraction_method`    |TEXT         |`pdf_text_layer`, `ocr`, `html_jina`, `manual`                            |
|`extraction_quality`   |TEXT         |`good`, `partial`, `failed`                                               |
|`extraction_metrics`   |JSONB        |`{ chars_per_page, alpha_ratio, empty_page_count, ocr_pages }`            |
|`ocr_used`             |BOOLEAN      |Default `false`                                                           |
|`revision_of_report_id`|UUID         |FK → `reports` — same URL, different `content_hash`                       |
|`superseded_at`        |TIMESTAMPTZ  |Set when a revision arrives                                               |
|`redistribution`       |TEXT         |Inherited from source, overridable per report                             |
|`licence_notes`        |TEXT         |                                                                          |
|`curator_note`         |TEXT         |Why this matters, in a human's words. First-class data.                   |
|`tags`                 |TEXT[]       |                                                                          |
|`status`               |TEXT         |`ingesting`, `ingested`, `needs_review`, `archived`                       |
|`created_by`           |UUID         |FK → `team_members` — NULL for automated acquisition                      |
|`created_at`           |TIMESTAMPTZ  |                                                                          |
|`updated_at`           |TIMESTAMPTZ  |Auto-updated                                                              |

**Why `content_hash` and not URL is identity:** publishers re-upload the same PDF at new paths, CDN-bust filenames, and occasionally revise a document in place without changing anything visible. A unique index on `content_hash` catches the first two. The third is caught by the reverse case — same URL, different hash — which creates a new row linked via `revision_of_report_id` and stamps `superseded_at` on the predecessor. Both rows are retained. Deleting the version BTS actually read would defeat the point of storing it.

**Why `body` lives on `reports` as well as in segments:** Rex scores the whole document, the feed shows an excerpt, and reassembling from chunks for either is needless work.

---

### `report_segments`

Chunked and embedded, page-anchored so a retrieved passage can cite where it came from.

|Column          |Type         |Notes                                                            |
|----------------|-------------|-----------------------------------------------------------------|
|`id`            |UUID         |PK                                                               |
|`report_id`     |UUID         |FK → `reports` ON DELETE CASCADE                                 |
|`segment_index` |INT          |Ordinal within the report                                        |
|`page_number`   |INT          |NULL for HTML                                                    |
|`heading_path`  |TEXT         |Breadcrumb of enclosing headings, e.g. `Outlook > Mining economics`|
|`content`       |TEXT         |                                                                 |
|`token_count`   |INT          |                                                                 |
|`embedding`     |VECTOR(1536) |`text-embedding-3-small`                                         |
|`created_at`    |TIMESTAMPTZ  |                                                                 |

**Chunking:** target 800 tokens with 100 token overlap. Chunks never cross a page boundary in a PDF — a chunk that spans pages cannot be cited cleanly. Heading boundaries take precedence over the token target where they fall within 30 per cent of it.

**Publish wall:** segments are written only when `extraction_quality` is `good` or `partial` and `status = 'ingested'`. A `failed` extraction produces a `news_item` and a stored artefact, but no embeddings. Indexing garbage is worse than indexing nothing, because garbage retrieves.

---

### Additive change to `news_items`

|Column      |Type|Notes                                                        |
|------------|----|-------------------------------------------------------------|
|`report_id` |UUID|FK → `reports`. NULL for all existing item types.            |

Nothing else changes. Rex's rubric, the feed query, the archive and the detail page all continue to treat items agnostically, which was the point of the original design.

---

## Database Views

### `v_report_watch_health`

The operational surface for the silent-failure problem. A scraper that returns nothing looks exactly like a publisher that has not published.

```sql
CREATE VIEW v_report_watch_health AS
  SELECT
    s.id                                   AS source_id,
    s.name,
    s.detection_strategies,
    s.detection_last_success_at,
    s.detection_consecutive_empty,
    (CURRENT_DATE - s.detection_last_success_at::date) AS days_since_candidate,
    COUNT(c.id) FILTER (
      WHERE c.first_seen_at > NOW() - INTERVAL '30 days'
    )                                      AS candidates_30d,
    COUNT(c.id) FILTER (
      WHERE c.status = 'acquired'
        AND c.first_seen_at > NOW() - INTERVAL '30 days'
    )                                      AS acquired_30d,
    COUNT(c.id) FILTER (
      WHERE c.status = 'failed'
    )                                      AS failed_total,
    MAX(r.published_at)                    AS latest_report_published_at
  FROM news_sources s
  LEFT JOIN report_candidates c ON c.source_id = s.id
  LEFT JOIN reports r          ON r.source_id = s.id
  WHERE s.source_type = 'report_watch'
  GROUP BY s.id
  ORDER BY s.detection_consecutive_empty DESC, days_since_candidate DESC NULLS FIRST;
```

### `v_recent_reports`

```sql
CREATE VIEW v_recent_reports AS
  SELECT
    r.id,
    r.title,
    r.publisher,
    r.report_type,
    r.published_at,
    (CURRENT_DATE - r.published_at) AS days_since_published,
    r.page_count,
    r.word_count,
    r.file_format,
    r.extraction_quality,
    r.ocr_used,
    r.redistribution,
    r.curator_note,
    r.status,
    r.source_url,
    s.name                          AS source_name,
    ni.relevance_score,
    ni.read_at
  FROM reports r
  LEFT JOIN news_sources s ON s.id = r.source_id
  LEFT JOIN news_items ni  ON ni.id = r.news_item_id
  WHERE r.status <> 'archived'
    AND r.superseded_at IS NULL
  ORDER BY r.published_at DESC NULLS LAST;
```

---

## Unified Segment Search

`transcript_segments` are already embedded with no search surface reading them. Adding a second orphan index would be a poor use of a pgvector extension.

One RPC serves both. A vector index cannot be built on a view, so the function unions two separately-indexed subqueries, each with its own `ORDER BY ... LIMIT` so both HNSW indexes are used, then merges.

```sql
CREATE OR REPLACE FUNCTION search_segments(
  query_embedding VECTOR(1536),
  source_types    TEXT[] DEFAULT ARRAY['report','transcript'],
  match_count     INT    DEFAULT 20
)
RETURNS TABLE (
  source_type  TEXT,
  segment_id   UUID,
  parent_id    UUID,
  parent_title TEXT,
  locator      TEXT,
  content      TEXT,
  similarity   FLOAT
)
LANGUAGE sql STABLE AS $$
  WITH report_hits AS (
    SELECT
      'report'::TEXT,
      rs.id,
      rs.report_id,
      r.title,
      COALESCE('p. ' || rs.page_number::text, rs.heading_path),
      rs.content,
      1 - (rs.embedding <=> query_embedding)
    FROM report_segments rs
    JOIN reports r ON r.id = rs.report_id
    WHERE 'report' = ANY(source_types)
    ORDER BY rs.embedding <=> query_embedding
    LIMIT match_count
  ),
  transcript_hits AS (
    SELECT
      'transcript'::TEXT,
      ts.id,
      ts.episode_id,
      pe.title,
      'start ' || ts.start_seconds::text || 's',
      ts.content,
      1 - (ts.embedding <=> query_embedding)
    FROM transcript_segments ts
    JOIN podcast_episodes pe ON pe.id = ts.episode_id
    WHERE 'transcript' = ANY(source_types)
    ORDER BY ts.embedding <=> query_embedding
    LIMIT match_count
  )
  SELECT * FROM report_hits
  UNION ALL
  SELECT * FROM transcript_hits
  ORDER BY 7 DESC
  LIMIT match_count;
$$;
```

Column names on `transcript_segments` must be verified against the deployed schema before this ships — the podcast spec named them, but the migration may have diverged.

---

## Workflow — `report-watch-ingestion`

A Mastra **workflow**, not an agent. Every step below has a defined input, a defined output and no discretion. The single agent call is Rex's scoring, which happens after the item exists.

Scheduled daily at 07:00 AEST, ahead of Simon's 08:00 compliance run.

```
loadActiveSources
      ↓
  .foreach(source)  ──────────────────────────────┐
      ↓                                            │
  discoverCandidates      (strategy dispatch)      │
      ↓                                            │
  normaliseAndFilter      (deterministic)          │
      ↓                                            │
  .foreach(candidate)                              │
      ↓                                            │
  headCheck               (etag, size, type)       │
      ↓                                            │
  fetchArtefact           (crawl delay honoured)   │
      ↓                                            │
  storeArtefact           (hash, dedupe, upload)   │
      ↓                                            │
  extractText             (waterfall)              │
      ↓                                            │
  assessQuality           (deterministic metrics)  │
      ↓                                            │
  chunkAndEmbed           (gated on quality)       │
      ↓                                            │
  createNewsItem                                   │
      ↓                                            │
  scoreWithRex            (the only agent step)    │
      ↓                                            │
  logActivity  ────────────────────────────────────┘
```

### Step notes

**`discoverCandidates`** dispatches on `detection_strategies` in order, stopping at the first strategy returning candidates. RSS parses the feed. Sitemap fetches, filters by `path_prefix`, and diffs against `report_candidates.url_hash` for that source. Index page fetches the HTML, applies the selectors, and — where `follow_to_pdf` is set — follows exactly one hop to find the artefact link.

Every strategy writes its full candidate set to `report_candidates`, including rejections with a `skip_reason`. Discovery is idempotent: running it twice produces no new rows, only updated `last_seen_at`.

**`normaliseAndFilter`** applies URL normalisation, the `url_filters` regexes, and the `max_candidates_per_run` cap. If a run would exceed the cap, the newest candidates by `published_at_hint` win and the remainder stay `new` for the next run. A first run against a large sitemap will take several days to work through the backlog, which is correct behaviour rather than a bug.

**`headCheck`** issues a HEAD, records `etag`, `last_modified`, `content_type` and `content_length`. Rejects on wrong content type or a size above the cap (default 50MB). Skips download entirely when `etag` matches a previously acquired candidate.

**`fetchArtefact`** honours `crawl_delay_seconds`, checks robots.txt once per host per run, and sends an identified user agent with a contact URL. Being a well-behaved crawler is cheaper than being blocked.

**`storeArtefact`** computes `sha256` over the raw bytes before doing anything else. A hash collision with an existing `reports` row ends the branch with `status = 'duplicate'` — that is the case where a publisher moved a PDF, and no further work is warranted. Otherwise the bytes go to Supabase Storage at `reports/{source_slug}/{yyyy}/{content_hash}.{ext}`, keyed by hash so the path is inherently immutable.

**`extractText`** waterfall:

1. **PDF text layer** via `unpdf` or `pdf-parse`, page by page, preserving page boundaries
2. **Quality gate** — if `chars_per_page < 100` or `alpha_ratio < 0.6`, the text layer is absent or garbled
3. **OCR fallback** — fires only when `ocr_enabled` is true on the source, capped at `ocr_page_limit` pages. Pages beyond the cap are recorded as empty with a note rather than silently dropped.
4. **HTML** — Jina Reader to markdown, publisher chrome stripped, reusing the existing RSS extraction path

**`assessQuality`** is arithmetic, not judgement: chars per page, alphabetic character ratio, empty page count, and proportion of pages requiring OCR. `good` above both thresholds on all pages; `partial` where some pages fail; `failed` where the majority do. A `failed` extraction still produces a stored artefact and a feed item marked `needs_review` — a report BTS knows exists but cannot read is more useful than one it never noticed.

**`scoreWithRex`** passes `extraction_quality` in the payload. A partial extraction that scores 0.4 may be a 0.8 report with half its text missing, and the rubric should be able to see the difference.

**Mastra API note:** verify `createWorkflow`, `createStep`, `.foreach()` and `.parallel()` signatures against `node_modules/@mastra/core/dist/docs/` before writing any of this. The installed version is `1.51.0` and the framework changes often enough that training-data recall is not trustworthy.

---

## Agent Integration

### Rex — scoring

No rubric change. Reports arrive as `news_items` with a longer body and an `extraction_quality` field. Rex's existing three dimensions apply unchanged. Worth watching during calibration: long institutional reports may systematically score higher on materiality simply for being long, and `rex_calibration_log` is the place that shows up.

### Simon — source health and digest

Two additions to the daily scheduled workflow:

1. Query `v_report_watch_health` for sources where `detection_consecutive_empty >= 5` or `days_since_candidate > 45`. Compose a Signal message proposing a scraper review. This is the alert that matters — a broken selector is invisible until someone goes looking.
2. Include newly acquired reports above the relevance threshold in the digest, with publisher, page count and the curator note where one exists.

```
Report watch — 1 source needs attention:

River Financial: no candidates in 12 consecutive runs (last: 3 June)
  Strategy: index_page — selector 'article.report-card' may have changed

2 new reports acquired:

Fidelity Digital Assets — Q2 2026 Institutional Flows (34pp, quotable)
Glassnode — Week On-chain 29 (12pp, internal only)
```

### Lex — classification at ingest, gate at use

Lex does not review reports on acquisition. Reports are third-party research, not BTS output, and gating ingestion would create a queue nobody clears.

The gate sits where the content leaves: `redistribution` is carried on every retrieved segment, and any content pipeline drawing on an `internal_only` source is blocked from quoting it. Attribution and paraphrase rules apply as normal. The failure mode being prevented is Charlie cheerfully lifting three paragraphs of River's prose into a LinkedIn post, which is a copyright problem before it is a compliance one, and a compliance problem soon after.

### Charlie and Bruno — retrieval

Both call `search_segments()` rather than reading `reports` directly. Retrieved passages carry `parent_title`, `locator` and `redistribution`, so a citation is always constructible and a restriction is never lost between retrieval and drafting.

---

## Web App

No new top-level section. Reports live in `/research`.

### `/research` — feed

Report items get a distinguishing treatment within the existing card:

- Format badge — `PDF` or `HTML`, in the small caps caption style
- Page count and word count in `JetBrains Mono`
- Publisher name given more weight than for RSS items, since with reports the publisher largely is the signal
- `needs_review` items carry a warning-coloured indicator with the extraction failure reason
- Redistribution shown as a subtle tag: `internal only` in secondary text, `quotable` in gold-light
- Primary action opens the stored artefact; secondary action opens the original URL

### `/research/[id]` — detail

For report items, the detail page adds:

- Rendered extracted markdown, with page markers as light dividers
- A metadata panel: publisher, published date and its source, page count, extraction method, content hash (truncated, monospace), acquisition date
- Curator note field, editable inline, prominent rather than tucked at the bottom
- Revision notice where `revision_of_report_id` is set, linking to the superseded version
- Download original

**Text and file, both on the page.** The page reads `reports.body` — the full extracted markdown — for the inline view, so a 30MB PDF never needs downloading just to skim it. The original artefact is a separate action, because the `reports` bucket is private and its `storage_path` is not a public URL. A "Download original" button calls a server action that mints a short-lived signed URL on demand:

```typescript
// app/research/[id]/actions.ts
'use server'

import { getAuthedClient } from '@/lib/supabase/server'   // house pattern
import { humanizeError } from '@/lib/errors'

export async function getReportFileUrl(reportId: string) {
  const supabase = await getAuthedClient()   // uses getUser(), not getSession()

  const { data: report, error: lookupError } = await supabase
    .from('reports')
    .select('storage_path, file_name')
    .eq('id', reportId)
    .single()

  if (lookupError || !report) {
    return { success: false, error: humanizeError(lookupError) }
  }

  const { data, error } = await supabase.storage
    .from('reports')
    .createSignedUrl(report.storage_path, 60)   // 60-second expiry

  if (error) {
    return { success: false, error: humanizeError(error) }
  }

  return { success: true, url: data.signedUrl, fileName: report.file_name }
}
```

The signed URL is generated at click time, expires in sixty seconds, and never sits in the rendered DOM. The client action opens `url` in a new tab (or triggers a download using `fileName`) on a `{ success: true }` result. This keeps the split the whole feature is built around: `body` is the convenience surface, the stored artefact is the source of record, and the private bucket means the source of record is never exposed by an unguarded link.

### `/research/sources` — registry

The type-aware progressive disclosure already built for podcasts extends to `report_watch`. Selecting the type reveals:

- Detection strategy multi-select with drag ordering
- Per-strategy configuration fields, shown only for selected strategies
- A **Test detection** button running discovery without acquisition, returning the candidate list with filter verdicts. This is the difference between a scraper someone configures in two minutes and one they abandon.
- OCR toggle, styled as a cost-bearing control in the same manner as the Deepgram toggle, with the page limit beside it
- Redistribution default and licence notes

### `/research/sources` — health panel

A table driven by `v_report_watch_health`: source, last candidate, consecutive empty runs, acquired in 30 days, latest report date. Consecutive empty runs in `JetBrains Mono`, warning colour above 3, destructive above 7. Sorted worst first, because this table is only ever read when something is wrong.

---

## Indexes

```sql
CREATE UNIQUE INDEX idx_report_candidates_url ON report_candidates(source_id, url_hash);
CREATE INDEX idx_report_candidates_status     ON report_candidates(status);
CREATE INDEX idx_report_candidates_source     ON report_candidates(source_id);
CREATE INDEX idx_report_candidates_seen       ON report_candidates(last_seen_at DESC);

CREATE UNIQUE INDEX idx_reports_content_hash  ON reports(content_hash);
CREATE INDEX idx_reports_source               ON reports(source_id);
CREATE INDEX idx_reports_published            ON reports(published_at DESC);
CREATE INDEX idx_reports_status               ON reports(status);
CREATE INDEX idx_reports_news_item            ON reports(news_item_id);

CREATE INDEX idx_report_segments_report       ON report_segments(report_id);
CREATE INDEX idx_report_segments_embedding    ON report_segments
  USING hnsw (embedding vector_cosine_ops);

CREATE INDEX idx_news_items_report            ON news_items(report_id);
```

---

## RLS Policies

```sql
ALTER TABLE report_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "report_candidates_all" ON report_candidates
  FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reports_all" ON reports
  FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE report_segments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "report_segments_all" ON report_segments
  FOR ALL USING (auth.role() = 'authenticated');
```

Storage bucket `reports` is private. Access is via signed URLs generated server-side, with `getUser()` rather than `getSession()` in the route handler.

---

## Open Questions

- **Silent revision detection.** v1 does not re-fetch acquired URLs. A publisher correcting a figure in place goes unnoticed. A cheap mitigation is a monthly HEAD sweep comparing `etag` against the stored value, downloading only on change. Low cost, deferred only because it is not needed until the corpus is large enough for a revision to matter.
- **Form-gated reports.** Fidelity and several institutional publishers put reports behind an email capture form. These cannot be crawled. Options: manual paste as the permanent answer, or subscribe with a `feed.btsy.com.au` alias so the PDF arrives by email and enters through the attachment path instead. The alias route is probably better, and it is already built.
- **Chart and figure extraction.** In these reports the charts frequently are the content, and the surrounding text is connective tissue. A vision pass on figure-dense pages would capture what the text layer cannot. Deferred on cost grounds, but the schema is ready: `extraction_method` accepts a new value and `report_segments` accepts a segment with no page text.
- **Table extraction.** Related but separable. Institutional reports carry data tables that would be genuinely valuable as structured rows feeding the indicators dashboard. Materially harder than it looks, and out of scope until a specific table is worth the effort.
- **`report_candidates` growth.** A large sitemap produces thousands of permanently-rejected rows per source. Harmless at current scale. If it becomes untidy, rejected candidates older than twelve months with `skip_reason = 'filter_mismatch'` can be pruned, provided the URL hash is retained somewhere so they are not re-evaluated.
- **Storage cost.** Institutional PDFs run 5–40MB. At a few hundred reports a year this is trivial. Worth revisiting only if the watch list grows past roughly fifty sources.
- **Detection strategy fallback semantics.** Currently the first strategy returning candidates wins, and the others are not tried. The alternative is running all configured strategies and merging by URL hash, which is more robust and more expensive. First-wins is the v1 choice; revisit if a source's RSS feed proves to be a stale subset of its index page.

---

## Claude Code Kickoff Prompt

> We're building the Report Ingestion feature per `docs/features/report-ingestion-spec.md`. Read that spec, `schema.sql`, and `docs/features/research-feed-spec.md` before writing anything — this feature extends the existing research feed rather than sitting beside it.
>
> Start with the database migration only: additive columns on `news_sources` and `news_items`, the `report_candidates`, `reports` and `report_segments` tables, the two views, the `search_segments()` function, all indexes and RLS policies. Verify the actual column names on `transcript_segments` and `podcast_episodes` against the deployed schema before writing `search_segments()` — do not assume the podcast spec's naming survived the migration.
>
> Run each `execute_sql` call as a single logical operation; multiple statements in one call silently drop earlier result sets, and verification SELECTs go in their own calls.
>
> Once the migration is approved, scaffold the `report-watch-ingestion` workflow structure with typed step boundaries but no step implementations. For all Mastra code, verify API signatures against `node_modules/@mastra/core/dist/docs/` first — the installed version is 1.51.0 and your training data is likely out of date.

Suggested follow-up sessions:

1. `discoverCandidates` — all three detection strategies plus URL normalisation, with fixture-based tests against captured HTML
2. `headCheck` → `fetchArtefact` → `storeArtefact` — acquisition and hashing
3. `extractText` → `assessQuality` — the waterfall, with a scanned PDF fixture
4. `chunkAndEmbed` → `createNewsItem` → Rex scoring
5. `search_segments()` retrieval surface and a `/research/search` page
6. `/research/sources` report-watch form with the Test detection action (read `DESIGN_BRIEF.md` first)
7. Source health panel and Simon's alert step
