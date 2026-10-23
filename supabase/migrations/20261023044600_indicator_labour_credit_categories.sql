-- ── Economic indicators: labour and credit categories ───────────────────────
--
-- The AU expansion (docs/features/economic-indicators/abs-activation-spec.md)
-- adds unemployment and wage rows ('labour') and total credit ('credit'). Both
-- join the eight existing categories.
--
-- The findings engine groups active macro rows by category and reads each
-- group's weight and vocabulary from finding_metric_config. A category missing
-- there falls back to weight 1.0 with an empty vocabulary, and the phrase linter
-- then rejects any sentence about it — so the config rows land with the
-- constraint, before any row in either category is active.
--
-- Thesis weights are proposals (see the spec's open questions). Credit sits just
-- under money_supply (1.40): it is the private-sector half of the same liquidity
-- story. Labour sits below inflation: the thesis runs through money, not jobs.

ALTER TABLE economic_indicators DROP CONSTRAINT IF EXISTS economic_indicators_category_check;
ALTER TABLE economic_indicators
  ADD CONSTRAINT economic_indicators_category_check
  CHECK (category IN ('policy_rate','money_supply','inflation','activity',
                      'fx','commodity','equity','bond_yield','labour','credit'));

INSERT INTO finding_metric_config (metric_group, thesis_weight, vol_class, allowed_vocab) VALUES
  ('labour', 0.90, 'low', ARRAY['labour market','employment','unemployment','wages','wage growth']::TEXT[]),
  ('credit', 1.20, 'low', ARRAY['credit','credit growth','lending','leverage','expansion','contraction']::TEXT[])
ON CONFLICT (metric_group) DO NOTHING;

-- The commodity vocabulary was written for gold alone; the RBA Index of
-- Commodity Prices needs words for export prices too. Guarded so a re-run does
-- not append the same words twice.
UPDATE finding_metric_config
SET allowed_vocab = allowed_vocab || ARRAY['commodity prices','export prices','terms of trade']::TEXT[]
WHERE metric_group = 'commodity'
  AND NOT ('commodity prices' = ANY (allowed_vocab));
