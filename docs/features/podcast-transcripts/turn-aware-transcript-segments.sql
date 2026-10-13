-- ============================================================
-- Turn-aware transcript segments
-- Target: supabase/migrations/20261013000000_turn_aware_transcript_segments.sql
-- Spec:   docs/features/podcast-transcripts/turn-aware-chunking-spec.md
-- ============================================================

ALTER TABLE transcript_segments
  ADD COLUMN speakers TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN transcript_segments.speaker IS
  'Primary speaker: owns >= 75% of content chars. NULL when no one does or the source has no diarisation.';
COMMENT ON COLUMN transcript_segments.speakers IS
  'All speakers in the segment, in first-appearance order.';

CREATE INDEX idx_transcript_segments_speakers
  ON transcript_segments USING GIN (speakers);

-- Off podcast_episodes on purpose: that table is published to realtime, and a
-- ~150 KB utterance blob would ride every change event.
CREATE TABLE podcast_transcript_utterances (
  episode_id   UUID PRIMARY KEY REFERENCES podcast_episodes(id) ON DELETE CASCADE,
  timing       TEXT NOT NULL CHECK (timing IN ('deepgram', 'interpolated')),
  utterances   JSONB NOT NULL,                -- [{ start, end, label, speaker, text }]
  speaker_map  JSONB NOT NULL DEFAULT '{}',   -- { "Speaker 0": "Jeff Snider" }
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER podcast_transcript_utterances_updated_at
  BEFORE UPDATE ON podcast_transcript_utterances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE podcast_transcript_utterances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "podcast_transcript_utterances_team" ON podcast_transcript_utterances
  FOR ALL USING (is_team_member());
