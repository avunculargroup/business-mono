// Prompts + the deterministic transcript helpers for the episode intelligence
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

/** A transcript segment as the narration step needs it: its start second (null
 *  when the source had no timestamps), optional speaker, and text. */
export interface TimedSegment {
  start_seconds: number | null;
  speaker: string | null;
  content: string;
}

/**
 * Render segments as a timestamp-marked transcript so the model can cite the
 * moment each takeaway draws from. Every segment with a known start is prefixed
 * `[<seconds>s]`; the model is told to copy the nearest such marker into each
 * takeaway. Pure — unit-tested.
 */
export function buildTimestampedTranscript(segments: TimedSegment[]): string {
  return segments
    .map((s) => {
      const stamp = s.start_seconds != null ? `[${Math.floor(s.start_seconds)}s] ` : '';
      const who = s.speaker ? `${s.speaker}: ` : '';
      return `${stamp}${who}${s.content}`;
    })
    .join('\n\n');
}

/**
 * Snap a model-proposed second to the nearest real segment start, so every
 * takeaway deep-links to a moment that actually exists rather than a hallucinated
 * timestamp. Returns null when there is nothing to snap to (no timestamped
 * segments) or no proposal. Pure — unit-tested. This is the deterministic guard
 * that owns timestamp integrity; the model only suggests.
 */
export function snapToSegment(seconds: number | null, starts: number[]): number | null {
  if (seconds == null || starts.length === 0) return null;
  let best = starts[0]!;
  let bestDiff = Math.abs(seconds - best);
  for (const s of starts) {
    const diff = Math.abs(seconds - s);
    if (diff < bestDiff) {
      best = s;
      bestDiff = diff;
    }
  }
  return best;
}

export interface SummaryEpisode {
  title: string;
  description: string | null;
}

/**
 * roger's brief: a short descriptive summary plus key takeaways, each anchored to
 * a transcript timestamp. Compliance-safe, BTS voice. The transcript passed in
 * carries `[<seconds>s]` markers (see buildTimestampedTranscript) when the source
 * had timestamps; the model copies the nearest marker into each takeaway's
 * start_seconds, or uses null when there are no markers.
 */
export function buildSummaryPrompt(episode: SummaryEpisode, transcriptText: string): string {
  return `Write a brief of this podcast episode for a treasury audience (CFOs, finance managers).

## What to produce
1. **summary** — 3–5 sentences that tell a busy reader what the episode covers and why it might matter to a Bitcoin treasury audience. This replaces reading a 90-minute transcript — lead with substance, not throat-clearing.
2. **takeaways** — 4–7 short bullet points, each a single specific, treasury-relevant point the episode makes (a claim, a data point, an argument, a development). Not a table of contents — the things worth knowing. For each takeaway set **start_seconds** to the number from the nearest \`[<seconds>s]\` marker in the transcript where that point is discussed. If the transcript has no \`[<seconds>s]\` markers, set start_seconds to null.

## Rules
- **Describe, never advise.** Report what the speakers said — "the host argued…", "the guest claimed…", "they discussed…". Never state BTS's own view, and never frame anything as a reason to buy, sell, accumulate, or time the market, or as a price prediction. This is a third party's content, summarised neutrally. This applies to the takeaways as much as the summary.
- **Brand voice.** "Bitcoin" (capital B) for the network/protocol, "bitcoin" (lowercase b) for the currency/unit. Never "crypto", "cryptocurrency", or "digital assets". Avoid hype and trading slang ("to the moon", "bull run", "HODL", "pump", "moonshot", etc.).
- Plain, measured, credible. No emojis. No marketing adjectives ("revolutionary", "game-changer").
- If the transcript is thin or off-topic, say plainly what it covers rather than inventing relevance, and return fewer takeaways (or none) rather than padding.

## Episode
TITLE: ${episode.title}
${episode.description ? `SHOW NOTES: ${episode.description}\n` : ''}
TRANSCRIPT:
${transcriptText}`;
}

/** Lex's review of the proposed brief (summary + takeaways). Lex's own system
 *  prompt carries the AFSL/AR persona and verdict rules; this just supplies the
 *  material. Both the summary and the takeaways are client-visible prose, so both
 *  are reviewed in one pass. */
export function buildSummaryLexPrompt(
  episode: SummaryEpisode,
  summary: string,
  takeaways: string[],
): string {
  const takeawayBlock = takeaways.length
    ? `\n\nTAKEAWAYS:\n${takeaways.map((t) => `- ${t}`).join('\n')}`
    : '';
  return `Review this podcast-episode brief for advice risk under AFSL/AR.

The brief describes a THIRD PARTY's podcast — the summary and every takeaway should read as neutral description of what the speakers said, never as BTS recommending action or predicting price. Flag any phrase that reads as a buy/sell/accumulate/time-the-market signal, a price prediction, or a "cheap/expensive/undervalued/overvalued" framing presented as BTS's own view rather than as reported speech.

EPISODE: ${episode.title}

SUMMARY:
${summary}${takeawayBlock}`;
}
