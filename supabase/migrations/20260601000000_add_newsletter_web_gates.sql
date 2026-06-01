-- Web approval path for the newsletter gates. Signal was the only channel that
-- could deliver a gate message and resume a suspended run; these columns let the
-- /content page do the same without Signal.
--
--   gate_message        — the human-readable summary persisted on suspend (the
--                         same text Signal would send), rendered in the web UI.
--   gate_draft_markdown — the assembled draft, persisted at gate 2 so the web UI
--                         can preview/download it (Signal got it as an attachment).
--   pending_decision    — web → agents handoff slot. The web action writes the
--                         director's decision here; the agents-side gate listener
--                         atomically claims it and calls resumeNewsletterRun.

ALTER TABLE newsletter_runs
  ADD COLUMN IF NOT EXISTS gate_message        TEXT,
  ADD COLUMN IF NOT EXISTS gate_draft_markdown TEXT,
  ADD COLUMN IF NOT EXISTS pending_decision    JSONB;
