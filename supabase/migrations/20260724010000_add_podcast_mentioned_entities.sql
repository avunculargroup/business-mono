-- ============================================================
-- Episode mentioned entities — cross-link substrate (podcast-pages-review C3 / P2-11)
-- ============================================================
-- B1's last intelligence bullet + C3 cross-links: an episode should know it
-- lives in a graph — "companies mentioned → CRM", "related news", "other
-- episodes on this topic".
--
-- Per D1 ("deterministic tools, not agent guesswork") the linkable entities are
-- extracted deterministically: the intelligence pass matches the transcript
-- against the known CRM companies (a gazetteer), so a "mention" is always a real,
-- resolvable link — never a hallucinated name. Non-CRM entities aren't linkable
-- anyway, so they're out of scope here.
--
-- Shape: { "companies": [{ "id", "slug", "name" }] }. JSONB (not a join table) so
-- it's an additive snapshot alongside the other intel columns, and extensible to
-- tickers/people later without a migration. Director/ops metadata — NOT client-
-- facing: it is deliberately absent from v_episode_library, so the ops/client
-- boundary keeps CRM cross-links off any future client surface.
-- ============================================================

ALTER TABLE podcast_episodes
  ADD COLUMN IF NOT EXISTS mentioned_entities JSONB NOT NULL DEFAULT '{}'::jsonb;
