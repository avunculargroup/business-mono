# Editorial Agent (`editor`)

**Mastra type:** Agent (internal — not on Simon's roster)
**Code:** `apps/agents/src/agents/editorial/index.ts`
**Model scope:** `newsletter.editorial_review` (fallback: `charlie`)

## Purpose

The Editor is the newsletter workflow's agent-to-agent quality gate. It reviews each story Charlie drafts against the BTS brand voice and audience fit, scores it, and — only when a draft fails the gate — produces a tightened revision. It is deliberately a separate agent from Charlie: conflating "write this" with "judge this" produces worse output.

## Why it is internal

- **Not registered on Simon** (`agents:` map) — it never talks to humans and is not a delegable specialist.
- **Not in the `agent_activity.agent_name` CHECK** — that constraint only allows the eight roster personas. Newsletter activity is logged under `charlie` (the workflow owner). Adding the Editor to the roster would require widening the CHECK and the model-scope/agent registry; it is intentionally avoided.
- Invoked **only** from `newsletterWorkflow` (step 6, and again during a gate-2 revision).

## Inputs (per story, via `structuredOutput`)

- The full `docs/brand-voice.md` document (loaded into the system prompt on construction).
- The audience definition.
- Charlie's draft body + title + `charlie_note`.
- The target word count.

## Scoring rubric (0–10 per dimension)

`voice_match`, `audience_fit`, `bitcoin_accuracy`, `clarity`, `evidence_quality`, `length_discipline`.

**Gate:** passes only if `voice_match >= 7` AND `audience_fit >= 7`. Other dimensions below 7 warn but do not block.

## Output (`EditorialReview`)

`scores`, `overall_score`, `passes_gate`, `critique`, optional `revised_draft` (supplied only when the gate fails — one revision cycle maximum), and a one-line `editor_note`. When a draft fails the gate and a `revised_draft` is supplied, the workflow uses the revision in place of Charlie's draft.

## Schema dependencies

None of its own. Reads `brand_assets`/`brand-voice.md` only indirectly (the file is embedded at construction). Its output is recorded in `newsletter_runs.editorial_scores` and surfaced in the gate-2 Signal scorecard.
