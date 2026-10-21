-- ============================================================
-- CORPORATE HOLDINGS — what the company does, and how big it is
--
-- The subscriber summary could only say how an entity holds bitcoin,
-- because the facts it is drafted from were all about the holding. A
-- reader meeting a company for the first time needs to know what it is
-- before they know how it holds anything. Two field keys are added so
-- that comes from a cited filing rather than from a model's general
-- knowledge:
--
--   business_description  what the company does: its business lines,
--                         products and markets, as the filing states them
--   headcount             employees at a stated date — the one size
--                         measure that is not a value
--
-- Both are classed `implementation`, so they reach /register and the
-- summary draft. That is a judgement, recorded here so it can be
-- reviewed:
--   - A business description is what the company is, not how it is
--     faring. It sits with `identity`, not with `operating_metric`.
--   - Size is stated as headcount and never as market capitalisation,
--     revenue or assets. Market capitalisation is share price, and
--     revenue and assets are how the business is going; all three are
--     outcome-shaped. `market_cap_band` stays a team-only peer-matching
--     input.
--
-- Accepted sources are everything `identity` accepts except company_web.
-- Marketing copy describes a company the way it wants to be described,
-- which is the divergence the archetype columns exist to catch.
-- ============================================================

INSERT INTO field_source_minimums (field_key, rationale, client_fact_class) VALUES
  ('business_description', 'What the company does, from a filed or regulated description — not marketing copy', 'implementation'),
  ('headcount',            'Employees at a stated date, as the filing reports them',                          'implementation')
ON CONFLICT (field_key) DO NOTHING;

INSERT INTO field_source_classes (field_key, source_class)
SELECT f.field_key, c.source_class
  FROM (VALUES
    ('business_description', ARRAY['regulated_disclosure','exchange_announcement','audited_accounts','filed_financials','filed_narrative','furnished_release']),
    ('headcount',            ARRAY['regulated_disclosure','exchange_announcement','audited_accounts','filed_financials','filed_narrative','furnished_release'])
  ) AS f(field_key, classes)
  CROSS JOIN LATERAL unnest(f.classes) AS c(source_class)
ON CONFLICT DO NOTHING;
