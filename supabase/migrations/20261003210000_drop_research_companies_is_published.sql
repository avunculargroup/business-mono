-- ============================================================
-- Corporate holdings: drop research_companies.is_published
--
-- The contract half of 20261003200000, which replaced it with review_state
-- and moved every policy and v_research_publishable onto the new column.
-- Nothing reads it now: no view, policy, function or index depends on it on
-- live, and the web app, the client app, the ingest workflow and the seed
-- dumper all read or write review_state.
--
-- jurisdiction_notes.is_published is a different column on a different table
-- and stays.
-- ============================================================

ALTER TABLE research_companies DROP COLUMN IF EXISTS is_published;
