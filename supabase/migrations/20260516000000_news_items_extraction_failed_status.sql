-- news_items: add 'extraction_failed' to the status CHECK constraint so the
-- news_ingest workflow can mark rows whose LLM metadata extraction failed
-- instead of silently inserting them with empty key_points/topic_tags. This
-- makes broken rows trivially filterable:
--
--   SELECT count(*) FROM news_items WHERE status = 'extraction_failed';

ALTER TABLE news_items DROP CONSTRAINT IF EXISTS news_items_status_check;

ALTER TABLE news_items
  ADD CONSTRAINT news_items_status_check
  CHECK (status IN ('new','reviewed','archived','promoted','extraction_failed'));
