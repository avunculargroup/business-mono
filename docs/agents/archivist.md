# The Archivist — Knowledge Manager

**Mastra type**: Agent
**Model**: `anthropic/claude-sonnet-4-5`

## Purpose

Stores, categorises, and connects knowledge using a hybrid vector + graph approach. Handles both internally-produced content and external research. Builds a semantic knowledge base queryable by all other agents (read-only). The company's institutional memory with opinions — and the ability to trace why it holds them.

## Triggers

- URL shared via Signal or web interface ("save this article")
- YouTube video link shared ("archive this talk")
- Content item moved to 'published' status (archive own content)
- Simon dispatches research request
- Scheduled: periodic content discovery based on topics of interest

## Capabilities

1. **URL processing**: Fetch content, extract text, summarise, assign topic tags, determine stance (aligned/neutral/opposed), store with source attribution.
2. **YouTube processing**: Fetch transcript (YouTube API or Deepgram), summarise, extract key arguments, tag topics, store with video metadata.
3. **Connection mapping** `[Agent]`: For each new item, query existing items via vector similarity AND graph traversal. Identify relationships (supports, contradicts, extends, updates, cites, related_to). Create `knowledge_connections` edges with relationship type, reasoning, confidence.
4. **Embedding generation**: Generate vector embeddings via OpenAI `text-embedding-3-small` (1536 dims). Store in `knowledge_items.embedding` with HNSW index.
5. **Hybrid search**: Combine three strategies based on query type:
   - **pgvector**: Semantic similarity ("find everything related to treasury regulation")
   - **Recursive CTEs**: Graph traversal ("what contradicts our position?", "trace sources for this proposal")
   - **Postgres FTS**: Structured lookup ("articles by Michael Saylor this year")
6. **Stance tracking**: Tag content alignment with company position. Critical for content creation.
7. **Content idea generation**: Review recent items + graph connections, suggest content ideas → route to Content Creator.

## Graph Query Examples

```sql
-- 2-hop: find contradictions and their supporting evidence
WITH RECURSIVE chain AS (
  SELECT ki.id, ki.title, kc.relationship, 1 as depth
  FROM knowledge_items ki
  JOIN knowledge_connections kc ON kc.target_item_id = ki.id
  WHERE kc.source_item_id = :our_position_id
    AND kc.relationship = 'contradicts'
  UNION ALL
  SELECT ki2.id, ki2.title, kc2.relationship, c.depth + 1
  FROM chain c
  JOIN knowledge_connections kc2 ON kc2.target_item_id = c.id
  JOIN knowledge_items ki2 ON ki2.id = kc2.source_item_id
  WHERE kc2.relationship = 'supports'
    AND c.depth < 3
)
SELECT * FROM chain;
```

## Tools

- `web_fetch` — fetch and extract content from URLs
- `youtube_transcript` — fetch transcript from YouTube
- `generate_embedding` — generate embedding via OpenAI text-embedding-3-small
- `vector_search` — query knowledge_items by vector similarity
- `graph_traverse` — recursive CTE traversal on knowledge_connections
- `fulltext_search` — Postgres FTS on knowledge_items
- `supabase_query` — read any table
- `supabase_insert` — create knowledge_items, knowledge_connections
- `notify_simon` — send results back to Simon
- `log_activity` — write to agent_activity

## Schema: knowledge_items

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| title | TEXT NOT NULL | Article/video title |
| source_url | TEXT | Original URL |
| source_type | TEXT CHECK | article, youtube, report, podcast, tweet, internal, other |
| source_author | TEXT | Author or organisation |
| source_date | DATE | Publication date |
| raw_content | TEXT | Full extracted text/transcript |
| summary | TEXT | Agent-generated summary |
| key_arguments | JSONB | Array of extracted arguments |
| topic_tags | TEXT[] | Normalised topic tags |
| stance | TEXT CHECK | aligned, neutral, opposed, mixed |
| stance_reasoning | TEXT | Why the agent classified this stance |
| bitcoin_relevance | TEXT CHECK | direct, indirect, tangential |
| embedding | VECTOR(1536) | HNSW indexed |
| fts | TSVECTOR GENERATED | Auto-generated from raw_content |
| archived_by | UUID FK → team_members | |
| created_at / updated_at | TIMESTAMPTZ | |

## Schema: knowledge_connections

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| source_item_id | UUID FK → knowledge_items | |
| target_item_id | UUID FK → knowledge_items | |
| relationship | TEXT CHECK | supports, contradicts, extends, updates, cites, related_to |
| reasoning | TEXT | Agent's explanation |
| confidence | FLOAT | 0.0–1.0 |
| created_by_agent | TEXT | |
| created_at | TIMESTAMPTZ | |

This is a standard adjacency list — graph-ready for pgRouting (Dijkstra/BFS using confidence as cost) and future SQL/PGQ (declare as VERTEX/EDGE tables with zero migration).

## Schema Dependencies

**Reads**: `knowledge_items`, `knowledge_connections`, `content_items`, `brand_assets`
**Writes**: `knowledge_items`, `knowledge_connections`, `content_items` (ideas), `agent_activity`
