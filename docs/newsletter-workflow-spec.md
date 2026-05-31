# Feature Spec — Newsletter Workflow

**Platform:** Bitcoin Treasury Solutions Internal Platform
**Feature:** AI-Powered Newsletter Generation Workflow
**Agent owner:** Charlie (Content Creator), with Rex (Researcher) and Simon (Orchestrator)
**Status:** Draft
**Last updated:** 2025-05-31

-----

## Overview

The Newsletter Workflow is a multi-stage Mastra Workflow that produces a BTS newsletter from internal content sources and supplementary research. It can be triggered on-demand via Simon or on a schedule. The output is a structured, editorial-reviewed newsletter inserted into `content_items` as a draft, ready for human approval before publishing.

The workflow is not a single agent free-writing into the void. It is a **deterministic pipeline with embedded agent reasoning at specific editorial gates** — the kind of architecture that produces consistently good output rather than occasionally brilliant but usually chaotic output.

Think of it like a small editorial team: Rex finds the stories, Charlie writes them, a virtual editor checks the voice, and the human gets a clean draft with a clear summary of decisions made along the way.

-----

## Design Principles

- **Workflow for structure, Agents for reasoning.** The pipeline stages are fixed. Agent intelligence is applied within stages (story selection, drafting, editorial review), not used to invent the pipeline itself.
- **RAG before web.** Internal content (`content_items`, `interactions`, `agent_activity` summaries) is always searched first. External research supplements gaps — it never replaces internal signal.
- **Human touch points are real gates, not theatrics.** The workflow suspends and waits for genuine human input at two points: story selection approval and final draft approval. Everything else runs autonomously.
- **Audit trail throughout.** Every workflow run logs to `agent_activity` with `workflow_run_id` so the full provenance of a published newsletter can be reconstructed.
- **Brand voice is enforced structurally, not by hoping.** The editorial agent receives the brand voice doc as part of its system prompt on every invocation — it’s not optional context.

-----

## Trigger Modes

### On-demand (via Simon)

Triggered by a Signal message to Simon, e.g.:

> “Charlie, put together a monthly newsletter — last 30 days, 5 stories, around 250 words each.”

Simon extracts structured parameters and calls `mastra.workflows.newsletterWorkflow.execute(...)`.

**Extracted parameters:**

```typescript
type NewsletterParams = {
  timeRange: 'week' | 'fortnight' | 'month';   // lookback window for internal content
  storyCount: number;                            // 3–8, default 5
  targetWordCount: number;                       // per story, default 250
  audienceContext?: string;                      // optional override, e.g. "CFO audience"
  triggerSource: 'signal' | 'schedule';
  requestedBy?: string;                          // team member name from Signal
};
```

### Scheduled

A Mastra cron trigger runs the workflow automatically. Suggested cadence: monthly, first Monday at 08:00 AEST.

```typescript
// In mastra config
schedules: [
  {
    name: 'monthly-newsletter',
    cron: '0 8 * * 1',          // Every Monday 8am (filter to first of month in workflow)
    workflow: 'newsletterWorkflow',
    input: {
      timeRange: 'month',
      storyCount: 5,
      targetWordCount: 250,
      triggerSource: 'schedule',
    }
  }
]
```

-----

## Workflow Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    NEWSLETTER WORKFLOW                          │
│                                                                 │
│  [1] INGEST          Internal RAG query across content_items,   │
│      & RETRIEVE      interactions, agent_activity summaries     │
│          ↓                                                      │
│  [2] STORY           Rex agent ranks and selects candidate      │
│      SELECTION       stories, produces shortlist with rationale │
│          ↓                                                      │
│  [3] SUSPEND ──────► Signal message to human with shortlist     │
│      (gate 1)        "Here are 7 candidate stories. Reply to    │
│                       approve or adjust."                       │
│          ↓ (resume on approval)                                 │
│  [4] RESEARCH        Rex fills gaps: external research on       │
│      & ENRICH        approved stories where internal data       │
│                       is thin. Tavily + Jina Reader.            │
│          ↓                                                      │
│  [5] DRAFT           Charlie drafts each story. Receives        │
│      GENERATION      brand voice doc in system prompt.          │
│          ↓                                                      │
│  [6] EDITORIAL       Separate editorial agent instance          │
│      REVIEW          scores each story against brand voice,     │
│      (agent-agent)   returns structured critique + revised      │
│                       draft for any story scoring < threshold   │
│          ↓                                                      │
│  [7] ASSEMBLY        Assemble newsletter: intro, stories,       │
│      & STRUCTURE     outro. Apply consistent formatting.        │
│          ↓                                                      │
│  [8] SUSPEND ──────► Signal message to human with full draft    │
│      (gate 2)        + editorial scorecard. "Ready to publish?" │
│          ↓ (resume on approval)                                 │
│  [9] PERSIST         Insert into content_items as approved      │
│      & NOTIFY        draft. Log full run to agent_activity.     │
└─────────────────────────────────────────────────────────────────┘
```

-----

## Step-by-Step Specification

### Step 1 — Ingest & Retrieve (RAG)

**What it does:** Queries internal sources across the configured `timeRange` using vector similarity search + structured filters. This is the RAG foundation — every subsequent step builds on what is retrieved here.

**Sources queried:**

|Source                      |Table           |Query method                     |Notes                                              |
|----------------------------|----------------|---------------------------------|---------------------------------------------------|
|Published & approved content|`content_items` |pgvector similarity + date filter|Status: `published`, `approved`                    |
|Draft content ideas         |`content_items` |Date filter only                 |Status: `idea`, `draft` — potential angles         |
|Interaction summaries       |`interactions`  |pgvector on `summary` column     |Captures intel from calls, meetings, Signal threads|
|Agent activity summaries    |`agent_activity`|Date filter, `status: approved`  |What has actually happened operationally           |

**Embedding strategy:**

- Embeddings are stored in a `content_embeddings` table (see schema additions below) using `openai/text-embedding-3-small`.
- Query vector is generated from a natural language prompt: `"Bitcoin treasury strategy, corporate adoption, regulatory developments, market intelligence, Australian finance context"` — the “what a good newsletter story looks like” vector.
- Top-k retrieval: `k = storyCount * 4` (retrieve 4× the desired stories to give the selection agent room to work).
- Re-rank by recency within the vector results: apply a time-decay factor so a slightly less similar but more recent item beats an older perfect match.

**Structured pre-filter before vector search:**

```sql
WHERE created_at >= NOW() - INTERVAL '{timeRange}'
  AND status NOT IN ('archived', 'cancelled')
```

**Output of this step:**

```typescript
type RetrievedContent = {
  items: Array<{
    id: string;
    source_table: 'content_items' | 'interactions';
    title?: string;
    summary: string;
    body_excerpt: string;       // first 500 chars
    similarity_score: number;
    recency_score: number;      // 0–1, higher = more recent
    composite_score: number;    // weighted combination
    created_at: string;
    tags?: string[];
  }>;
  timeRange: string;
  retrievedAt: string;
};
```

-----

### Step 2 — Story Selection (Rex Agent)

**What it does:** Rex receives the retrieved content pool and produces a ranked shortlist of candidate newsletter stories. This is an Agent step — Rex reasons about what constitutes a good story, identifies gaps, and groups related items into coherent story angles.

**Rex’s system prompt context includes:**

- Retrieved content pool from Step 1
- Target story count (`storyCount`)
- Audience context: “Australian CFOs and finance executives evaluating bitcoin treasury strategy — sophisticated, sceptical, time-poor. They want signal, not noise.”
- Brand voice summary (pulled from `brand_assets` where `type = 'tone_of_voice'`)
- Instruction to return structured JSON (see output below)

**Rex’s reasoning tasks:**

1. **Cluster** related retrieved items into story angles (several interaction summaries about regulation + a content idea = one story)
1. **Score** each candidate story on: relevance to audience, timeliness, completeness of available internal data, editorial interest
1. **Flag gaps** — stories that are relevant but thin on internal data (candidates for external research in Step 4)
1. **Produce shortlist** of `storyCount + 2` candidates (extras give the human options to swap)

**Output:**

```typescript
type StoryCandidate = {
  story_id: string;             // generated UUID for this candidate
  working_title: string;
  angle: string;                // one sentence: what this story is really about
  key_points: string[];         // 3–5 bullet points Rex thinks should be covered
  source_ids: string[];         // IDs from RetrievedContent that feed this story
  relevance_score: number;      // 0–10, Rex's assessment
  data_completeness: number;    // 0–10, how much internal data exists
  needs_research: boolean;      // true if external research would strengthen it
  research_queries?: string[];  // suggested Tavily queries if needs_research
  rex_rationale: string;        // one paragraph explaining why this story matters now
};

type StoryShortlist = {
  candidates: StoryCandidate[];     // storyCount + 2
  recommended: string[];            // story_ids Rex recommends for the newsletter
  rex_editorial_note: string;       // overall note on the batch — any themes, tensions
};
```

-----

### Step 3 — Human Gate 1: Story Selection Approval (Suspend)

**What it does:** Workflow suspends. Simon sends a Signal message to the human with the shortlist.

**Signal message format:**

```
Newsletter draft — story selection

I've found {n} candidate stories from the past {timeRange}. 
Here are my top picks — reply to approve, swap, or adjust:

✓ RECOMMENDED ({storyCount} stories):

1. {working_title}
   {angle}
   Data: {data_completeness}/10 | Research needed: {yes/no}

2. ...

ALSO AVAILABLE:
A. {working_title} — {angle}
B. {working_title} — {angle}

Reply "go" to approve, or tell me what to change.
(e.g. "swap 3 for B" or "drop story 2, add more on regulation")
```

**Resume handling:**

Simon receives the reply and interprets it:

- “go” / “looks good” / “approve” → resume with recommended list unchanged
- Instruction to swap/adjust → Rex revises the shortlist (another Agent invocation, not a full workflow re-run) before resuming

The approved story list is passed forward as `approvedStories: StoryCandidate[]`.

-----

### Step 4 — Research & Enrichment (Rex Agent)

**What it does:** For each approved story where `needs_research: true`, Rex performs external research to supplement internal data. Stories with `data_completeness >= 8` skip this step entirely.

**Research tools available to Rex:**

- **Tavily Search API** — for current news, recent developments, market data
- **Jina Reader** (`r.jina.ai/{url}`) — for fetching and parsing specific articles or regulatory documents into clean markdown

**Rex’s research behaviour:**

- Uses the `research_queries` from Step 2 as starting points, but reasons about what would actually strengthen the story (not just keyword matching)
- Retrieves up to 3 external sources per story — quality over quantity
- Stores a structured research note for each story:

```typescript
type ResearchNote = {
  story_id: string;
  sources: Array<{
    url: string;
    title: string;
    key_excerpt: string;        // 100–200 char summary of what's useful here
    retrieved_at: string;
  }>;
  research_summary: string;     // Rex's synthesis — what this adds to the story
  confidence: 'high' | 'medium' | 'low';
};
```

**Important RAG principle applied here:** External research enriches, it does not replace. Charlie’s drafting step in Step 5 is explicitly instructed to lead with internal BTS perspective and use external research as supporting evidence only. BTS has a point of view — the newsletter should express it.

-----

### Step 5 — Draft Generation (Charlie Agent)

**What it does:** Charlie drafts each approved story. This is an Agent step — Charlie produces a full draft for each story, not a template-fill.

**Charlie runs as parallel sub-steps** — one per story — to avoid sequential bottlenecks. Mastra’s parallel step execution handles this.

**Charlie’s context per story:**

- `StoryCandidate` (angle, key points, source IDs, rationale from Rex)
- Full body excerpts from source `content_items` and `interactions`
- `ResearchNote` (if research was performed)
- Brand voice document (full text from `brand_assets`)
- Target word count (`targetWordCount`)
- Audience context
- **Hard constraints in system prompt:**
  - “Bitcoin” (capital B) = network/protocol; “bitcoin” (lowercase b) = the currency. Enforce this.
  - No exclamation marks
  - No crypto-native language (no “HODL”, no “to the moon”, no “blockchain revolution”)
  - Plain, confident language — the tone of a highly competent advisor
  - Lead with insight, not background

**Charlie’s output per story:**

```typescript
type StoryDraft = {
  story_id: string;
  working_title: string;
  draft_title: string;          // Charlie's editorial title
  body: string;                 // full markdown draft
  word_count: number;
  key_message: string;          // one sentence: the single takeaway
  sources_used: string[];       // source IDs that materially shaped this draft
  charlie_note: string;         // any decisions made, flags for editor
};
```

-----

### Step 6 — Editorial Review (Agent-to-Agent)

**What it does:** A separate editorial agent instance reviews each Charlie draft against brand voice and audience fit. This is the agent-to-agent quality gate — Charlie doesn’t review its own work.

The editorial agent is a **distinct Mastra Agent** with a different system prompt focus. It is not Charlie. It is not Rex. Think of it as the copy editor who has never written for BTS before but has read everything BTS has ever published.

**Editorial agent context:**

- The full brand voice document
- Audience definition
- Charlie’s draft + `charlie_note`
- A structured scoring rubric (below)

**Scoring rubric (0–10 per dimension):**

|Dimension               |What it checks                                         |
|------------------------|-------------------------------------------------------|
|Voice match             |Does it sound like BTS — plain, confident, no hype?    |
|Audience fit            |Would a sceptical CFO find this relevant and credible? |
|Bitcoin/bitcoin accuracy|Is the capitalisation convention followed throughout?  |
|Clarity                 |Is the key message immediately clear?                  |
|Evidence quality        |Are claims supported by internal data or cited sources?|
|Length discipline       |Is it within 20% of target word count?                 |

**Threshold:** Any story scoring below 7 on Voice match or Audience fit is returned to Charlie for revision with specific critique. Other dimensions below 7 generate a warning flag but do not block.

**Editorial agent output:**

```typescript
type EditorialReview = {
  story_id: string;
  scores: Record<string, number>;
  overall_score: number;
  passes_gate: boolean;         // true if voice + audience both >= 7
  critique: string;             // specific, actionable feedback
  revised_draft?: string;       // editor's own revision if passes_gate is false
  editor_note: string;          // summary for the human
};
```

**Revision loop:** If `passes_gate: false`, the editorial agent produces a `revised_draft` directly (rather than sending back to Charlie for a second pass). This keeps the loop count bounded — maximum one revision cycle per story. If the revised draft still doesn’t pass, it is flagged for human attention at Gate 2 but not blocked.

-----

### Step 7 — Assembly & Structure

**What it does:** Assembles the individual story drafts into a complete newsletter. This is a deterministic step — no agent reasoning required. It applies a consistent structural template.

**Newsletter structure:**

```markdown
# {newsletter_title}
*{formatted_date} | Bitcoin Treasury Solutions*

---

## From the team

{intro_paragraph}        ← Charlie generates this in Step 5 as a final task
                           (brief, 60–80 words, sets the editorial tone for the issue)

---

## {story_1_title}

{story_1_body}

---

## {story_2_title}

{story_2_body}

---
[... repeat for each story ...]

---

## That's it for this issue

{outro_paragraph}        ← Charlie generates this too — brief sign-off

*Bitcoin Treasury Solutions helps Australian corporates navigate bitcoin treasury strategy.*
*ABN {{bts_abn}} | {{public_website}}*

---
```

**Formatting rules applied at assembly:**

- All `{{variable_key}}` placeholders resolved from `company_profile`
- Story order: Rex’s recommendation order from Step 2, unless human adjusted at Gate 1
- Word counts verified — if any story is >30% over target, it is flagged in the Gate 2 summary

-----

### Step 8 — Human Gate 2: Final Draft Approval (Suspend)

**What it does:** Workflow suspends. Simon sends the full draft + editorial scorecard to the human.

**Signal message format:**

```
Newsletter ready for review

{storyCount} stories | ~{total_word_count} words | {timeRange} edition

Editorial scorecard:
Story 1 "{title}" — {overall_score}/10 {⚠️ if flagged}
Story 2 "{title}" — {overall_score}/10
...

Full draft attached. Reply:
• "publish" to approve and save as draft in content pipeline
• "revise [story number]: [instruction]" to request a change
• "hold" to pause without discarding
```

**Attach the full newsletter markdown** as a Signal document attachment (via the Signal CLI REST API file send endpoint).

**Resume handling:**

- “publish” / “approve” → proceed to Step 9
- “revise X: [instruction]” → targeted revision: re-invoke Charlie for that story only, then re-run editorial review for that story, then re-suspend at Gate 2 with updated draft
- “hold” → mark workflow as `suspended_hold` in `agent_activity`, stop. Human can resume later by messaging Simon.

-----

### Step 9 — Persist & Notify

**What it does:** Saves the approved newsletter to `content_items`, logs the full run, and sends a confirmation.

**`content_items` insert:**

```typescript
{
  title: newsletter_title,
  body: assembled_newsletter_markdown,
  type: 'newsletter',
  status: 'approved',           // ready for scheduled send — human already approved
  topic_tags: ['newsletter', timeRange, ...derived_tags],
  source: 'content_agent',
  assigned_to: requesting_team_member_id,
  created_by: null,             // agent-generated
}
```

**`agent_activity` log:**

```typescript
{
  agent_name: 'charlie',
  action: 'newsletter_generated',
  status: 'approved',
  trigger_type: triggerSource === 'schedule' ? 'scheduled' : 'signal_message',
  workflow_run_id: context.runId,
  proposed_actions: [{ type: 'newsletter', story_ids: approvedStories.map(s => s.story_id) }],
  approved_actions: [{ content_item_id: insertedId }],
  approved_by: approving_team_member_id,
  approved_at: new Date().toISOString(),
}
```

**Confirmation Signal message:**

```
Newsletter saved to content pipeline.

"{newsletter_title}" — {storyCount} stories, {total_word_count} words
Status: Approved draft — ready to schedule

View or schedule it in the platform: {hq_url}/content/{content_item_id}
```

-----

## Schema Additions

The following tables and columns extend `schema.sql` to support this workflow.

### `content_embeddings`

Stores embeddings for RAG retrieval across content and interactions.

```sql
CREATE TABLE content_embeddings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table    TEXT NOT NULL CHECK (source_table IN ('content_items', 'interactions')),
  source_id       UUID NOT NULL,
  chunk_index     INT NOT NULL DEFAULT 0,   -- for chunked long documents
  chunk_text      TEXT NOT NULL,
  embedding       vector(1536),             -- openai text-embedding-3-small
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_content_embeddings_source ON content_embeddings(source_table, source_id);
CREATE INDEX idx_content_embeddings_vector ON content_embeddings
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

**Embedding generation trigger:** Embeddings are generated when:

- A `content_items` row transitions to `status = 'published'` or `'approved'`
- An `interactions` row is inserted with a non-null `summary`

This is handled by a Mastra tool (not a DB trigger) to keep embedding logic in the application layer.

### `newsletter_runs`

Tracks each workflow execution for reporting and debugging.

```sql
CREATE TABLE newsletter_runs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_run_id     TEXT UNIQUE NOT NULL,
  trigger_source      TEXT NOT NULL CHECK (trigger_source IN ('signal', 'schedule')),
  time_range          TEXT NOT NULL,
  story_count_target  INT NOT NULL,
  word_count_target   INT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'running'
                      CHECK (status IN ('running', 'suspended_gate1', 'suspended_gate2',
                                        'suspended_hold', 'completed', 'failed', 'cancelled')),
  approved_story_ids  TEXT[],
  content_item_id     UUID REFERENCES content_items(id),
  requested_by        UUID REFERENCES team_members(id),
  started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at        TIMESTAMPTZ,
  total_word_count    INT,
  editorial_scores    JSONB DEFAULT '{}',   -- per-story scores from editorial review
  notes               TEXT
);

ALTER TABLE newsletter_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "newsletter_runs_all" ON newsletter_runs
  FOR ALL USING (auth.role() = 'authenticated');
```

-----

## Mastra Implementation Notes

### Workflow skeleton

```typescript
// apps/agent/src/workflows/newsletter.ts

import { createWorkflow, createStep } from '@mastra/core/workflows';

// ⚠️ Verify exact API signatures against:
// node_modules/@mastra/core/dist/docs/references/workflows/

export const newsletterWorkflow = createWorkflow({
  name: 'newsletterWorkflow',
  // ... verify inputSchema, steps, and suspend/resume API from embedded docs
});
```

> **Before writing any implementation code:** Read `node_modules/@mastra/core/dist/docs/` for current Workflow, Agent, and suspend/resume API signatures. The patterns described here reflect design intent — the exact Mastra API call shapes must be verified against the installed version.

### Agent instances

Three distinct agents are used — all must be defined separately to preserve clean system prompt boundaries:

```
apps/agent/src/agents/
├── rex.ts          ← research + story selection system prompt
├── charlie.ts      ← content drafting system prompt  
└── editorial.ts    ← brand voice enforcement system prompt (new)
```

The `editorial` agent is new. It should not share a system prompt with Charlie — conflating “write this” with “judge this” produces worse output.

### Parallel story drafting

Step 5 (Charlie drafting) runs stories in parallel using Mastra’s parallel step execution. Verify current parallel step API in embedded docs — do not assume the API shape from memory.

### Suspend/resume pattern

Both Gate 1 and Gate 2 use Mastra’s suspend/resume mechanism. The `workflow_run_id` from `mastra.getRunId()` (verify actual method name) must be stored in `newsletter_runs` at the point of suspension so Simon can resume the correct run when the human replies.

Simon’s Signal message handler must:

1. Detect that an incoming reply is a newsletter gate response (by checking `newsletter_runs` for a `suspended_gate1` or `suspended_gate2` run for that team member)
1. Parse the intent (approve / revise / hold)
1. Call the appropriate resume method with the parsed intent as input

-----

## Shared Patterns with Contracts & Compliance

This workflow reuses two patterns already established in the platform:

**`{{variable_key}}` substitution** — The newsletter assembly step uses the same placeholder syntax and resolution logic as compliance documents and contracts. The shared `packages/templates` utility (if extracted) handles this for all three features.

**`agent_activity` logging** — Newsletter runs follow the same proposed/approved/rejected logging convention as all other agent actions. `workflow_run_id` ties the run to the activity log row.

-----

## UI Integration

### Content Pipeline page

The `/content` page gains a **“Run newsletter”** button that opens a parameter modal:

- Time range: `week / fortnight / month` (segmented control)
- Story count: `3 / 4 / 5 / 6 / 7 / 8` (stepper or segmented)
- Word count per story: `150 / 200 / 250 / 300 / 400` (options)
- Optional audience override: text input (placeholder: “leave blank for default CFO audience”)

On submit, calls the Next.js API route which triggers the Mastra workflow and returns the `workflow_run_id`.

### Newsletter run status

A status indicator on the content pipeline page shows in-progress newsletter runs:

```
Newsletter in progress — Story selection sent for review
[View shortlist]
```

Clicking “View shortlist” opens a side panel with the Gate 1 candidates. This is a secondary interaction path — Signal is primary.

-----

## Open Questions

- **Chunking strategy for long interactions:** Call transcripts in `interactions.raw_content` can be several thousand words. Chunking at 512 tokens with 64-token overlap is the safe default — but should `summary` (agent-generated) be embedded instead of the raw content? Recommendation: embed the summary for retrieval, but pass the raw content to Charlie if that story is selected.
- **Newsletter frequency detection:** The scheduled trigger fires weekly but the default timeRange is monthly. Should the workflow detect whether a newsletter was already run this month before executing on schedule? A simple check against `newsletter_runs` (completed runs in current calendar month) would prevent duplicates.
- **Tone variation over time:** Charlie may produce subtly similar-feeling newsletters if the brand voice doc doesn’t evolve. A future enhancement could have the editorial agent flag “this reads like the last three issues” — but defer until there are enough issues to compare.
- **Multi-audience variants:** BTS may eventually want a retail-focused edition and a wholesale/institutional edition. The `audienceContext` parameter is already designed to support this — it would just require a second workflow execution with a different context string.
- **External research rate limits:** Tavily free tier caps will eventually be hit if research runs across 4+ stories per newsletter. Monitor usage via the Tavily dashboard; Parallel.ai is the identified upgrade path when limits become a constraint.