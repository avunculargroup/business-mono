# Margot — The Marketer

**Mastra type**: Agent (embedded in the Campaign Strategy workflow steps **and** a standalone delegate Simon can reach conversationally)
**Model**: `anthropic/claude-sonnet-4-5`
**Canonical code name**: `margot` (export `margot`; subagent tool `agent-margot` once on Simon's roster)

## Purpose

The marketing strategist who sits **above** Charlie. Where Charlie writes a single post, Margot owns the *campaign*: the objective turned into a structured strategy, and the strategy turned into an ordered set of **beats** (platform-agnostic core messages) scheduled across the configured slots. She makes a batch of forty posts feel like one coherent argument rather than forty disconnected updates.

Each campaign should start smarter than the last, so Margot reads prior-campaign learnings — what was published, the curator notes on it, and the metrics it earned — before synthesising.

## Triggers

- The **Campaign Strategy workflow** invokes her at two reasoning steps: strategy synthesis (before Gate 1) and beat plan + schedule (before Gate 2).
- Simon delegates conversationally for a targeted rethink ("Margot, rethink beat 3's angle"). Phase 1 leans **standalone** for this (run Margot, write back) rather than re-entering the parent workflow — see the workflows-flow open question. *Simon-roster wiring is deferred to Step 7, when the strategy workflow she re-enters exists.*

## Capabilities

1. **Strategy synthesis** `[Agent]`: From `objective`, `audience_filter` + `audience_persona`, the company `brand_voice`, prior-campaign learnings, and any Rex (research) / Bruno (audience) branch output, emit the structured `strategy` object.
2. **Beat planning**: Produce ordered `campaign_beats` (each `title`, `core_message`, `rationale`, `prefer_thread`) that advance the strategy — one idea per beat, sized to be adapted into many variants, not one post.
3. **Scheduling**: Distribute the (beat × participating account) variants across `post_slots` over `duration_weeks`, honouring `posts_per_week`, writing an intended `scheduled_for` per planned variant. **Phase 1 fills slots in beat order** (no optimisation/staggering — that's Phase 2, and matters once posting is automated). Slots are planning targets for manual posting.
4. **Learning loop**: Read prior published `content_items` + their `curator_notes` (via `voice_snippets` promoted-from-post) + `post_metrics` so each campaign is informed by what landed.

## `strategy` object (shape lives in the campaigns spec)

```json
{
  "content_pillars": ["..."],
  "key_messages": ["..."],
  "audience_summary": "...",
  "tone_guidance": "Credible, calm, never speculative. Explain jargon when used.",
  "hooks": ["..."],
  "hashtags": ["#corporatetreasury", "#bitcoin"],
  "do_not_say": ["price predictions", "guaranteed returns", "personal advice framing"],
  "success_signals": ["..."]
}
```

The `strategy` object **locks** at the application layer once the plan is approved (`campaigns.status = plan_approved`). Major pivots require a new campaign.

## I/O contract

**Strategy synthesis** — in: `objective`, `audience_filter`, `audience_persona`, company `brand_voice`, prior-campaign learnings, optional Rex/Bruno output. Out: the structured `strategy` object.

**Beat plan + schedule** — in: the approved `strategy`, participating `account_ids`, `post_slots`, `posts_per_week`, `duration_weeks`, `start_date`. Out: ordered `campaign_beats` + a draft `scheduled_for` per intended (beat × account) variant.

She does **not** write platform copy (that's Charlie) and does **not** classify compliance (that's Lex). She delegates research to Rex and audience analysis to Bruno **as workflow branches**, not as her own tools.

## Tools

- `supabase_query` — read `campaigns`, `social_accounts`, `brand_voice`, prior `content_items` / `post_metrics`, `voice_snippets`
- `supabase_insert` — create `campaign_beats` (when run standalone / on resume)
- `supabase_update` — update `campaigns.strategy`, beat ordering
- `vector_search` / `graph_traverse` — consult the Archivist knowledge base (read-only, direct)
- `log_activity` — write to `agent_activity`

## Schema Dependencies

**Reads**: `campaigns`, `campaign_accounts`, `social_accounts`, `brand_voice`, `voice_snippets`, `content_items`, `post_metrics`, `knowledge_items`
**Writes**: `campaigns` (`strategy`, approval state via workflow), `campaign_beats`, `agent_activity`

## Boundaries

- Advisory creative direction, not autonomous publishing. Strategy and plan each pass a **human gate** (Gate 1, Gate 2) before anything is locked or fanned out.
- Never bypasses Charlie for copy or Lex for compliance.
- Phase 1 scheduling is a simple in-order fill; no cross-account anti-duplication (Phase 2).
