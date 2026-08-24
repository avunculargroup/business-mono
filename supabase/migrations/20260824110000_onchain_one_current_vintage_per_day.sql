-- Restore the "one current vintage per (indicator, day)" invariant on
-- onchain_observations, and enforce it in the database.
--
-- Why: the poll loaded an indicator's current rows with an unbounded PostgREST
-- select, which silently truncates at max-rows (1000). Every day outside that
-- window looked like it had no observation, so the poll inserted a second row
-- for the day and marked it current too — ~1,640 duplicate rows per run for
-- btc_price_usd alone, until 2,643 days of price history carried 77,144 current
-- rows. v_btc_mvrv joins the price, supply and realised-cap series on
-- observed_at, so the duplicates multiplied: 15.8M join rows, and
-- v_onchain_dashboard took 27s against an 8s statement_timeout. PostgREST
-- returned 500, and the dashboard's indicator read turned that into a 500 on
-- GET /.
--
-- The reader fix is in apps/agents/src/lib/onchain/runOnchainPoll.ts. This
-- migration cleans up what the bug wrote and makes the class of bug impossible.

-- Demote every superseded vintage, keeping the most recently ingested row for
-- each (indicator, day). Nothing is deleted: the vintages stay on the table as
-- history, exactly as a genuine revision would.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY indicator_id, observed_at
           ORDER BY ingested_at DESC, id DESC
         ) AS rn
    FROM onchain_observations
   WHERE is_current
)
UPDATE onchain_observations o
   SET is_current = FALSE
  FROM ranked r
 WHERE o.id = r.id
   AND r.rn > 1;

-- The invariant the views already assume, now enforced. The poll demotes the
-- prior vintage before inserting the new one, so a genuine revision still
-- satisfies this; a truncated read that re-inserts a day does not.
CREATE UNIQUE INDEX IF NOT EXISTS uq_onchain_obs_current
  ON onchain_observations (indicator_id, observed_at)
  WHERE is_current;

ANALYZE onchain_observations;
