-- ============================================================
-- FINDINGS ENGINE — deterministic config + market_reports
-- Spec: docs/features/findings-engine-spec.md
--
-- The daily market report's insight layer: findings are computed
-- deterministically (apps/agents/src/lib/findings/), scored for
-- materiality, narrated by the internal marketAnalyst agent, linted
-- mechanically, and reviewed by Lex before the narration is allowed
-- into the report email. These tables carry the config the computors
-- and the materiality function read, plus the persisted daily report.
--
-- Metric keys: onchain_indicators.key as-is; macro series use
-- 'macro:<slug(short_label)>' (macroMetricKey in @platform/shared).
-- The config loader validates every seeded key against the live
-- catalogs and drops (with a log) any row it cannot resolve.
-- ============================================================

-- ------------------------------------------------------------
-- Per-group scoring config: thesis weight, volatility class,
-- and the vocabulary the narrator is permitted to use.
-- metric_group values = onchain_indicators.metric_group and
-- economic_indicators.category.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS finding_metric_config (
  metric_group   TEXT PRIMARY KEY,
  thesis_weight  NUMERIC(4,2) NOT NULL DEFAULT 1.00,  -- static prior; CFO/liquidity thesis
  vol_class      TEXT NOT NULL DEFAULT 'low'          -- drives the persistence guard
                 CHECK (vol_class IN ('low','high')),
  allowed_vocab  TEXT[] NOT NULL DEFAULT '{}',        -- words the narrator MAY use
  notes          TEXT
);

INSERT INTO finding_metric_config (metric_group, thesis_weight, vol_class, allowed_vocab, notes) VALUES
  ('money_supply',        1.40, 'low',  ARRAY['liquidity','expansion','contraction','easing','tightening']::TEXT[],
     'Core to the treasury/liquidity thesis — weighted up.'),
  ('policy_rate',         1.30, 'low',  ARRAY['policy','tightening','easing','hold','cut','hike']::TEXT[],
     'Meeting-driven; monthly granularity.'),
  ('behaviour_valuation', 1.20, 'high', ARRAY['on-chain activity','usage','holder behaviour']::TEXT[],
     'Contains valuation-sensitive metrics — see finding_thresholds.'),
  ('network_security',    1.10, 'high', ARRAY['hash rate','difficulty','miner economics','fee share','tightening','easing']::TEXT[],
     'High daily noise; capitulation vocab is NOT here — it lives only on the hash-ribbons state-transition finding.'),
  ('trend_valuation',     1.00, 'high', ARRAY['trend','momentum','range','volatility','drawdown']::TEXT[],
     'Valuation-sensitive members gated via finding_thresholds.'),
  ('fx',                  0.90, 'high', ARRAY['dollar','strength','weakness']::TEXT[], NULL),
  ('commodity',           0.80, 'high', ARRAY['gold','store of value']::TEXT[], NULL),
  ('equity',              0.90, 'high', ARRAY['risk appetite','risk-on','risk-off']::TEXT[], NULL),
  ('bond_yield',          0.90, 'high', ARRAY['yields','duration']::TEXT[], NULL),
  ('inflation',           1.10, 'low',  ARRAY['inflation','price pressure','disinflation']::TEXT[], NULL),
  ('activity',            0.80, 'low',  ARRAY['activity','confidence','sentiment']::TEXT[], NULL),
  ('market_snapshot',     0.70, 'high', ARRAY['price','sentiment']::TEXT[],
     'Context group; rarely leads a report on its own.')
ON CONFLICT (metric_group) DO NOTHING;

-- The words 'capitulation'/'recovery' appear in NO group's allowed_vocab by
-- design: they are attached only to a hash_ribbons state-transition finding by
-- the inflection computor (the "capitulation lock").

-- ------------------------------------------------------------
-- Declared divergence pairs. Curated only — never all-pairs.
-- The finding fires when the trailing correlation flips sign
-- or |corr| falls below the band it normally holds.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS finding_divergence_pairs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  primary_key       TEXT NOT NULL,   -- unified metric key
  secondary_key     TEXT NOT NULL,   -- unified metric key
  expected_sign     TEXT NOT NULL CHECK (expected_sign IN ('positive','negative')),
  corr_window_days  INT  NOT NULL DEFAULT 60,
  break_threshold   NUMERIC(3,2) NOT NULL DEFAULT 0.35, -- |corr| below this = break
  thesis_note       TEXT,
  active            BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (primary_key, secondary_key)
);

INSERT INTO finding_divergence_pairs
  (primary_key, secondary_key, expected_sign, corr_window_days, break_threshold, thesis_note) VALUES
  -- 540d ≈ 18 monthly prints once the pair is resampled to US M2's monthly
  -- granularity — 90d over a monthly series would be only 3 points.
  ('btc_price_usd',      'macro:us_m2',   'positive', 540, 0.30, 'The liquidity thesis — the headline pair for CFOs.'),
  ('btc_price_usd',      'macro:s_p_500', 'positive',  60, 0.35, 'Risk-on / risk-off coupling.'),
  ('btc_price_usd',      'macro:gold',    'positive',  90, 0.30, 'Store-of-value narrative.'),
  ('btc_price_usd',      'macro:dxy',     'negative',  60, 0.35, 'Dollar inverse; break = decoupling from the dollar.'),
  ('active_addresses',   'btc_price_usd', 'positive',  60, 0.35, 'Usage vs price — thin usage into strength is notable.'),
  ('miner_revenue_total','hash_rate',     'positive',  60, 0.40, 'Miner economics — revenue falling while hash holds.')
ON CONFLICT (primary_key, secondary_key) DO NOTHING;

-- hash_rate x difficulty is intentionally NOT a pair: they track by
-- construction; a gap there means an adjustment is loading (an inflection).

-- ------------------------------------------------------------
-- Named threshold crossings. Pre-registered levels only.
-- valuation_sensitive rows route the narration through Lex.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS finding_thresholds (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_key        TEXT NOT NULL,          -- unified metric key
  level_name        TEXT NOT NULL,          -- human label for the level
  level_value       NUMERIC NOT NULL,
  cross_direction   TEXT NOT NULL CHECK (cross_direction IN ('up','down','either')),
  compliance_class  TEXT NOT NULL DEFAULT 'valuation_sensitive'
                    CHECK (compliance_class IN ('informational','valuation_sensitive')),
  active            BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (metric_key, level_name)
);

INSERT INTO finding_thresholds
  (metric_key, level_name, level_value, cross_direction, compliance_class) VALUES
  ('mvrv',          'MVRV 1.0',            1.0,  'either', 'valuation_sensitive'),
  ('mvrv',          'MVRV 3.0',            3.0,  'either', 'valuation_sensitive'),
  ('mayer_multiple','Mayer 1.0',           1.0,  'either', 'valuation_sensitive'),
  ('mayer_multiple','Mayer 2.4',           2.4,  'either', 'valuation_sensitive'),
  ('rsi_14',        'RSI 30 (oversold)',   30.0, 'down',   'valuation_sensitive'),
  ('rsi_14',        'RSI 70 (overbought)', 70.0, 'up',     'valuation_sensitive'),
  ('ma_cross',      '50d crosses 200d',    0.0,  'either', 'valuation_sensitive'),
  ('fear_greed',    'F&G 25 (fear band)',  25.0, 'either', 'informational'),
  ('fear_greed',    'F&G 75 (greed band)', 75.0, 'either', 'informational')
ON CONFLICT (metric_key, level_name) DO NOTHING;

-- btc_price_usd through ma_200w is a threshold too, but the level is dynamic
-- (a moving average). The threshold computor computes it against v_btc_trend
-- rather than seeding a fixed level_value here.

-- ------------------------------------------------------------
-- Human watch boosts (curator-note analogue). Optional input to
-- materiality: temporarily lifts thesis_weight for a group or pair.
-- No UI yet — rows are inserted directly.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS finding_watch (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type TEXT NOT NULL CHECK (target_type IN ('metric_group','pair')),
  target_ref  TEXT NOT NULL,                  -- metric_group name, or 'primary_key|secondary_key'
  boost       NUMERIC(3,2) NOT NULL DEFAULT 1.50,
  note        TEXT,                            -- WHY — retained as audit context
  created_by  UUID REFERENCES team_members(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_finding_watch_active ON finding_watch(expires_at);

-- ------------------------------------------------------------
-- The persisted daily report. One row per report date; the
-- pipeline upserts on as_of so a re-run overwrites the day.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS market_reports (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  as_of              DATE NOT NULL UNIQUE,     -- UTC date, matching onchain_observations.observed_at
  -- published = narration passed lint + Lex and went into the email;
  -- held = it failed and was withheld (email sent without it);
  -- error = the pipeline failed before producing a narration.
  status             TEXT NOT NULL CHECK (status IN ('published','held','error')),
  report_mode        TEXT NOT NULL CHECK (report_mode IN ('normal','quiet')),
  narration_markdown TEXT,                     -- null when status = 'error'
  findings           JSONB NOT NULL DEFAULT '[]',  -- selected Finding records (audit trail)
  ops_findings       JSONB NOT NULL DEFAULT '[]',  -- staleness set — ops only, never narrated
  lint_result        JSONB,
  lex_result         JSONB,
  emailed            BOOLEAN NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS market_reports_updated_at ON market_reports;
CREATE TRIGGER market_reports_updated_at
  BEFORE UPDATE ON market_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ------------------------------------------------------------
-- RLS — the agents server writes through service_role; the web
-- app reads as authenticated. Same policy shape as every other
-- agent-written table (see 20260330000000).
-- ------------------------------------------------------------
ALTER TABLE finding_metric_config    ENABLE ROW LEVEL SECURITY;
ALTER TABLE finding_divergence_pairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE finding_thresholds       ENABLE ROW LEVEL SECURITY;
ALTER TABLE finding_watch            ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_reports           ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "finding_metric_config_all" ON finding_metric_config;
CREATE POLICY "finding_metric_config_all" ON finding_metric_config
  FOR ALL
  USING      (auth.role() IN ('authenticated', 'service_role'))
  WITH CHECK (auth.role() IN ('authenticated', 'service_role'));

DROP POLICY IF EXISTS "finding_divergence_pairs_all" ON finding_divergence_pairs;
CREATE POLICY "finding_divergence_pairs_all" ON finding_divergence_pairs
  FOR ALL
  USING      (auth.role() IN ('authenticated', 'service_role'))
  WITH CHECK (auth.role() IN ('authenticated', 'service_role'));

DROP POLICY IF EXISTS "finding_thresholds_all" ON finding_thresholds;
CREATE POLICY "finding_thresholds_all" ON finding_thresholds
  FOR ALL
  USING      (auth.role() IN ('authenticated', 'service_role'))
  WITH CHECK (auth.role() IN ('authenticated', 'service_role'));

DROP POLICY IF EXISTS "finding_watch_all" ON finding_watch;
CREATE POLICY "finding_watch_all" ON finding_watch
  FOR ALL
  USING      (auth.role() IN ('authenticated', 'service_role'))
  WITH CHECK (auth.role() IN ('authenticated', 'service_role'));

DROP POLICY IF EXISTS "market_reports_all" ON market_reports;
CREATE POLICY "market_reports_all" ON market_reports
  FOR ALL
  USING      (auth.role() IN ('authenticated', 'service_role'))
  WITH CHECK (auth.role() IN ('authenticated', 'service_role'));
