// Prompts + the deterministic transcript-prep helper for the episode summary
// pass. Kept pure and separate from index.ts so they're unit-testable.

// A long transcript is evidence, not the payload — roger only needs enough to
// summarise. Cap what we send so a 3-hour episode doesn't blow the context
// budget (and cost). ~48k chars ≈ 12k tokens of transcript, plenty for a brief.
export const MAX_TRANSCRIPT_CHARS = 48_000;

/** Trim a transcript to the model budget, marking the cut so the model knows the
 *  tail is missing. Pure — unit-tested. */
export function prepareTranscript(text: string, max = MAX_TRANSCRIPT_CHARS): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}\n\n[transcript truncated]`;
}

export interface SummaryEpisode {
  title: string;
  description: string | null;
}

/** roger's brief: a short, descriptive, compliance-safe summary in BTS voice. */
export function buildSummaryPrompt(episode: SummaryEpisode, transcriptText: string): string {
  return `Write a short brief of this podcast episode for a treasury audience (CFOs, finance managers).

## What to produce
3–5 sentences that tell a busy reader what the episode covers and why it might matter to a Bitcoin treasury audience. This replaces reading a 90-minute transcript — lead with substance, not throat-clearing.

## Rules
- **Describe, never advise.** Report what the speakers said — "the host argued…", "the guest claimed…", "they discussed…". Never state BTS's own view, and never frame anything as a reason to buy, sell, accumulate, or time the market, or as a price prediction. This is a third party's content, summarised neutrally.
- **Brand voice.** "Bitcoin" (capital B) for the network/protocol, "bitcoin" (lowercase b) for the currency/unit. Never "crypto", "cryptocurrency", or "digital assets". Avoid hype and trading slang ("to the moon", "bull run", "HODL", "pump", "moonshot", etc.).
- Plain, measured, credible. No emojis. No marketing adjectives ("revolutionary", "game-changer").
- If the transcript is thin or off-topic, say plainly what it covers rather than inventing relevance.

## Episode
TITLE: ${episode.title}
${episode.description ? `SHOW NOTES: ${episode.description}\n` : ''}
TRANSCRIPT:
${transcriptText}

Return the summary text only.`;
}

/** Lex's review of the proposed summary. Lex's own system prompt carries the
 *  AFSL/AR persona and verdict rules; this just supplies the material. */
export function buildSummaryLexPrompt(episode: SummaryEpisode, summary: string): string {
  return `Review this podcast-episode summary for advice risk under AFSL/AR.

The summary describes a THIRD PARTY's podcast — it should read as neutral description of what the speakers said, never as BTS recommending action or predicting price. Flag any phrase that reads as a buy/sell/accumulate/time-the-market signal, a price prediction, or a "cheap/expensive/undervalued/overvalued" framing presented as BTS's own view rather than as reported speech.

EPISODE: ${episode.title}

SUMMARY:
${summary}`;
}
