# The Researcher — Agent Specification

**Agent name:** The Researcher  
**Status:** Built
**Position in roster:** Agent 7 (specialist)
**Last updated:** 2026-04-26

---

## Overview

The Researcher is a specialist agent responsible for acquiring, verifying, and structuring information from the open web. It serves other agents and human team members as a shared intelligence layer — handling everything from quick fact verification to deep multi-hop research and ongoing topic monitoring.

Unlike the other agents (which are primarily *writers* — producing records, tasks, and content), The Researcher is a *reader and synthesiser*. It does not own any primary database tables directly. It feeds The Archivist's knowledge base, enriches Simon's context mid-workflow, and produces structured briefs for the Content Creator.

---

## Responsibilities

### Core functions

**Verification** — Confirm a specific claim, company detail, or factual assertion. Returns a structured verdict with supporting sources and a confidence score.

**Summarisation** — Given a subject and context, retrieve and synthesise relevant web content into a structured summary. Used by Simon before meetings, by the Content Creator for topic research, and by humans via Signal.

**Deep research** — Multi-hop, iterative research across multiple sources. Used for contact/company briefings, regulatory landscape analysis, and competitive intelligence.

**URL ingestion** — Accept a URL, extract clean markdown, and hand it to The Archivist's `ingest-knowledge` pipeline. Triggered when a human pastes a URL into Signal with intent to save it. For podcast episodes, The Researcher detects the podcast and searches YouTube for the episode to extract a transcript. If a YouTube transcript is found, it is returned as the `clean_markdown`. If not, the result signals that an audio file upload is needed for transcription by Roger.

**Monitoring** — Track a subject, topic, or entity over time. Run on a schedule, compare new findings against the prior state stored in the knowledge base, and surface meaningful changes to Simon.

**News aggregation** — Rex's `executeRoutineWorkflow` runs four `news_ingest` routines daily at 07:00 AEST, each targeting one category (regulatory, corporate, macro, international). Results are stored in the `news_items` table with vector embeddings and accessible via the `/news` web UI. Rex queries this feed first before making any external search calls (see `query-news-items` tool below).

### What it does NOT do

- It does not write CRM records directly (it hands data to Simon, who routes to the appropriate agent)
- It does not make decisions about what to do with findings — it returns structured output and lets the requesting agent or human decide
- It does not store its own persistent state — The Archivist's knowledge base is its memory

---

## ResearchBrief — Input Contract

Every research invocation — whether from Simon, another agent, a scheduled workflow, or a human Signal message — must be expressed as a `ResearchBrief`. This is the interface that allows The Researcher to serve multiple consumers without becoming a mess.

```typescript
interface ResearchBrief {
  // What kind of research to perform
  purpose: 'verify' | 'summarise' | 'deep_research' | 'ingest_url' | 'monitor';

  // Who is asking — shapes the output format and depth
  requester: 'simon' | 'archivist' | 'content_creator' | 'human';

  // The subject of research
  subject: string;

  // Why this is being researched — critical for shaping output relevance
  context?: string;

  // For 'ingest_url' and 'summarise' — a specific URL to process
  url?: string;

  // For 'monitor' — links to a monitor record
  monitor_id?: string;

  // Whether the requester is waiting for the result synchronously
  urgency: 'sync' | 'async';

  // Optional: caller-specified JSON schema for the output
  // If omitted, The Researcher uses the default schema for the purpose type
  outputSchema?: object;
}
```

### Why `context` matters

The `context` field is what separates useful research from generic retrieval. Consider the difference between:

- `subject: "Marcus Chen"` with no context → generic LinkedIn summary
- `subject: "Marcus Chen"` with `context: "CFO at Fortescue, meeting next Tuesday to discuss bitcoin treasury allocation"` → tailored briefing covering his public statements on digital assets, Fortescue's treasury policy, and any relevant regulatory signals

The Researcher must reason about the brief *before* deciding how to research — not just what to search for.

---

## ResearchResult — Output Contract

```typescript
interface ResearchResult {
  // Mirrors the input brief for traceability
  brief: ResearchBrief;

  // The structured finding
  purpose: 'verify' | 'summarise' | 'deep_research' | 'ingest_url' | 'monitor';

  // Populated for 'verify'
  verification?: {
    verdict: 'confirmed' | 'refuted' | 'unverifiable' | 'partial';
    confidence: 'high' | 'medium' | 'low';
    summary: string;
    sources: Source[];
  };

  // Populated for 'summarise' and 'deep_research'
  summary?: {
    headline: string;           // one sentence
    body: string;               // 2–5 paragraphs depending on depth
    key_points: string[];       // 3–7 bullets
    sources: Source[];
    relevance_note?: string;    // why this matters in the BTS context
  };

  // Populated for 'monitor'
  monitor?: {
    has_changed: boolean;
    change_summary?: string;    // only present if has_changed is true
    prior_digest: string;       // hash or summary of previous state
    current_digest: string;
    sources: Source[];
  };

  // Populated for 'ingest_url'
  ingestion?: {
    url: string;
    title: string;
    clean_markdown: string;     // ready for Archivist embedding pipeline
    extracted_at: string;       // ISO 8601
    transcript_source?: 'page' | 'youtube' | 'none';  // where content was sourced
    youtube_url?: string;       // set when transcript_source is 'youtube'
    needs_audio_upload?: boolean; // true when podcast episode has no online transcript
  };

  // Always present
  metadata: {
    completed_at: string;       // ISO 8601
    tool_calls_made: number;
    search_provider: 'tavily';  // extend later: 'parallel'
    duration_ms: number;
  };
}

interface Source {
  url: string;
  title: string;
  excerpt: string;              // short, relevant quote or paraphrase
  retrieved_at: string;
}
```

---

## Tool Inventory

The Researcher owns five tools plus two shared tools. All are wrapped as Mastra tools.

**Tool priority order (always follow this sequence):**
1. `query-news-items` — check internal feed first
2. `search-web` or `search-news` — external search when internal results are sparse
3. `asx-lookup` — for ASX company research
4. `fetch-url` — full content extraction
5. `crawl-structured` — premium fallback only

### 0. `query-news-items` — Internal news feed

**Purpose:** Query the `news_items` table before making any external search calls. Saves Tavily credits and returns pre-aggregated, AU-focused articles.  
**When used:** ALWAYS call first for any query that could match the daily news categories (regulatory, corporate, macro, international).  
**Data source:** `news_items` table, populated daily by the `news_ingest` routines.  

```typescript
const queryNewsItemsTool = createTool({
  id: 'query_news_items',
  inputSchema: z.object({
    query: z.string(),
    category: z.enum(['regulatory', 'corporate', 'macro', 'international']).optional(),
    days: z.number().default(14),
    limit: z.number().default(10),
  }),
  // returns: { count, results: [{ id, title, summary, category, published_at, url, source_name, relevance_score }] }
});
```

**Decision rule:** If `count >= 3`, use the internal results as primary sources. Supplement with `search-news` if the topic is highly time-sensitive (< 24h). If `count < 3`, proceed to web search.

---

### 1. `search-web` — Tavily Search API

**Purpose:** General web search. The primary research entry point.  
**Provider:** Tavily (free tier: 1,000 searches/month)  
**Upgrade path:** Parallel Web Systems Search API — swap provider, keep interface  
**When used:** All `verify`, `summarise`, and `deep_research` briefs  

```typescript
// Conceptual interface — verify exact Mastra tool signature against embedded docs
const searchWebTool = createTool({
  id: 'search-web',
  description: 'Search the web for current information',
  inputSchema: z.object({
    query: z.string(),
    max_results: z.number().default(5),
    search_depth: z.enum(['basic', 'advanced']).default('basic'),
  }),
  // returns: array of { url, title, content, score }
});
```

**Notes:**
- Use `search_depth: 'advanced'` for `deep_research` and `verify` purposes only — it costs more API credits
- Always run 2–3 searches minimum for verification tasks, cross-referencing results before returning a verdict
- Keep queries short and semantic (3–6 words) — do not over-specify

---

### 2. `fetch-url` — Jina Reader

**Purpose:** Extract clean markdown from any URL.  
**Provider:** Jina AI Reader (free, no API key required for basic use)  
**Endpoint:** `https://r.jina.ai/{url}`  
**When used:** `ingest_url` briefs; following up on promising search results in deep research  

```typescript
const fetchUrlTool = createTool({
  id: 'fetch-url',
  description: 'Fetch a URL and return clean markdown content',
  inputSchema: z.object({
    url: z.string().url(),
  }),
  // returns: { title, markdown, retrieved_at }
});
```

**Notes:**
- Jina handles JS-rendered pages reasonably well — no Playwright needed for most cases
- If Jina returns empty or garbled content, fall back to Firecrawl
- Output feeds directly into The Archivist's embedding pipeline for `ingest_url` tasks

---

### 3. `crawl-structured` — Firecrawl

**Purpose:** Deep structured extraction from complex or multi-page sites.  
**Provider:** Firecrawl (free tier: 500 pages/month)  
**When used:** Selectively — when Jina fails, or when structured data extraction is needed (e.g. extracting a full company profile from a website)  

```typescript
const crawlStructuredTool = createTool({
  id: 'crawl-structured',
  description: 'Extract structured data from a URL using Firecrawl',
  inputSchema: z.object({
    url: z.string().url(),
    extract_schema: z.object({}).passthrough().optional(),
  }),
  // returns: { markdown, structured_data, metadata }
});
```

**Notes:**
- Treat as a premium tool — use only when Jina is insufficient
- The `extract_schema` param enables schema-guided extraction (e.g. "extract company name, ASX code, and board members")
- Monitor free tier usage; 500 pages/month is sufficient for BTS's current scale

---

### 4. `youtube-transcript` — YouTube Transcript Extraction

**Purpose:** Fetch the timestamped transcript and metadata for a YouTube video.  
**Provider:** `youtube-transcript` npm package (fetches auto-generated or manual captions)  
**When used:** During `ingest_url` when a podcast episode is detected and a YouTube version is found via search  

```typescript
const youtubeTranscriptTool = createTool({
  id: 'youtube-transcript',
  description: 'Fetch transcript and metadata for a YouTube video',
  inputSchema: z.object({
    videoUrl: z.string(),  // YouTube URL or 11-character video ID
  }),
  // returns: { videoId, title, channel, duration, segmentCount, transcript }
});
```

**Notes:**
- Shared tool — also used by The Archivist for direct YouTube URL ingestion
- Located in `apps/agents/src/tools/youtube.ts`
- Supports multiple YouTube URL formats (watch, short, embed)
- Transcript is timestamped (`[MM:SS] text`) and capped at 50KB
- Throws an error if the video has no captions — The Researcher catches this and falls back to `needs_audio_upload: true`

---

## Podcast YouTube Lookup — `ingest_url` Sub-flow

When The Researcher processes an `ingest_url` brief and detects the URL is a podcast episode:

1. **Detect podcast** — URL patterns (spotify.com, podcasts.apple.com, podbean.com, anchor.fm, transistor.fm, buzzsprout.com, overcast.fm, pocketcasts.com, simplecast.com) or page content signals (show notes, episode description, no full transcript)
2. **Extract metadata** — podcast name + episode title from the page content
3. **Search YouTube** — `search_web` with `"{podcast name} {episode title}"`
4. **Extract transcript** — if a YouTube match is found, call `youtube_transcript`
5. **Return result**:
   - Transcript found → `transcript_source: 'youtube'`, `youtube_url`, `clean_markdown` = full transcript with header
   - No YouTube match or no captions → `transcript_source: 'none'`, `needs_audio_upload: true`, `clean_markdown` = show notes

Simon handles the `needs_audio_upload` signal by asking the director for an audio file so Roger can transcribe it. The show notes are saved to the knowledge base in the meantime so the metadata is preserved.

When storing in the knowledge base, `source_type` should be `'podcast'` (not `'youtube'`) since the content is a podcast — YouTube was just the transcript source. The original podcast URL is `source_url`.

---

## Mastra Implementation Pattern

> ⚠️ Always verify current Mastra agent and tool APIs against embedded docs before implementing. APIs shift between versions. The patterns below are conceptual — treat them as intent, not copy-paste code.

### Agent structure

The Researcher is a **Mastra Agent** (not a Workflow) because its core behaviour is iterative and decision-driven — it must reason about what to search next based on prior results.

```typescript
// apps/agents/src/agents/researcher.ts
import { Agent } from '@mastra/core/agent';  // verify import path
import { searchWebTool, fetchUrlTool, crawlStructuredTool } from '@platform/shared';

export const researcherAgent = new Agent({
  name: 'The Researcher',
  instructions: RESEARCHER_SYSTEM_PROMPT,
  model: 'anthropic/claude-sonnet-4-6',  // verify model string
  tools: {
    searchWeb: searchWebTool,
    fetchUrl: fetchUrlTool,
    crawlStructured: crawlStructuredTool,
  },
});
```

### System prompt principles

The system prompt must instil:

1. **Brief-first reasoning** — always parse the `ResearchBrief` and reason about the appropriate research strategy before making any tool calls
2. **Cross-referencing discipline** — never return a `verify` verdict from a single source; always corroborate
3. **BTS domain awareness** — understand the context of Bitcoin treasury adoption, Australian regulatory environment, and the types of companies BTS engages with
4. **Structured output discipline** — always return a valid `ResearchResult` JSON object; never return prose
5. **Source honesty** — if findings are inconclusive, say so; a `verdict: 'unverifiable'` with `confidence: 'low'` is better than a hallucinated confirmation
6. **Token efficiency** — do not over-research simple tasks; a company ASX verification needs 1–2 searches, not 8

### Invocation from Simon

Simon invokes The Researcher as a sub-agent mid-workflow using Mastra's agent-calling pattern:

```typescript
// Conceptual — verify current Mastra sub-agent invocation API
const result = await researcherAgent.generate(
  JSON.stringify(researchBrief),
  { output: 'object' }  // request structured JSON back
);
```

Simon passes a fully-formed `ResearchBrief` and awaits a `ResearchResult`. For `urgency: 'async'` briefs, Simon delegates and continues — The Researcher delivers via the knowledge base or a Signal notification.

---

## Database / Schema Considerations

The Researcher does not own primary tables. It interacts with the existing schema in the following ways:

### Reading

- `contacts` and `companies` — read to populate research context (e.g. "I'm researching Marcus Chen, CFO at Fortescue")
- `knowledge_items` (Archivist's table, to be specced) — read prior research state for monitoring tasks

### Writing

The Researcher writes indirectly:

- **Via The Archivist** — `ingest_url` results are handed to The Archivist as a structured `knowledge_item`
- **Via `agent_activity`** — all research runs are logged with `agent_name: 'researcher'`, `trigger_type`, and the full `ResearchResult` in `approved_actions`
- **Via `interactions`** — for contact/company research, Simon may write an interaction record of type `'note'` with the research summary in `raw_content` and `extracted_data`

### New table: `research_monitors`

Scheduled monitoring requires a dedicated table to track what is being watched and what was last seen.

```sql
CREATE TABLE research_monitors (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What to monitor
  subject         TEXT NOT NULL,         -- e.g. 'ASIC digital asset regulation'
  context         TEXT,                  -- why we're monitoring this
  search_queries  TEXT[] NOT NULL,       -- the queries to run on each check

  -- Schedule
  frequency       TEXT NOT NULL DEFAULT 'weekly'
                  CHECK (frequency IN ('daily', 'weekly', 'fortnightly')),
  next_run_at     TIMESTAMPTZ NOT NULL,
  last_run_at     TIMESTAMPTZ,

  -- State — used to detect changes
  last_digest     TEXT,                  -- hash or short summary of last result

  -- Notification routing
  notify_signal   BOOLEAN DEFAULT TRUE,
  notify_agent    TEXT,                  -- e.g. 'simon', 'content_creator'

  is_active       BOOLEAN DEFAULT TRUE,
  created_by      UUID REFERENCES team_members(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER research_monitors_updated_at
  BEFORE UPDATE ON research_monitors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_research_monitors_next_run ON research_monitors(next_run_at)
  WHERE is_active = TRUE;
```

This table should be added to `schema.sql` and covered by the standard authenticated RLS policy.

---

## Integration with Simon and Other Agents

### Simon (EA/Coordinator)

Simon is the primary delegator. Typical patterns:

- **Pre-meeting briefing** — Simon detects an upcoming interaction with a contact, creates a `ResearchBrief` with `purpose: 'deep_research'` and `requester: 'simon'`, receives a `ResearchResult`, and attaches the summary to its working context before composing a Signal briefing for the human
- **Verification mid-workflow** — Simon encounters an unverified claim during transcript processing and delegates a `purpose: 'verify'` brief before deciding what CRM action to take
- **Contact enrichment** — When a new contact is added with minimal data, Simon can trigger a research brief to fill in company context, public profile, and bitcoin literacy signals

### The Archivist

The Archivist is both a consumer and a memory provider:

- **Consumer** — receives `ingestion` payloads from The Researcher's `ingest_url` results and runs them through the embedding pipeline
- **Memory provider** — The Researcher queries the knowledge base before running external searches, avoiding redundant research on topics already well-covered

The handoff interface:

```typescript
// The Researcher signals The Archivist via a shared tool
// 'submit-for-ingestion' — wraps The Archivist's ingest-knowledge tool
{
  url: string;
  title: string;
  clean_markdown: string;
  curator_notes: string;   // human-provided — Simon prompts via Signal before handoff
  source: 'researcher_agent';
}
```

Note: `curator_notes` are human-provided. After content is fetched, Simon asks the human via Signal: "What should we remember about why you saved this?" before handing off to The Archivist. Auto-generation is deferred until real usage patterns emerge.

### Content Creator

The Content Creator requests research briefs for topic exploration and fact-checking:

- `purpose: 'summarise'` with `requester: 'content_creator'` — returns a `summary` object with `key_points` and `sources` ready to inform a content draft
- The Content Creator is responsible for deciding how to use the research; it does not need to understand how The Researcher works

### Human (via Signal)

Humans can trigger The Researcher directly via Signal:

> "Research Macquarie Asset Management's current stance on digital assets"  
> "Save this for me: https://..."  
> "Verify that MicroStrategy holds over 400,000 BTC"

Simon intercepts these messages, constructs the appropriate `ResearchBrief`, and routes to The Researcher. Results are delivered back to Signal as a formatted summary with sources.

---

## Monitoring — Design Detail

### How it works

1. A `research_monitors` record is created (by a human via Signal, or by Simon when a relevant topic is detected)
2. A scheduled Mastra workflow (`monitor-research-workflow`) runs on a cron schedule, querying all active monitors where `next_run_at <= NOW()`
3. For each monitor, a `ResearchBrief` with `purpose: 'monitor'` is constructed and passed to The Researcher
4. The Researcher runs the monitor's `search_queries`, generates a `current_digest`, and compares against `last_digest`
5. If `has_changed: true`, the result is routed to Simon (or the specified `notify_agent`) and optionally surfaced via Signal
6. `last_digest`, `last_run_at`, and `next_run_at` are updated regardless of whether a change was detected

### Digest strategy

The `last_digest` is a short prose summary (2–3 sentences) of the prior state, not a hash. This gives The Researcher enough semantic context to judge whether a change is meaningful, not just textually different. Example:

> "As of February 2026, ASIC had not issued specific guidance on corporate bitcoin treasury holdings. Their digital assets framework was still applying existing financial product law on a case-by-case basis."

On next run, The Researcher compares new findings against this prose digest and makes a semantic judgement call on materiality.

### Suggested initial monitors for BTS

| Subject | Frequency | Notify |
|---|---|---|
| ASIC digital asset regulatory guidance | Weekly | Simon + human |
| ASX-listed companies announcing bitcoin treasury positions | Weekly | Simon + Content Creator |
| Australian corporate tax treatment of bitcoin | Fortnightly | Simon |
| Key competitor activity (if identified) | Weekly | Simon |

---

## Build Order

The Researcher should be built *after* Simon's core delegation infrastructure is in place, since Simon is its primary consumer. However, the three tools (`search-web`, `fetch-url`, `crawl-structured`) can be built and tested in `packages/shared` independently at any time — they have no agent dependencies.

Suggested sequence:

1. Build and test the three tools in isolation via Mastra Studio
2. Build The Researcher agent with verification and summarisation capabilities
3. Wire Simon → Researcher delegation
4. Add `ingest_url` support and The Archivist handoff
5. Build `research_monitors` table and scheduled monitoring workflow

---

## Open Questions

- **Monitor creation via Signal vs UI:** To be decided once `research_monitors` is better understood in practice. Not blocking initial build.
- **Curator notes for agent-ingested content:** The Researcher will prompt the human for annotation at ingestion time via Signal. Auto-generation will be introduced later once patterns are established.
- **Tavily rate limiting:** Deferred — address when/if the free tier is hit in practice. Options are SearXNG sidecar on Railway or paid Tavily upgrade.
