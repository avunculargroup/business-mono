import { supabase } from '@platform/db';
import { buildSegments, embedEpisodeSegments } from '../lib/transcripts/embedSegments.js';
import {
  alignUtterances,
  dedupeSegments,
  nullSpeakerPct,
  parseTranscriptLines,
  toTimedSegments,
  type OldSegment,
} from '../lib/transcripts/rechunk.js';
import { upsertUtterances, type StoredUtterance } from '../lib/transcripts/store.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('backfill:rechunk');

/**
 * Re-chunk stored Deepgram transcripts with turn-aware windows, from data
 * already in the database — no Deepgram spend. Spec:
 * docs/features/podcast-transcripts/turn-aware-chunking-spec.md#backfill.
 *
 * Per Deepgram episode with no podcast_transcript_utterances row: align
 * transcript_text lines to the existing segments, interpolate utterance times,
 * store them (timing 'interpolated'), then re-chunk and re-embed. An episode
 * that fails alignment is logged and left untouched. Resumable: an episode
 * with an utterances row is skipped — except under --episode, which re-chunks
 * from that stored row, the recovery path when an embed fails after it was
 * written.
 *
 * Requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and OPENAI_API_KEY (the
 * OpenAI client is built at import, so even --dry-run needs it set), with
 * 20261013000000_turn_aware_transcript_segments applied.
 *
 *   pnpm --filter @platform/agents backfill:rechunk --dry-run --limit 5
 *   pnpm --filter @platform/agents backfill:rechunk --episode <uuid>
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const PAGE = 1000;

interface Args {
  dryRun: boolean;
  limit: number | null;
  episode: string | null;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { dryRun: false, limit: null, episode: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--limit') args.limit = Number(argv[++i]);
    else if (a === '--episode') args.episode = argv[++i] ?? null;
  }
  if (args.limit !== null && !(args.limit > 0)) throw new Error('--limit needs a positive number');
  return args;
}

async function selectAll<T>(build: () => { range: (a: number, b: number) => Promise<{ data: T[] | null; error: { message: string } | null }> }): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

async function pendingEpisodes(args: Args): Promise<Array<{ id: string; title: string }>> {
  const done = new Set(
    (
      await selectAll<{ episode_id: string }>(() =>
        db.from('podcast_transcript_utterances').select('episode_id').order('episode_id'),
      )
    ).map((r) => r.episode_id),
  );
  const episodes = await selectAll<{ id: string; title: string }>(() => {
    let q = db
      .from('podcast_episodes')
      .select('id, title')
      .eq('transcript_source', 'deepgram')
      .eq('transcript_status', 'available')
      .not('transcript_text', 'is', null)
      .order('published_at', { ascending: false });
    if (args.episode) q = q.eq('id', args.episode);
    return q;
  });
  const pending = args.episode ? episodes : episodes.filter((e) => !done.has(e.id));
  return args.limit ? pending.slice(0, args.limit) : pending;
}

const distinct = (xs: Array<string | null>) => new Set(xs.filter((x): x is string => !!x)).size;

async function storedUtterances(episodeId: string): Promise<StoredUtterance[] | null> {
  const { data, error } = await db
    .from('podcast_transcript_utterances')
    .select('utterances')
    .eq('episode_id', episodeId)
    .maybeSingle();
  if (error) throw new Error(`utterances read failed: ${error.message}`);
  return (data?.utterances as StoredUtterance[] | undefined) ?? null;
}

async function rechunkEpisode(ep: { id: string; title: string }, dryRun: boolean): Promise<boolean> {
  const stored = await storedUtterances(ep.id);
  if (stored) {
    const drafts = buildSegments(toTimedSegments(stored), '');
    const report = { episodeId: ep.id, title: ep.title, from: 'stored utterances', newSegments: drafts.length };
    if (dryRun) log.info(report, 'dry run');
    else {
      await embedEpisodeSegments(ep.id, drafts);
      log.info(report, 'episode rechunked');
    }
    return true;
  }

  const { data: row, error: epErr } = await db
    .from('podcast_episodes')
    .select('transcript_text')
    .eq('id', ep.id)
    .single();
  if (epErr) throw new Error(`episode read failed: ${epErr.message}`);
  const { data: segs, error: segErr } = await db
    .from('transcript_segments')
    .select('segment_index, start_seconds, end_seconds, speaker, content')
    .eq('episode_id', ep.id)
    .order('segment_index');
  if (segErr) throw new Error(`segments read failed: ${segErr.message}`);

  const text = row.transcript_text as string;
  const deduped = dedupeSegments(
    (segs ?? []) as Array<OldSegment & { segment_index: number; speaker: string | null }>,
  );
  if (!deduped.ok) {
    log.warn({ episodeId: ep.id, title: ep.title, alignment: 'skip', reason: deduped.reason }, 'episode skipped');
    return false;
  }
  const oldSegments = deduped.segments;
  const lines = parseTranscriptLines(text);
  const aligned = alignUtterances(lines, oldSegments);
  const base = {
    episodeId: ep.id,
    title: ep.title,
    oldSegments: oldSegments.length,
    duplicateRows: deduped.duplicates,
    oldNullPct: nullSpeakerPct(oldSegments),
    textSpeakers: distinct(lines.map((l) => l.speaker)),
    oldSegmentSpeakers: distinct(oldSegments.map((s) => s.speaker)),
  };

  if (!aligned.ok) {
    log.warn({ ...base, alignment: 'skip', reason: aligned.reason }, 'episode skipped');
    return false;
  }

  const drafts = buildSegments(toTimedSegments(aligned.utterances), text);
  const report = {
    ...base,
    alignment: 'ok',
    newSegments: drafts.length,
    newNullPct: nullSpeakerPct(drafts),
    newSegmentSpeakers: new Set(drafts.flatMap((d) => d.speakers)).size,
  };
  if (dryRun) {
    log.info(report, 'dry run');
    return true;
  }

  await upsertUtterances(ep.id, { timing: 'interpolated', utterances: aligned.utterances, speakerMap: {} });
  try {
    await embedEpisodeSegments(ep.id, drafts);
  } catch (err) {
    log.error({ err, episodeId: ep.id }, 'embed failed after utterances stored; re-run with --episode');
    throw err;
  }
  log.info(report, 'episode rechunked');
  return true;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const episodes = await pendingEpisodes(args);
  log.info({ pending: episodes.length, dryRun: args.dryRun }, 'backfill start');

  let ok = 0;
  let skipped = 0;
  let failed = 0;
  // One episode at a time: embedEpisodeSegments makes one OpenAI call per
  // episode, which keeps the ~12M-token run inside rate limits.
  for (const ep of episodes) {
    try {
      if (await rechunkEpisode(ep, args.dryRun)) ok++;
      else skipped++;
    } catch (err) {
      failed++;
      log.error({ err, episodeId: ep.id }, 'episode failed');
    }
  }

  const total = ok + skipped + failed;
  log.info(
    { ok, skipped, failed, skippedPct: total ? Math.round((1000 * skipped) / total) / 10 : 0, dryRun: args.dryRun },
    'backfill done',
  );
}

main().catch((err) => {
  log.error({ err }, 'backfill aborted');
  process.exit(1);
});
