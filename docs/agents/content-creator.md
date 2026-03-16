# Content Creator — Draft & Iterate

**Mastra type**: Agent
**Model**: `anthropic/claude-sonnet-4-5`

## Purpose

Transforms ideas and research into polished content drafts. Works the `content_items` pipeline from 'idea' through 'draft' and 'review'. Directors provide creative direction and make all publishing decisions — the agent proposes, they dispose.

Initial focus: email communications and newsletter drafts. Social media (LinkedIn, Twitter/X) added in Phase 4.

## Triggers

- Archivist creates `content_items` record with status 'idea'
- Director instructs Simon: "Write a LinkedIn post about EU MiCA regulation"
- Director provides feedback on draft: "make it shorter" / "add a stat" / "love it, schedule it"
- Content item moved to 'review' status → notify director
- Scheduled: weekly content calendar review

## Capabilities

1. **Idea enrichment**: Take raw idea, flesh out angle, audience, key message, format. Query Archivist for supporting research.
2. **First draft generation**: Produce complete draft in appropriate format/tone. Consult `brand_assets` for tone of voice and style guides. Tailor to audience's bitcoin literacy level.
3. **Iterative refinement**: Accept director feedback via Simon as natural language. Produce revised drafts, tracking versions in `agent_activity`.
4. **Research integration**: Query Archivist's knowledge base for data, stats, references. Use graph queries for evidence chains.
5. **Brand consistency**: Every draft checked against active `tone_of_voice` and `style_guide` in `brand_assets`. Flag deviations.
6. **Multi-format adaptation** (Phase 4): Blog → LinkedIn summary, newsletter → tweet thread. Each adaptation is a separate `content_items` record.
7. **Publishing preparation**: On director approval, move to 'approved'/'scheduled', set `scheduled_for` timestamp.

## Iteration Loop (Mastra suspend/resume)

1. Receive idea + creative direction from Simon
2. Query Archivist for research context
3. Load brand guidelines from `brand_assets`
4. Produce first draft → save to `content_items` (status: 'draft')
5. Notify Simon → Simon presents to director(s)
6. Director provides feedback via Signal
7. **Workflow resumes** → Content Creator revises draft
8. Repeat 5–7 until director says "approved" / "schedule it" / "publish"
9. Move to 'approved' or 'scheduled' status

## Tools

- `supabase_query` — read content_items, brand_assets, contacts
- `supabase_insert` — create content_items drafts
- `supabase_update` — update content_items body/status
- `brand_lookup` — fetch active tone/style guides from brand_assets
- `vector_search` — query Archivist knowledge base (read-only, direct)
- `graph_traverse` — traverse knowledge connections (read-only, direct)
- `notify_simon` — send drafts/status to Simon
- `log_activity` — write to agent_activity

## Schema Dependencies

**Reads**: `content_items`, `brand_assets`, `knowledge_items`, `contacts`
**Writes**: `content_items`, `agent_activity`

## Approval Gates

| Action | Level | Notes |
|--------|-------|-------|
| Generate first draft | Auto | Directors review the output |
| Revise based on feedback | Auto | Director initiated the loop |
| Move to 'approved' | Always human | Director explicitly approves |
| Move to 'scheduled' | Always human | Director confirms timing |
| Publish to external platform | Always human | Public-facing content |
| Generate content idea | Auto | Ideas are cheap |
| Query Archivist | Auto | Read-only |

## Failure Modes

- **Off-brand tone**: Validate against brand_assets. If no tone guide exists, flag and ask directors.
- **Stale research**: Check `source_date` on cited knowledge items. Flag anything >6 months old.
- **Infinite iteration**: After 5 rounds, flag: "We've been through 5 revisions. Approve as-is, start fresh, or shelve?"
- **Conflicting feedback**: If both directors provide contradictory feedback, present both and ask them to align.
