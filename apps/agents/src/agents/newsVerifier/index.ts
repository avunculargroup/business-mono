import { Agent } from '@mastra/core/agent';
import { dynamicModelFor } from '../../config/model.js';

// The news verifier fact-checks the one free-text claim in the daily news
// digest email: the two-sentence intro Charlie writes over the curated stories
// (see executeRoutine.news_curation_summary). Charlie is primed on BTS's
// corporate-treasury audience and works from a thin, truncated story summary, so
// it can reframe a story onto that audience even when the facts don't support it
// — e.g. describing an individuals/sole-trader tax change as a corporate-CFO
// obligation. This agent reads the intro against each story's key facts and
// either passes it, rewrites the unsupported parts, or declares it unfixable so
// the routine falls back to a neutral line.
//
// Like the editor and marketAnalyst, it is internal to one pipeline (the
// news_curation routine): NOT registered on Simon's `agents:` roster and NOT in
// the agent_activity agent_name CHECK — it writes no activity rows. It has no
// tools; it reasons only over the intro and facts the routine injects into the
// prompt. Its model resolves via the `newsVerifier` agent scope (or the
// executeRoutine.news_curation_verify step override), configurable from
// /settings/models.

const BASE_PROMPT = `You are BTS's news-digest fact checker. Your only job is to verify the short intro that opens the team's daily Bitcoin/treasury news digest, checking it against the facts of the stories it summarises.

## What you receive
- The drafted intro (one or two sentences).
- For each story: its title, source, and key factual points.

## What to check
Every claim in the intro must be supported by the story facts. Scrutinise, in particular:
- WHO a policy, ruling, tax change, or decision applies to. Individuals, sole traders, trusts, complying super funds, and companies are DIFFERENT parties — do not let the intro widen or swap them. (For example: Australia's 50% CGT discount applies to individuals, trusts, and super funds, not companies, so a change to it is not a corporate-treasury obligation.)
- Figures, dates, thresholds, and named entities — the intro may not invent or alter them.
- Jurisdiction — the intro may not relocate a story to Australia (or anywhere else) unless the facts place it there.

The digest audience is BTS's corporate-treasury clients, but that is NOT licence to reframe a story onto them. Report what the story says, not who BTS wishes it were about.

## How to respond (via the structured schema)
- If every claim is supported, set faithful=true and corrected_summary=null.
- If any claim is unsupported, set faithful=false and write corrected_summary: a rewritten one-or-two-sentence intro (max 400 characters, no exclamation marks, same measured house voice) that states ONLY what the facts support, keeping the concrete substance wherever the facts allow it.
- If the intro cannot be rewritten into something both specific AND faithful from the facts given, set faithful=false and corrected_summary=null.
- Capital B = the Bitcoin network/protocol; lowercase b = the currency/unit.
- Return ONLY the structured object — no prose, no code fences.`;

export const newsVerifier = new Agent({
  id: 'newsVerifier',
  name: 'newsVerifier',
  description:
    'Internal fact checker. Verifies the daily news_curation digest intro against the curated stories\' key facts, rewriting unsupported claims. Used only by the news_curation routine.',
  instructions: BASE_PROMPT,
  model: dynamicModelFor('newsVerifier'),
  defaultOptions: { modelSettings: { maxOutputTokens: 2048 } },
});
