-- ============================================================
-- brand_visual — the versioned visual canon for generated social images
-- ============================================================
-- Spec: docs/features/social-post-image/feature-spec.md
--
-- The image step of social_post_from_news never lets an LLM write the prompt
-- the image model receives. It writes a structured brief; a pure function
-- (buildImagePrompt in apps/agents) joins that brief to the canon held here.
-- Holding the canon as data, next to brand_voice, lets the founders tune it
-- from /brand without a deploy, and every image records the version it used.
--
-- Singleton at the application layer (same as brand_voice and
-- company_profile): one row has is_active = true. No DB uniqueness constraint.
--
-- prohibited_block is sent to the image model; prohibited_terms is not — it
-- feeds the deterministic brief linter, which rejects a brief naming any of
-- them before a render is paid for.
--
-- Also widens model_configs.scope_type to admit 'image_step': an image scope
-- resolves to a model id string, not a LanguageModel, so the settings UI and
-- resolver treat it separately.
-- ============================================================

CREATE TABLE IF NOT EXISTS brand_visual (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  version               TEXT        NOT NULL DEFAULT '1.0',
  is_active             BOOLEAN     NOT NULL DEFAULT true,
  style_block           TEXT        NOT NULL,
  palette               JSONB       NOT NULL DEFAULT '[]'::jsonb,   -- [{ role, hex, usage }]
  composition_block     TEXT        NOT NULL,
  prohibited_block      TEXT        NOT NULL,
  prohibited_terms      TEXT[]      NOT NULL DEFAULT '{}',
  motifs                JSONB       NOT NULL DEFAULT '[]'::jsonb,   -- [{ key, label, description, use_when, is_active }]
  style_anchor_paths    TEXT[]      NOT NULL DEFAULT '{}',
  default_aspect_ratio  TEXT        NOT NULL DEFAULT '16:9',
  brand_mark            JSONB       NOT NULL DEFAULT
    '{"enabled": true, "position": "bottom_right", "height_pct": 9, "margin_pct": 4, "opacity": 1}'::jsonb,
  notes                 TEXT,
  updated_by            UUID        REFERENCES team_members(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER brand_visual_updated_at
  BEFORE UPDATE ON brand_visual
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE brand_visual ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "brand_visual_team" ON brand_visual;
CREATE POLICY "brand_visual_team" ON brand_visual
  FOR ALL USING (is_team_member());

-- ── Seed: canon v1.0 ─────────────────────────────────────────────────────────
-- Light, sketch style (decided 2026-11-07). Derived from the bts-design skill's
-- Visual foundations / Imagery vibe. Only seeded when no row exists, so a
-- re-run never overwrites a canon the founders have edited.

INSERT INTO brand_visual (
  version, is_active, style_block, palette, composition_block, prohibited_block,
  prohibited_terms, motifs, default_aspect_ratio, notes
)
SELECT
  '1.0',
  true,
  $canon$A hand-drawn sketch in graphite pencil and fine ink on warm off-white paper.
Loose, confident linework from a skilled hand: some lines drawn twice, light
construction lines left visible, light cross-hatching for shade. It should look
like a page from an architect's or engineer's sketchbook, drawn to think
something through. One focal idea with generous empty paper; the subject fills
no more than about 60% of the frame. Calm, considered and quietly confident.
Warm in tone, never cool.$canon$,
  '[
    {"role": "Paper", "hex": "#FAFAF8", "usage": "warm off-white. Clean and even, no visible paper grain, stains or vignette."},
    {"role": "Main linework", "hex": "#1A1915", "usage": "warm near-black graphite and ink."},
    {"role": "Lighter strokes and hatching", "hex": "#6B6860", "usage": "warm grey."},
    {"role": "Accent", "hex": "#C9A84C", "usage": "a single light wash or stroke of muted gold on ONE element only."}
  ]'::jsonb,
  $canon$Front-on or gentle three-quarter view; no dramatic perspective. Asymmetric
balance with clear empty paper on at least one side. Keep every important
element inside the central 80% of the frame, so the image survives platform
crops. Leave the bottom-right corner (roughly the lowest and rightmost 15% of
the frame) as empty paper.$canon$,
  $canon$Never include: text, letters, numbers, labels, logos, watermarks or signatures.
Coins of any kind, currency symbols, gold bars, piles of money, rockets, moons,
bulls or bears, price charts, candlesticks, arrows pointing up or down, trading
screens. People's faces, hands holding phones, office stock-photo scenes. Neon,
dark backgrounds, colour beyond the palette, 3D renders, photorealism, digital
vector polish, cartoon, comic, caricature or childlike doodle styles, mascots,
paper texture or film grain.$canon$,
  ARRAY['coin', 'coins', 'rocket', 'moon', 'chart', 'candlestick', 'arrow', '₿', '$', 'bull', 'bear', 'lambo'],
  '[
    {"key": "ledger", "label": "Ledger", "description": "Ruled ledger lines, columns, a single highlighted entry", "use_when": "Accounting treatment, reporting, disclosure", "is_active": true},
    {"key": "vault", "label": "Vault", "description": "A simple vault door or strongbox in outline", "use_when": "Custody, preservation, security", "is_active": true},
    {"key": "balance", "label": "Balance", "description": "A two-pan balance scale, level or gently weighted", "use_when": "Risk management, trade-offs, policy decisions", "is_active": true},
    {"key": "architecture", "label": "Architecture", "description": "Columns, foundations, an elevation drawing", "use_when": "Treasury structure, governance frameworks", "is_active": true},
    {"key": "timepiece", "label": "Timepiece", "description": "Hourglass, clock face, long time horizons", "use_when": "Time preference, long-term holding, cycles", "is_active": true},
    {"key": "survey", "label": "Survey", "description": "Contour lines, compass, a surveyed boundary", "use_when": "Regulation, navigating unfamiliar ground", "is_active": true},
    {"key": "network", "label": "Network", "description": "Nodes joined by fine lines, evenly distributed", "use_when": "The Bitcoin network, decentralisation, adoption", "is_active": true},
    {"key": "instrument", "label": "Instrument", "description": "A gauge or measuring instrument, needle at rest", "use_when": "Indicators, measurement, monitoring", "is_active": true},
    {"key": "document", "label": "Document", "description": "Folded papers, a seal, a signed page (no legible text)", "use_when": "Policy, standards, legislation, board papers", "is_active": true},
    {"key": "horizon", "label": "Horizon", "description": "A single landscape line with a low sun or moon-free sky", "use_when": "Macro, monetary conditions, the long view", "is_active": true}
  ]'::jsonb,
  '16:9',
  'Canon v1.0 (2026-11-07): light only, sketch style, one gold accent. The BTS mark is composited by code after render and never generated. See docs/features/social-post-image/feature-spec.md.'
WHERE NOT EXISTS (SELECT 1 FROM brand_visual);

-- ── model_configs: admit image_step scopes ───────────────────────────────────

ALTER TABLE model_configs DROP CONSTRAINT IF EXISTS model_configs_scope_type_check;
ALTER TABLE model_configs ADD CONSTRAINT model_configs_scope_type_check
  CHECK (scope_type IN ('agent', 'workflow_step', 'image_step'));
