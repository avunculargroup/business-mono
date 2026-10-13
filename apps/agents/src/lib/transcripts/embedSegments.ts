import { supabase } from '@platform/db';
import { chunkText, embedTexts } from '../contentEmbeddings.js';
import type { TimedSegment } from './parsers.js';

// ~4 chars per token; target ~600-token windows (spec: 500–800). Matches the
// content_embeddings convention (CHARS_PER_CHUNK = 512*4) closely enough that
// the two stores stay comparable.
const CHARS_PER_CHUNK = 600 * 4;
const CHARS_PER_TOKEN = 4;

// Turn-aware windowing (docs/features/podcast-transcripts/turn-aware-chunking-spec.md).
// A speaker change closes the window once it holds MIN_BREAK_CHARS (~150 tokens;
// the median turn is 646 chars), so most windows carry one voice and short
// interjections ride inside a neighbour instead of becoming their own vector.
const MIN_BREAK_CHARS = 600;
// Share of a window's characters one speaker must own to be its `speaker`.
const PRIMARY_SHARE = 0.75;

// Rows per transcript_segments INSERT. Each row carries a 1536-dim vector and
// an HNSW index update; a ~110-minute episode's ~100+ rows in one statement
// hit Postgres's statement timeout during the October 2026 Deepgram backfill.
const INSERT_BATCH_SIZE = 25;

export interface SegmentDraft {
  segmentIndex: number;
  startSeconds: number | null;
  endSeconds: number | null;
  speaker: string | null;
  speakers: string[];
  content: string;
  tokenCount: number;
}

// transcript_segments is not in the generated Database types until
// `pnpm --filter @platform/db generate-types` runs post-migration. Cast at the
// boundary; the row shape is asserted explicitly here.
type SegmentsClient = {
  from: (table: 'transcript_segments') => {
    delete: () => {
      eq: (col: 'episode_id', val: string) => Promise<{ error: { message: string } | null }>;
    };
    insert: (rows: SegmentInsert[]) => Promise<{ error: { message: string } | null }>;
  };
};

interface SegmentInsert {
  episode_id: string;
  segment_index: number;
  start_seconds: number | null;
  end_seconds: number | null;
  speaker: string | null;
  speakers: string[];
  content: string;
  token_count: number;
  embedding: number[];
}

const estimateTokens = (text: string) => Math.ceil(text.length / CHARS_PER_TOKEN);

/**
 * Pack transcript content into ~600-token chunks for embedding.
 *
 * Timestamped path (json/vtt/srt/deepgram): accumulate consecutive timed
 * segments into windows, carrying the first member's start and the last
 * member's end so a retrieved chunk still deep-links to the right moment. A
 * window closes on a speaker change once it holds MIN_BREAK_CHARS, or before it
 * would pass CHARS_PER_CHUNK. `speakers` lists everyone in the window in
 * first-appearance order; `speaker` is the one owning PRIMARY_SHARE of its
 * characters, else null. A window with more than one speaker puts each turn on
 * its own line prefixed `[Name] `. With no speakers in the input (SRT, YouTube)
 * the output is plain greedy packing, as before.
 *
 * Plain-text path (html/text, no timestamps): fall back to character windowing
 * with null timestamps/speaker.
 */
export function buildSegments(timed: TimedSegment[] | null, plainText: string): SegmentDraft[] {
  const hasTimed = !!timed && timed.some((s) => s.start !== null);

  if (!hasTimed) {
    return chunkText(plainText).map((content, i) => ({
      segmentIndex: i,
      startSeconds: null,
      endSeconds: null,
      speaker: null,
      speakers: [],
      content,
      tokenCount: estimateTokens(content),
    }));
  }

  const drafts: SegmentDraft[] = [];
  let buf: TimedSegment[] = [];
  let bufLen = 0;

  const flush = () => {
    if (buf.length === 0) return;

    // Same-speaker runs. A null-speaker utterance is its own run but never a
    // marker and never in `speakers`.
    const runs: { speaker: string | null; texts: string[] }[] = [];
    const chars = new Map<string, number>();
    let total = 0;
    for (const seg of buf) {
      const text = seg.text.trim();
      const last = runs[runs.length - 1];
      if (last && last.speaker === seg.speaker) last.texts.push(text);
      else runs.push({ speaker: seg.speaker, texts: [text] });
      total += text.length;
      if (seg.speaker) chars.set(seg.speaker, (chars.get(seg.speaker) ?? 0) + text.length);
    }
    const speakers = [...chars.keys()];

    const content =
      speakers.length > 1
        ? runs
            .map((r) => {
              const text = r.texts.join(' ');
              return r.speaker ? `[${r.speaker}] ${text}` : text;
            })
            .join('\n')
        : buf.map((s) => s.text).join(' ').trim();

    const primary = speakers.find((sp) => total > 0 && chars.get(sp)! / total >= PRIMARY_SHARE);

    drafts.push({
      segmentIndex: drafts.length,
      startSeconds: buf[0]!.start,
      endSeconds: buf[buf.length - 1]!.end ?? buf[buf.length - 1]!.start,
      speaker: primary ?? null,
      speakers,
      content,
      tokenCount: estimateTokens(content),
    });
    buf = [];
    bufLen = 0;
  };

  for (const seg of timed!) {
    const text = seg.text.trim();
    if (!text) continue;
    const turnChanged = bufLen > 0 && seg.speaker !== buf[buf.length - 1]!.speaker;
    // Close the window on a speaker change once it is big enough, or if
    // appending would overflow (but always keep at least one segment per
    // window, even if a single segment exceeds the target).
    if (turnChanged && bufLen >= MIN_BREAK_CHARS) flush();
    else if (bufLen > 0 && bufLen + text.length > CHARS_PER_CHUNK) flush();
    buf.push(seg);
    bufLen += text.length + 1;
  }
  flush();

  return drafts;
}

/**
 * (Re)embed one episode's transcript segments. Idempotent: clears prior rows for
 * the episode first so a re-resolve doesn't leave stale vectors. Batch-embeds in
 * one OpenAI call, then inserts in INSERT_BATCH_SIZE chunks. A failed chunk
 * leaves earlier chunks in place; the next run's delete clears them. Returns the
 * number of segments written.
 */
export async function embedEpisodeSegments(
  episodeId: string,
  drafts: SegmentDraft[],
): Promise<{ segments: number }> {
  const client = supabase as unknown as SegmentsClient;

  const { error: delError } = await client
    .from('transcript_segments')
    .delete()
    .eq('episode_id', episodeId);
  if (delError) throw new Error(`transcript_segments delete failed: ${delError.message}`);

  if (drafts.length === 0) return { segments: 0 };

  const embeddings = await embedTexts(drafts.map((d) => d.content));
  const rows: SegmentInsert[] = drafts.map((d, i) => ({
    episode_id: episodeId,
    segment_index: d.segmentIndex,
    start_seconds: d.startSeconds,
    end_seconds: d.endSeconds,
    speaker: d.speaker,
    speakers: d.speakers,
    content: d.content,
    token_count: d.tokenCount,
    embedding: embeddings[i] ?? [],
  }));

  for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
    const { error: insError } = await client
      .from('transcript_segments')
      .insert(rows.slice(i, i + INSERT_BATCH_SIZE));
    if (insError) throw new Error(`transcript_segments insert failed: ${insError.message}`);
  }

  return { segments: rows.length };
}
