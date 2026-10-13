import type { TimedSegment } from './parsers.js';
import type { StoredUtterance } from './store.js';

// Backfill support for turn-aware chunking
// (docs/features/podcast-transcripts/turn-aware-chunking-spec.md#backfill).
// Per-utterance Deepgram timings were never stored, so a stored episode is
// rebuilt from what is in the database: transcript_text gives the utterances
// (one per line), and the old segments' boundaries — which always fall between
// utterances — pin their times every ~2 minutes. Pure; unit-tested.

export interface ParsedLine {
  speaker: string | null;
  text: string;
}

export interface OldSegment {
  start_seconds: number | null;
  end_seconds: number | null;
  content: string;
}

const MARKER = /^\[([^\]]+)\] (.*)$/;

/** Split a stored Deepgram transcript_text into utterance lines. */
export function parseTranscriptLines(transcriptText: string): ParsedLine[] {
  return transcriptText
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      const m = MARKER.exec(line);
      return m ? { speaker: m[1]!, text: m[2]! } : { speaker: null, text: line };
    });
}

export type AlignResult =
  | { ok: true; utterances: StoredUtterance[] }
  | { ok: false; reason: string };

/**
 * Align transcript lines to the old segments and interpolate each utterance's
 * start by character offset within its segment's [start, end]. Any mismatch —
 * a segment whose lines don't join to exactly its content, or lines left over —
 * fails the whole episode so it is skipped and left untouched.
 */
export function alignUtterances(lines: ParsedLine[], segments: OldSegment[]): AlignResult {
  const out: StoredUtterance[] = [];
  let li = 0;

  for (const [si, seg] of segments.entries()) {
    if (seg.start_seconds === null || seg.end_seconds === null) {
      return { ok: false, reason: `segment ${si} has no timestamps` };
    }
    const members: ParsedLine[] = [];
    let len = -1; // length of members joined by ' '
    while (len < seg.content.length && li < lines.length) {
      members.push(lines[li]!);
      len += lines[li]!.text.length + 1;
      li++;
    }
    if (members.map((m) => m.text).join(' ') !== seg.content) {
      return { ok: false, reason: `segment ${si} content mismatch` };
    }

    const span = seg.end_seconds - seg.start_seconds;
    let offset = 0;
    const starts = members.map((m) => {
      const t = seg.start_seconds! + (span * offset) / seg.content.length;
      offset += m.text.length + 1;
      return t;
    });
    members.forEach((m, i) => {
      out.push({
        start: starts[i]!,
        end: i + 1 < members.length ? starts[i + 1]! : seg.end_seconds,
        // Raw labels for named episodes are already gone; keep what was stored.
        label: m.speaker,
        speaker: m.speaker,
        text: m.text,
      });
    });
  }

  if (li < lines.length) {
    return { ok: false, reason: `${lines.length - li} lines left after the last segment` };
  }
  return { ok: true, utterances: out };
}

export function toTimedSegments(utterances: StoredUtterance[]): TimedSegment[] {
  return utterances.map((u) => ({ start: u.start, end: u.end, speaker: u.speaker, text: u.text }));
}

/** Share of segments with a null speaker, as a percentage to one decimal. */
export function nullSpeakerPct(segments: Array<{ speaker: string | null }>): number {
  if (segments.length === 0) return 0;
  const nulls = segments.filter((s) => s.speaker === null).length;
  return Math.round((1000 * nulls) / segments.length) / 10;
}
