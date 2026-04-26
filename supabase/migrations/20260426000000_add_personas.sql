-- ============================================================
-- PHASE 2 — PERSONA MANAGEMENT
-- ============================================================
-- personas: Ideal client archetypes used by Della for contextual
--   inference and by Content Creator for tailored drafting.
--   No foreign key to contacts — Della infers at query time.
-- ============================================================

DO $$ BEGIN
  CREATE TYPE persona_market_segment AS ENUM (
    'sme',
    'public_company',
    'family_office',
    'hnw',
    'startup',
    'superannuation'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE persona_sophistication_level AS ENUM (
    'novice',
    'intermediate',
    'expert'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE persona_decision_style AS ENUM (
    'data_driven',
    'consensus_seeking',
    'risk_averse',
    'opportunistic',
    'process_oriented'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS personas (
  id                     UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   TEXT         NOT NULL UNIQUE,
  market_segment         persona_market_segment NOT NULL,

  sophistication_level   persona_sophistication_level NOT NULL DEFAULT 'intermediate',
  estimated_aum          TEXT,

  -- { north_star, anti_goal, decision_making_style, time_horizon, risk_tolerance, custom_traits[] }
  psychographic_profile  JSONB        DEFAULT '{}',

  -- { regulatory_hurdles[], gatekeepers[], preferred_mediums[], approval_layers, budget_approval_cycle }
  strategic_constraints  JSONB        DEFAULT '{}',

  -- { resonant_phrases[], success_indicators[], pain_point_keywords[] }
  success_signals        JSONB        DEFAULT '{}',

  objection_bank         TEXT[]       NOT NULL DEFAULT '{}',
  notes                  TEXT,

  created_by             UUID         REFERENCES team_members(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER personas_updated_at
  BEFORE UPDATE ON personas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_personas_market_segment  ON personas(market_segment);
CREATE INDEX IF NOT EXISTS idx_personas_sophistication   ON personas(sophistication_level);
CREATE INDEX IF NOT EXISTS idx_personas_created          ON personas(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_personas_psychographic    ON personas USING gin(psychographic_profile);
CREATE INDEX IF NOT EXISTS idx_personas_success_signals  ON personas USING gin(success_signals);

ALTER TABLE personas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team members can read personas" ON personas;
CREATE POLICY "Team members can read personas"
  ON personas FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Team members can write personas" ON personas;
CREATE POLICY "Team members can write personas"
  ON personas FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
