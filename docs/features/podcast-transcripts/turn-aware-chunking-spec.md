# Feature Spec — Turn-Aware Transcript Chunking

**Platform:** Bitcoin Treasury Solutions Internal Platform
**Feature:** Speaker-preserving chunking for `transcript_segments`, plus backfill
**Status:** Draft
**Last updated:** 2026-10-13

---

## Problem

Deepgram diarisation works; the segment chunker discards it. 75% of Deepgram
`transcript_segments` (16,824 of 22,339) have a null `speaker`, because a
~550-token chunk only keeps a speaker when one person talks for all of it.

| Measure (Deepgram, 853 episodes) | Value |
| --- | --- |
| Episodes with 2+ speakers in `transcript_text` | 743 |
| Avg distinct speakers in `transcript_text` | 3.4 |
| Avg distinct speakers in segments | 1.4 |
| Episodes where segments lost a speaker | 610 |
| Multi-speaker episodes collapsed to one or no speaker | 404 |
| Episodes with resolved names | 381 (180 partly named) |
| Segments with inline speaker tags | 0 |

The pattern has held since the first Deepgram episodes in June, so it is a
design limit, not a regression. The cause is one line in `buildSegments`
(`apps/agents/src/lib/transcripts/embedSegments.ts`): a window keeps a speaker
only when `speakers.size === 1`.

Name inference is fine. Of 381 named episodes, 201 are fully named and 180 keep
a `Speaker N` that fell below `MIN_CONFIDENCE` (0.6), which is by design.

Audit run 2026-10-13 against Supabase `zqtudpzojsmjemqxaaxb`, repo at `25e0d6c`.

---

## Decisions

1. **Turn-aware chunking.** Break windows on speaker change once the buffer is
   big enough, so most segments hold one voice. Turn lengths support it: median
   turn is 646 chars, and 89% of text sits in turns of 600+ chars.
2. **`speaker` means primary speaker.** Set it to the speaker holding at least
   75% of the chunk's characters, else null. Today it means "sole speaker",
   which is why 75% are null.
3. **Add `speakers text[]`** on `transcript_segments`: every speaker in the
   chunk, in order of first appearance. Enables "segments where Saylor speaks"
   filters.
4. **Inline turn markers in mixed chunks.** When a short turn is absorbed,
   `content` carries `[Name] ` at the start of each turn, separated by
   newlines. Single-speaker chunks carry no markers.
5. **Persist utterances.** New side table `podcast_transcript_utterances`
   holding the Deepgram utterances and the label-to-name map. Not a column on
   `podcast_episodes`, because that table is on realtime
   (`20261010000000_enable_realtime_podcast_episodes.sql`) and a ~150 KB jsonb
   would ride every change event.
6. **Backfill reconstructs timings, no Deepgram re-run.** Per-utterance
   timestamps were never stored, so the backfill aligns `transcript_text` lines
   to existing segment boundaries and interpolates inside each window.

---

## Chunking algorithm

`buildSegments` keeps its signature and its plain-text path. Only the
timestamped path changes. With no speakers present (SRT, YouTube), it behaves
exactly as today.

| Constant | Value | Why |
| --- | --- | --- |
| `CHARS_PER_CHUNK` | 2400 (~600 tokens) | Unchanged hard ceiling |
| `MIN_BREAK_CHARS` | 600 (~150 tokens) | Median turn is 646 chars; 89% of text is in turns at or above this |
| `PRIMARY_SHARE` | 0.75 | Share of chunk chars one speaker needs to own `speaker` |

1. Walk utterances in order, skipping empty text (as today).
2. Before appending an utterance, flush the buffer if either holds:
    1. the speaker differs from the last buffered utterance's speaker **and**
       the buffer has at least `MIN_BREAK_CHARS`;
    2. appending would pass `CHARS_PER_CHUNK` (keep at least one utterance per
       window, as today).
3. On flush, build `content` by joining same-speaker runs with a space. If the
   window has more than one speaker, start each run on a new line with
   `[Name] `.
4. Set `speakers` to the distinct non-null speakers in first-appearance order.
5. Set `speaker` to the speaker owning at least `PRIMARY_SHARE` of the window's
   characters, else null.
6. Timestamps stay as today: first utterance's start, last utterance's end.

Edge cases:

- Short interjections ("Yeah.", "Right") are 20% of turns but 1.7% of text.
  They ride inside the neighbouring window as an inline marker and never become
  their own vector.
- A long turn over 2400 chars splits at utterance boundaries into several
  single-speaker windows. 49% of text sits in such turns.
- Null-speaker utterances inside a diarised episode count as their own
  "speaker" for break decisions but never appear in `speakers` or as a marker.
- Keep `segment_index` contiguous from 0, as `EpisodeDetail` orders by it.

---

## Schema change

One migration adds `speakers` to `transcript_segments` and creates the
utterance side table, with RLS matching `20260910000000_rls_hardening.sql`.
SQL is in [`turn-aware-transcript-segments.sql`](./turn-aware-transcript-segments.sql).
Regenerate types after (`pnpm --filter @platform/db generate-types`).

`label` keeps the raw Deepgram label (`Speaker 0`) and `speaker` the resolved
name, so naming can be re-run later without re-transcribing.
`timing = 'interpolated'` marks backfilled rows whose inner timestamps are
estimates.

---

## Backfill

Re-chunk all 853 Deepgram episodes from data already in the database, with no
Deepgram spend. Old segment boundaries always fall between utterances, so they
pin exact times every ~2 minutes; utterances inside a window get interpolated
times.

**Alignment, per episode**

1. Load `transcript_text` and the existing segments ordered by
   `segment_index`.
2. Split the text on newlines. A line matching `^\[([^\]]+)\] (.*)$` gives
   speaker and text; any other line is a null-speaker utterance.
3. For each old segment, consume lines until their texts joined by a space
   reach the segment's `content` length. The join must equal `content` exactly;
   on any mismatch, skip the episode, log it, and leave it untouched.
4. Within each segment, set each utterance's `start` by character offset across
   `[start_seconds, end_seconds]`; each `end` is the next start, the last is the
   segment's end.
5. Write a `podcast_transcript_utterances` row with `timing = 'interpolated'`.
   Set `label` = `speaker` (raw labels for named episodes are already gone) and
   `speaker_map = {}`.
6. Run the new `buildSegments` and `embedEpisodeSegments`, which already
   deletes and re-inserts idempotently in batches of 25.

**Runner**

- `apps/agents/src/scripts/rechunkTranscripts.ts`, run via tsx with package
  script `backfill:rechunk`. Not a routine: it runs once.
- `--dry-run` reports before/after metrics per episode with no writes;
  `--limit` and `--episode` for trial runs.
- Resumable: skip episodes that already have an utterances row.
- Embedding input is roughly 12M tokens (~22k chunks of ~550 tokens), so batch
  by episode and respect OpenAI rate limits.
- Each episode's segments are briefly absent between delete and insert;
  acceptable for an internal tool.

**Verification (run before and after)**

```sql
-- Null primary-speaker share on Deepgram segments (target < 15%, was 75%)
select round(100.0 * count(*) filter (where s.speaker is null) / count(*), 1) as pct_null
from transcript_segments s join podcast_episodes e on e.id = s.episode_id
where e.transcript_source = 'deepgram';
```

```sql
-- Episodes whose segments hold fewer speakers than their text (target 0, was 610)
with t as (
  select e.id, (select count(distinct m[1]) from regexp_matches(e.transcript_text, '^\[([^\]]+)\] ', 'gn') m) n_text
  from podcast_episodes e where e.transcript_source = 'deepgram' and e.transcript_text is not null
), s as (
  select episode_id, count(distinct sp) n_seg
  from transcript_segments, unnest(speakers) sp group by 1
)
select count(*) from t left join s on s.episode_id = t.id
where t.n_text >= 2 and coalesce(s.n_seg, 0) < t.n_text;
```

```sql
-- Episodes skipped on alignment mismatch (expect a handful at most)
select count(*) from podcast_episodes e
where e.transcript_source = 'deepgram' and e.transcript_status = 'available'
  and not exists (select 1 from podcast_transcript_utterances u where u.episode_id = e.id);
```

Spot-check three episodes in the web episode page: Kaspi (TIP829, three
voices), a Jeff Snider solo, and a Lance Roberts episode with an ad read.

---

## Out of scope and open questions

In scope beyond the chunker: `EpisodeDetail` renders the new inline `[Name] `
markers as speaker labels, otherwise the episode page shows raw brackets.

- **Feed-tag transcripts (306 episodes, zero speakers).** 269 are SRT, which
  has no voice tags, so that is expected. The 37 JSON files go through a parser
  that already reads `segments[].speaker`; worth opening two or three raw files
  to see whether publishers omit it or use another key.
- **YouTube (66 episodes).** Auto-captions carry no diarisation. Routing
  high-value YouTube-only episodes to Deepgram is a separate decision.
- **Search RPC.** The match function in
  `20260606120000_add_podcast_ingestion.sql` returns `speaker` only. Returning
  `speakers` means a drop-and-recreate; defer until Rex needs speaker filters.
- **Partial naming.** 180 episodes keep at least one `Speaker N`. The naming
  prompt only sees the opening slice of the transcript, so later guests can go
  unnamed. Separate change; the stored `label` makes it re-runnable.
- **Interpolated timings.** Inner timestamps on backfilled episodes are
  estimates within a ~2-minute window. Is that good enough for deep links, or
  should high-value episodes be re-transcribed for exact times?
