import { supabase } from '@platform/db';
import { chunkText, embedTexts } from '../contentEmbeddings.js';
import type { TimedSegment } from './parsers.js';

// ~4 chars per token; target ~600-token windows (spec: 500–800). Matches the
// content_embeddings convention (CHARS_PER_CHUNK = 512*4) closely enough that
// the two stores stay comparable.
const CHARS_PER_CHUNK = 600 * 4;
const CHARS_PER_TOKEN = 4;

export interface SegmentDraft {
  segmentIndex: number;
  startSeconds: number | null;
  endSeconds: number | null;
  speaker: string | null;
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
  content: string;
  token_count: number;
  embedding: number[];
}

const estimateTokens = (text: string) => Math.ceil(text.length / CHARS_PER_TOKEN);

/**
 * Pack transcript content into ~600-token chunks for embedding.
 *
 * Timestamped path (json/vtt/srt/deepgram): greedily accumulate consecutive
 * timed segments into windows, carrying the first member's start and the last
 * member's end so a retrieved chunk still deep-links to the right moment. The
 * speaker is kept only when the whole window shares one (else null — a mixed
 * window has no single speaker).
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
      content,
      tokenCount: estimateTokens(content),
    }));
  }

  const drafts: SegmentDraft[] = [];
  let buf: TimedSegment[] = [];
  let bufLen = 0;

  const flush = () => {
    if (buf.length === 0) return;
    const content = buf.map((s) => s.text).join(' ').trim();
    const speakers = new Set(buf.map((s) => s.speaker).filter((s): s is string => !!s));
    drafts.push({
      segmentIndex: drafts.length,
      startSeconds: buf[0]!.start,
      endSeconds: buf[buf.length - 1]!.end ?? buf[buf.length - 1]!.start,
      speaker: speakers.size === 1 ? [...speakers][0]! : null,
      content,
      tokenCount: estimateTokens(content),
    });
    buf = [];
    bufLen = 0;
  };

  for (const seg of timed!) {
    const text = seg.text.trim();
    if (!text) continue;
    // Start a new window if appending would overflow (but always keep at least
    // one segment per window, even if a single segment exceeds the target).
    if (bufLen > 0 && bufLen + text.length > CHARS_PER_CHUNK) flush();
    buf.push(seg);
    bufLen += text.length + 1;
  }
  flush();

  return drafts;
}

/**
 * (Re)embed one episode's transcript segments. Idempotent: clears prior rows for
 * the episode first so a re-resolve doesn't leave stale vectors. Batch-embeds in
 * one OpenAI call. Returns the number of segments written.
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
    content: d.content,
    token_count: d.tokenCount,
    embedding: embeddings[i] ?? [],
  }));

  const { error: insError } = await client.from('transcript_segments').insert(rows);
  if (insError) throw new Error(`transcript_segments insert failed: ${insError.message}`);

  return { segments: rows.length };
}
