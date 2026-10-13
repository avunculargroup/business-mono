# Claude Code prompt — Turn-aware transcript chunking

One session covers code, migration and a dry run. The real backfill runs after
a director reviews the dry-run report. Spec:
[`turn-aware-chunking-spec.md`](./turn-aware-chunking-spec.md).

```markdown
# Session: turn-aware transcript chunking

## Context
Deepgram diarisation works, but `buildSegments` in
`apps/agents/src/lib/transcripts/embedSegments.ts` keeps a segment's speaker only
when the whole ~600-token window has one speaker. Result: 75% of Deepgram
`transcript_segments` have a null speaker, and 610 of 743 multi-speaker episodes
lost at least one speaker. Turn lengths: median 646 chars; 89% of text is in
turns >= 600 chars; turns < 200 chars are 20% of turns but 1.7% of text.
Read docs/features/podcast-transcripts/turn-aware-chunking-spec.md first.

## Do
1. Migration `supabase/migrations/20261013000000_turn_aware_transcript_segments.sql`
   from docs/features/podcast-transcripts/turn-aware-transcript-segments.sql.
   Confirm the timestamp is later than everything on main. Regenerate types:
   `pnpm --filter @platform/db generate-types`. Add an entry to
   docs/schema-changes.md.
2. Rewrite the timestamped path of `buildSegments` (plain-text path unchanged):
   - Constants: CHARS_PER_CHUNK 2400, MIN_BREAK_CHARS 600, PRIMARY_SHARE 0.75.
   - Flush before appending when (speaker changed AND buffer >= MIN_BREAK_CHARS)
     OR appending would exceed CHARS_PER_CHUNK (keep >= 1 utterance per window).
   - Content: same-speaker runs joined by a space; if >1 speaker, each run on its
     own line prefixed `[Name] `. Single-speaker windows get no prefix.
   - `speakers` = distinct non-null speakers, first-appearance order.
   - `speaker` = speaker owning >= 75% of chars, else null.
   - No speakers in input (SRT/YouTube) => identical output to today.
   - Add `speakers` to SegmentDraft/SegmentInsert and write it.
3. `inferAndApplySpeakerNames` returns `{ renamed, map }` instead of a count.
   In `processPodcastTranscript`, snapshot raw labels BEFORE naming, then upsert
   `podcast_transcript_utterances` (timing 'deepgram', label = raw, speaker =
   resolved, speaker_map = map). Best-effort like the activity log: a failed
   upsert must never demote an available transcript.
4. `apps/web/app/(app)/news/podcasts/[id]/EpisodeDetail.tsx`: when segment
   content has lines starting `[Name] `, render each line with the name as a
   speaker label (reuse `styles.speaker`), not raw brackets. Keep `Highlighted`
   search highlighting and copy-with-citation working. Invoke the bts-design
   skill first and check at 375px and 320px.
5. Backfill script `apps/agents/src/scripts/rechunkTranscripts.ts`, run via tsx,
   with package script `backfill:rechunk`. Flags: --dry-run, --limit N, --episode ID.
   Use createLogger, never console.*.
   Per Deepgram episode without an utterances row:
   a. Load transcript_text + segments ordered by segment_index.
   b. Parse lines: /^\[([^\]]+)\] (.*)$/ => speaker,text; else null speaker.
   c. Align: for each old segment consume lines until joined-by-space length
      reaches content length; require exact equality, else skip + log episode.
   d. Interpolate each utterance start by char offset within
      [start_seconds, end_seconds]; end = next start; last = segment end.
   e. Insert utterances row (timing 'interpolated', label = speaker, map {}).
   f. buildSegments -> embedEpisodeSegments (already idempotent, batches of 25).
   Dry run prints per-episode: old/new segment count, old/new null-speaker %,
   text vs segment speaker count, alignment ok/skip. No writes.

## Tests (vitest, alongside existing *.test.ts)
- buildSegments: monologue; two-speaker interview with long turns; short
  interjection absorbed with inline marker; turn > 2400 chars splits into
  single-speaker windows; no-speaker input unchanged vs current behaviour;
  primary-speaker threshold at exactly 75%.
- Alignment: exact match, mismatch => skip, interpolation monotonic.
- EpisodeDetail renders markers as labels.
- Run `pnpm --filter @platform/agents test`, `typecheck`, and
  `pnpm --filter @platform/web test` before reporting done.

## Rules
- Read `node_modules/@mastra/core/dist/docs/` before touching agent calls
  (the roger.generate call in inferSpeakerNames).
- One logical operation per execute_sql call.
- Do not run the real backfill. Run `--dry-run --limit 5` and include the output
  in your summary, including TIP829 (Kaspi) if present.
- Stop and ask if alignment mismatches exceed 2% in the dry run.
```
