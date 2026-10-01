-- ============================================================
-- CORPORATE HOLDINGS — holdings vocabulary
-- Spec: docs/features/corporate-holdings/schema-ingest-spec.md
--       → Holdings: encumbrance, wrappers and conventions (sequencing step 3)
--       and the 29 September decisions on encumbrance and non-bitcoin assets.
--
-- Two departures from the step as first written, both settled by the
-- decisions:
--   - No `pledged_collateral` basis. Encumbrance is a flag, not a basis:
--     pledged bitcoin is direct spot in every respect but who has a claim on
--     it, and a company can pledge part of a holding.
--   - No `asset_class` on snapshots. They already carry `asset` (default
--     'btc'), which is the column the spec asked for under another name.
-- ============================================================


-- ------------------------------------------------------------
-- 1. ETF-wrapped exposure
--
-- Goodfood holds spot ETF units and has never stated a coin count; the 25 BTC
-- on the trackers is a third party's look-through of a dollar figure. Never
-- comparable, so it never enters an aggregate.
-- ------------------------------------------------------------

INSERT INTO holding_bases (code, label, description, comparable) VALUES
  ('etf_wrapped', 'ETF-wrapped', 'Exposure held as units of an exchange-traded fund, not as coins', FALSE)
ON CONFLICT (code) DO NOTHING;


-- ------------------------------------------------------------
-- 2. Encumbrance
--
-- Locate's lender covenant, Panther's collateral pledge, Sequans' convertible
-- debt: for a mid-market company what ranks ahead of the holding matters more
-- than its size. The basis stays direct_spot for the comparable remainder.
-- A holding_encumbrances child table only when a second simultaneous creditor
-- appears.
-- ------------------------------------------------------------

ALTER TABLE treasury_holdings_snapshots
  ADD COLUMN IF NOT EXISTS encumbered_quantity      NUMERIC(24,8),
  ADD COLUMN IF NOT EXISTS encumbrance_counterparty TEXT,   -- the lender, or the instrument secured
  ADD COLUMN IF NOT EXISTS encumbrance_obligation   TEXT;   -- what the pledge secures

ALTER TABLE treasury_holdings_snapshots DROP CONSTRAINT IF EXISTS snapshots_encumbrance_within_holding;
ALTER TABLE treasury_holdings_snapshots ADD CONSTRAINT snapshots_encumbrance_within_holding
  CHECK (encumbered_quantity IS NULL OR (encumbered_quantity >= 0 AND encumbered_quantity <= quantity));

-- A bare number is the thing the decision rejected: an encumbrance names
-- what it secures.
ALTER TABLE treasury_holdings_snapshots DROP CONSTRAINT IF EXISTS snapshots_encumbrance_explained;
ALTER TABLE treasury_holdings_snapshots ADD CONSTRAINT snapshots_encumbrance_explained
  CHECK (COALESCE(encumbered_quantity, 0) = 0 OR encumbrance_obligation IS NOT NULL);


-- ------------------------------------------------------------
-- 3. Cost-basis convention
--
-- Strategy states aggregate cost inclusive of fees and expenses; Metaplanet
-- states it net of them. Ranking across the two compares different
-- measurements. treasury_events.fees_included covers the per-event case.
-- ------------------------------------------------------------

ALTER TABLE research_companies
  ADD COLUMN IF NOT EXISTS cost_basis_convention TEXT
    CHECK (cost_basis_convention IN ('inclusive_of_fees', 'net_of_fees', 'unstated'));

UPDATE research_companies SET cost_basis_convention = 'inclusive_of_fees'
 WHERE slug = 'strategy' AND cost_basis_convention IS NULL;
UPDATE research_companies SET cost_basis_convention = 'net_of_fees'
 WHERE slug = 'metaplanet' AND cost_basis_convention IS NULL;


-- ------------------------------------------------------------
-- 4. Holding status
--
-- A zero snapshot means different things for a company that exited, one that
-- is active and between purchases, and one that never held. The page states
-- which rather than inferring it. NULL means not yet assessed.
-- ------------------------------------------------------------

ALTER TABLE research_companies
  ADD COLUMN IF NOT EXISTS holding_status TEXT
    CHECK (holding_status IN ('active', 'exited', 'never_held')),
  ADD COLUMN IF NOT EXISTS exited_on DATE;

ALTER TABLE research_companies DROP CONSTRAINT IF EXISTS research_companies_exit_dated;
ALTER TABLE research_companies ADD CONSTRAINT research_companies_exit_dated
  CHECK ((holding_status IS NOT DISTINCT FROM 'exited') = (exited_on IS NOT NULL));

-- Sequans sold its last 314 BTC on 24 September 2026; its zero snapshot and
-- the disposal event are both dated that day.
UPDATE research_companies SET holding_status = 'exited', exited_on = '2026-09-24'
 WHERE slug = 'sequans' AND holding_status IS NULL;


-- ------------------------------------------------------------
-- 5. Restricted metrics
--
-- So Lex matches on data rather than prose. Strategy, Metaplanet and RUM
-- Group publish these in primary filings, which is the point: a primary
-- source does not make a metric publishable. The drafted client_summary
-- treats this list as a hard filter.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS restricted_metrics (
  code    TEXT PRIMARY KEY,
  label   TEXT NOT NULL,
  aliases TEXT[] NOT NULL DEFAULT '{}',   -- spellings to match, case-insensitive
  reason  TEXT NOT NULL
);

INSERT INTO restricted_metrics (code, label, aliases, reason) VALUES
  ('btc_yield',  'BTC Yield', ARRAY['BTC Yield', 'bitcoin yield'],
   'An issuer-defined performance metric, not a yield in any regulated sense'),
  ('btc_gain',   'BTC Gain', ARRAY['BTC Gain', 'bitcoin gain'],
   'An issuer-defined performance metric expressed in bitcoin'),
  ('btc_yen_gain', 'BTC ¥ Gain', ARRAY['BTC ¥ Gain', 'BTC Yen Gain'],
   'An issuer-defined performance metric expressed in yen'),
  ('effective_net_acquisition_cost', 'Effective net acquisition cost',
   ARRAY['effective net acquisition cost'],
   'An issuer-defined cost measure that nets other items against purchases'),
  ('mnav', 'mNAV', ARRAY['mNAV', 'multiple of net asset value', 'market NAV'],
   'A valuation multiple: how the market prices the issuer, which is outcome rather than implementation'),
  ('btc_per_share', 'BTC per share', ARRAY['BTC per share', 'bitcoin per share', 'sats per share'],
   'An issuer-defined per-share measure that invites comparison as a return')
ON CONFLICT (code) DO NOTHING;

ALTER TABLE restricted_metrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "restricted_metrics_team" ON restricted_metrics;
CREATE POLICY "restricted_metrics_team" ON restricted_metrics
  FOR ALL USING (is_team_member());
