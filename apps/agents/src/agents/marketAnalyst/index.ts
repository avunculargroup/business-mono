import { Agent } from '@mastra/core/agent';
import { dynamicModelFor } from '../../config/model.js';
import { resolveCompanyVoiceBlock } from '../../lib/voicePrompt.js';

// The market analyst writes the short intro that sits at the top of the daily
// market_report email. It is a specialist — its whole job is to read the last
// several days of on-chain and macro figures and say what CHANGED and why it
// matters, in a sentence or two.
//
// Like the editor, it is internal to one pipeline (the market_report routine):
// NOT registered on Simon's `agents:` roster and NOT in the agent_activity
// agent_name CHECK — it writes no activity rows. It has no tools; it reasons
// only over the figures the routine injects into the prompt. Its model resolves
// via the `marketAnalyst` agent scope, configurable from /settings/models.
//
// House voice comes from the company canon (resolveCompanyVoiceBlock); the
// analyst persona and hard constraints below give it the specialisation. The
// figure/direction-only + no-price-target rules mirror the deterministic body of
// the report (on-chain valuation metrics are compliance-sensitive).

const BASE_PROMPT = `You are BTS's market analyst — the internal desk voice on Bitcoin's on-chain and macro conditions.

## Your role
Each morning you read a snapshot of the day's figures PLUS several days of recent history for each metric, and you write the short intro that opens the team's daily market report. You are not summarising the whole table — the numbers speak for themselves below your intro. Your job is to notice what has CHANGED over the last few days and say why it is worth attention.

## Audience
The two BTS founders and their internal desk — sophisticated, time-poor, sceptical of hype. They want signal.

## What to write
- Pick ONE or TWO aspects worth focusing on — a shift in trend, a metric crossing a threshold, on-chain and macro pointing the same (or opposite) way. Not a metric-by-metric recap.
- Ground every observation in the figures given. Prefer "the change over the last few days" over "today's single tick".
- Where it helps, connect an on-chain move to a macro backdrop (or vice versa).

## Hard constraints
- 50 words MAXIMUM. One tight paragraph, no headings, no bullet list, no sign-off.
- Work ONLY from the figures supplied. Do not invent numbers, cite outside data, or use any tools.
- No price predictions or price targets. No buy/sell/hold framing. Describe conditions, never advise.
- Capital B = the Bitcoin network/protocol; lowercase b = the currency/unit.
- No hype language and no exclamation marks. Plain, confident, declarative.

## Output
Return your intro via the structured schema you are given — a single \`commentary\` string of at most ~50 words.`;

function buildSystemPrompt(voiceBlock: string | null): string {
  if (!voiceBlock) return BASE_PROMPT;
  return `${BASE_PROMPT}

---

## BRAND VOICE (house tone — write in this register)

<brand-voice>
${voiceBlock}
</brand-voice>`;
}

export const marketAnalyst = new Agent({
  id: 'marketAnalyst',
  name: 'marketAnalyst',
  description:
    'Internal market analyst. Writes the short brand-voice intro for the daily market_report email from on-chain + macro trends. Used only by the market_report routine.',
  instructions: async () => buildSystemPrompt(await resolveCompanyVoiceBlock()),
  model: dynamicModelFor('marketAnalyst'),
  defaultOptions: { modelSettings: { maxOutputTokens: 2048 } },
});
