-- ============================================================
-- brand_voice.content_policy — canon topic & positioning policy
-- ============================================================
-- Moves the strategic-content lists that previously lived only as prose in
-- docs/brand-voice.md (and as dangling references in Charlie's hard-coded system
-- prompt) into a structured, editable canon field. Surfaced through the voice
-- resolver so every content generation gets topic/positioning guidance from the
-- brand voice data rather than from hard-coded text.
--
--   content_policy shape (all optional string[] keys):
--     topics_endorsed      — topics we comment on publicly
--     topics_avoided       — topics we never post about
--     aligned_voices       — thought leaders / companies we align with
--     contrarian_views     — voices we respectfully disagree with
--
-- Canon-only (lives on brand_voice, not social_accounts.voice_profile): topic
-- policy is a company-level stance, not a per-account voice override.
-- ============================================================

ALTER TABLE brand_voice
  ADD COLUMN IF NOT EXISTS content_policy JSONB NOT NULL DEFAULT '{}'::jsonb;
