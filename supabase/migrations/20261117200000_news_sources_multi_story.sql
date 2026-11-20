-- A newsletter that is a roundup of several stories (Fear & Greed's daily
-- email). Key points are extracted per section for these, so a lead story
-- cannot be crowded out of the 7-point cap by the stories after it.
-- See apps/agents/src/lib/roundupSections.ts.
ALTER TABLE news_sources
  ADD COLUMN IF NOT EXISTS multi_story BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN news_sources.multi_story IS
  'Roundup newsletter: key points are extracted per section rather than from the whole body.';

-- Fear & Greed. A no-op in any database without this row.
UPDATE news_sources SET multi_story = true
WHERE id = '4068c0a3-c0bb-4f65-9914-a2fab3db09c4';
