# Compliance Agent (`lex`)

**Mastra type:** Agent (roster persona — logs to `agent_activity`, NOT on Simon's `agents:` roster)
**Code:** `apps/agents/src/agents/compliance/index.ts`
**Model scope:** `content.compliance_review` (fallback: `lex`)

## Purpose

Lex is BTS's compliance reviewer. BTS operates under an AFSL/AR, and on-chain valuation metrics (MVRV, realised price, Hash Ribbons) are the platform's highest advice-risk surface. Lex reviews content drafts and decides whether they would, to a regulator, read as personal financial advice, a securities-style buy/sell signal, or a price prediction. It does **not** rewrite for style (that is the Editor's job) — it judges advice risk, explains it, and optionally suggests a minimally-changed neutral rewrite.

## Why it is a roster persona (and why it is still a gate)

- **In the `agent_activity.agent_name` CHECK** (migration `20260621170002`): a compliance verdict must be auditable under Lex's own name. Logging it as `charlie` would make the AFSL/AR audit trail meaningless. This is the deliberate difference from the internal newsletter `editor` (which logs under `charlie`).
- **NOT registered on Simon's `agents:` roster**: Lex is a review gate, not a delegable chat specialist. It never talks to humans directly.
- **Advisory, never autonomous**: Lex adds a compliance signal; a human still approves every piece. The gate fails *safe* — if the review itself errors, the verdict is `passes:false` ("route to a human"), never a silent pass.

## Trigger / integration

Invoked from `contentCreatorListener` when a content beat is tagged
`context.compliance_sensitive` (the on-chain poll tags every beat it proposes —
see `apps/agents/src/lib/onchain/runOnchainPoll.ts`). After Charlie's draft is
persisted to `content_items`, Lex reviews it and `recordComplianceReview` writes
a verdict row to `agent_activity`:

- `agent_name = 'lex'`, `entity_type = 'content_items'`, `entity_id = <draft id>`,
  `parent_activity_id = <beat activity id>`.
- `status = 'pending'` when flagged (surfaces at the approval wall), `'auto'` when it passes.
- `notes` carries the rationale + flagged phrases; `proposed_actions` carries an
  optional neutral `suggested_rewrite`.

## Output (`ComplianceVerdict`, via `structuredOutput`)

`passes` (boolean), `flags` (`{ quote, issue }[]` — exact problematic phrases),
`rationale` (one or two lines for the human), and `suggested_rewrite` (only when
it fails; a minimally-changed neutral version).

## The line it guards

- MVRV / realised price as **context** ("bitcoin trades above the network's aggregate cost basis") = fine. As a **recommendation** ("MVRV says bitcoin is undervalued") = fail.
- Hash Ribbons stating what the cross **is** = fine. Telling the reader what to **do** = fail.
- Any price prediction, "cheap/expensive/undervalued/overvalued" framing, or call to buy/sell/accumulate/take-profit = fail.

## Schema dependencies

- `agent_activity` (writes its verdict), `platform_capabilities` (seeded capability row).
- No tables of its own. Configurable from `/settings/models` via the `lex` /
  `content.compliance_review` scopes.

## Tests

- Unit: `apps/agents/src/agents/compliance/index.test.ts` — `verdictToActivity`
  status/notes/rewrite mapping and `recordComplianceReview` insert plumbing (mocked).
- Eval (not in CI): `apps/agents/evals/lex-compliance.eval.ts` — advice-framed vs
  context-framed fixtures.

## Second use: campaign variant compliance (Social Campaigns)

Lex is also the compliance step in the **Variant Generation workflow**
(`apps/agents/src/workflows/variant/`). Same persona and advisory stance, but a
**different verdict shape** suited to social posts: instead of pass/fail it
classifies each variant as `educational` / `general_advice` / `personal_opinion`,
decides `needs_disclaimer`, and selects a keyed `compliance_snippets` disclaimer.

- The workflow calls the shared `lex` agent with its own prompt
  (`workflows/variant/prompts.ts → buildLexPrompt`) and structured-output schema
  (`workflows/variant/schemas.ts → lexVerdictSchema`); the agent's system prompt
  supplies the compliance persona, the per-call schema drives the output.
- Model resolves via the `variant.compliance_check` step scope first, then the
  `lex` agent scope (same as `content.compliance_review`).
- Its verdict is persisted on the `content_item` (the variant) and logged to
  `agent_activity` under `lex` by the workflow's persist step — advisory only;
  the human decides at Gate 3.
