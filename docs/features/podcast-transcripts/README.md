# Podcast transcripts

Specs for the podcast transcript pipeline: how episode transcripts are chunked
into `transcript_segments`, labelled by speaker, and embedded for search.

## Document map

| Document | What it covers |
|----------|----------------|
| [`turn-aware-chunking-spec.md`](./turn-aware-chunking-spec.md) | Audit findings, decisions, chunking algorithm, backfill and verification |
| [`turn-aware-transcript-segments.sql`](./turn-aware-transcript-segments.sql) | Reference DDL for the migration: `transcript_segments.speakers` and `podcast_transcript_utterances` |
| [`claude-code-prompt.md`](./claude-code-prompt.md) | Copy-pasteable session prompt for the build |

## Build sequence

1. Migration and type regeneration.
2. Turn-aware `buildSegments`, utterance persistence for new Deepgram
   transcripts, and inline speaker markers on the episode page.
3. Backfill script, dry run on five episodes, director review.
4. Full backfill, then the verification queries in the spec.

## Code map

| File | Role |
|------|------|
| `apps/agents/src/lib/transcripts/embedSegments.ts` | `buildSegments` (chunking) and `embedEpisodeSegments` (embed + write) |
| `apps/agents/src/lib/transcripts/processPodcastTranscript.ts` | Deepgram callback: utterances to timed segments, naming, store |
| `apps/agents/src/lib/transcripts/inferSpeakerNames.ts` | Maps `Speaker N` labels to real names via Roger |
| `apps/agents/src/lib/transcripts/store.ts` | `storeAvailableTranscript`, shared by every transcript source |
| `apps/agents/src/lib/transcripts/parsers.ts` | VTT, SRT, JSON, HTML and plain-text parsers |
| `apps/web/app/(app)/news/podcasts/[id]/EpisodeDetail.tsx` | Episode page transcript view |
