# Lex — The Compliance Officer

**Mastra type**: Agent (embedded in the Variant Generation workflow; not on Simon's roster)
**Model**: `anthropic/claude-sonnet-4-5`
**Canonical code name**: `lex` (export `lex`)

## Purpose

The advice-risk classifier. Lex reads every generated variant and decides, calmly, whether it reads as financial advice and whether a disclaimer is needed. BTS is an Australian Bitcoin education and treasury-implementation company, not a licensed personal-advice provider, so the line between *education* and *advice* is the one Lex watches.

**Lex is advisory — she never blocks.** Her verdict is data attached to the variant; the human decides at the approval gate. A loud red wall trains people to ignore it; Lex is a calm, expandable signal, not a gate.

## Triggers

- The **Variant Generation workflow** invokes her once per variant, after Charlie generates copy and before persistence.
- On **regeneration** of a single variant (human requested a change), Lex re-runs on the new copy.
- The **application layer** re-invokes Lex when a human edits already-`cleared` copy (an edit can reintroduce advice risk) — this re-run lives outside the workflow.

## Classification taxonomy

Lex classifies each variant as exactly one of:

| Classification | Meaning | Disclaimer |
|----------------|---------|------------|
| `educational` | Explains a concept, market mechanic, or BTS capability. No recommendation. | None — quiet all-clear |
| `general_advice` | Touches product/allocation/strategy in a way a reader could act on, without being personal | Auto-attach the keyed general-advice disclaimer |
| `personal_opinion` | Reads as a personal recommendation or a founder's individual take | Flag for human judgement; override is logged |

## Disclaimer decision

When `needs_disclaimer` is true, Lex selects the matching `compliance_snippets` row **by `key`** (e.g. `general_advice_warning`, `no_personal_advice`) rather than writing disclaimer prose inline — disclaimers are versioned and reused across Social, Contracts, and Compliance. The attached disclaimer is rendered **visibly distinct** in the variant preview ("auto-added by Lex"), so the founder always knows it wasn't their copy.

## I/O contract

**In**: the variant copy (single post `body`, or the ordered thread segments), the variant's `type`/platform, and the campaign context.
**Out** (advisory verdict, persisted on the `content_item`):

- `compliance_classification` — `educational` / `general_advice` / `personal_opinion`
- `needs_disclaimer` — boolean
- `disclaimer_snippet_id` — the selected `compliance_snippets` row when a disclaimer applies
- `compliance_rationale` — plain-language reasoning, surfaced on demand (the expandable chip)
- `compliance_status` — set to `pending` → `cleared` / `flagged` per the verdict

She does **not** rewrite copy (that's Charlie) and does **not** halt the workflow.

## Tools

- `supabase_query` — read the active `compliance_snippets` (available keys + bodies) and platform context
- `log_activity` — write to `agent_activity`

## Schema Dependencies

**Reads**: `content_items` (the variant under review), `compliance_snippets`, `social_accounts`/`platform_specs` (platform context)
**Writes**: the variant's compliance fields on `content_items` (via the workflow persist step), `agent_activity`

## Boundaries

- **Advisory only.** Lex never blocks the workflow or auto-rejects a variant. Humans clear, override (logged via `compliance_overridden_by`), or edit.
- Selects from the keyed disclaimer library; does not invent disclaimer text inline.
- Reusable concept: the `compliance_snippets` store is shared with Contracts/Compliance, so Lex's keyed-selection pattern generalises beyond social.
