-- ============================================================
-- CONSOLIDATE COMPANY IDENTITY ONTO company_profile
-- ============================================================
-- Depends on: 20260424000000_add_company_records.sql
--             20260911010000_compliance_documents.sql
--
-- The company's legal identity lived in two places.
--
--   company_records   EAV, team-only, user-extensible from
--                     /company. 20260424000000 seeded built-in
--                     types for legal_name, trading_name, abn,
--                     acn and website, and they were filled in.
--
--   company_profile   Typed singleton, created in
--                     20260911010000 for the Service Statement
--                     and the /prepare front matter. Never
--                     filled in, because doing so meant typing
--                     the same five values a second time.
--
-- Three consumers read one or the other: the newsletter footer
-- and the news digest email read company_records, while the
-- Minute gate, the /prepare front matter and /compliance read
-- company_profile. They have not disagreed yet only because the
-- second copy was still empty. assembly.ts already carried an
-- alias map (bts_abn -> abn, public_website -> website) to
-- reconcile the two naming schemes.
--
-- company_profile wins, and the reason is RLS rather than taste.
-- A subscriber has to read legal identity to render the Service
-- Statement, and company_profile already carries
-- company_profile_client_read. company_records is team-only and
-- its types are user-extensible from the UI, so opening it to
-- subscribers would mean an allowlist policy on type_key that
-- the next custom record type silently escapes. It is also EAV,
-- which would make "the field is blank" and "the type does not
-- exist" the same answer to resolveDocument — the one
-- distinction that function exists to draw.
--
-- ON SEEDING. 20260911010000 says nothing in it is seeded,
-- because a placeholder ABN ships to whoever reads the export.
-- This migration writes an ABN into company_profile and is not a
-- breach of that rule: every value is copied from a row a
-- founder typed, and where they typed nothing the INSERT is a
-- no-op.
-- ============================================================


-- ------------------------------------------------------------
-- Copy the five overlapping values across
-- ------------------------------------------------------------
-- legal_name and trading_name are NOT NULL, so a profile row can
-- only be built when both exist. Where they do not, this inserts
-- nothing and the cleanup below is skipped in turn — an
-- incomplete copy that deleted the originals would lose data.
--
-- abn and acn were seeded is_singleton = false, so more than one
-- row of each is possible. The ORDER BY picks the same one every
-- time rather than whichever the planner happens to return.
--
-- ON CONFLICT DO NOTHING: if someone has already filled the form
-- at /compliance, what they typed there is the newer answer and
-- the records are the stale copy.
-- ------------------------------------------------------------

INSERT INTO company_profile (id, legal_name, trading_name, abn, acn, public_website)
SELECT TRUE, p.legal_name, p.trading_name, p.abn, p.acn, p.website
FROM (
  SELECT
    (SELECT btrim(value) FROM company_records
      WHERE type_key = 'legal_name'   AND NULLIF(btrim(value), '') IS NOT NULL
      ORDER BY display_order, created_at LIMIT 1) AS legal_name,
    (SELECT btrim(value) FROM company_records
      WHERE type_key = 'trading_name' AND NULLIF(btrim(value), '') IS NOT NULL
      ORDER BY display_order, created_at LIMIT 1) AS trading_name,
    (SELECT btrim(value) FROM company_records
      WHERE type_key = 'abn'          AND NULLIF(btrim(value), '') IS NOT NULL
      ORDER BY display_order, created_at LIMIT 1) AS abn,
    (SELECT btrim(value) FROM company_records
      WHERE type_key = 'acn'          AND NULLIF(btrim(value), '') IS NOT NULL
      ORDER BY display_order, created_at LIMIT 1) AS acn,
    (SELECT btrim(value) FROM company_records
      WHERE type_key = 'website'      AND NULLIF(btrim(value), '') IS NOT NULL
      ORDER BY display_order, created_at LIMIT 1) AS website
) p
WHERE p.legal_name IS NOT NULL
  AND p.trading_name IS NOT NULL
ON CONFLICT (id) DO NOTHING;


-- ------------------------------------------------------------
-- Retire the duplicated record types
-- ------------------------------------------------------------
-- The types go, not just the rows. Leaving them would let
-- someone add a second legal_name from /company tomorrow, which
-- is the thing being fixed — and deleteCompanyRecordType refuses
-- to remove a built-in, so the UI could not undo it either.
--
-- Both statements are guarded on a profile row existing. If the
-- copy above found nothing to copy, the originals stay exactly
-- where they are.
--
-- tagline, logo, mission, vision, values, about and cert_incorp
-- are untouched. They are free-form company reference material
-- with no fixed schema and no subscriber reading them, which is
-- what company_records is good at.
-- ------------------------------------------------------------

DELETE FROM company_records
WHERE type_key IN ('legal_name', 'trading_name', 'abn', 'acn', 'website')
  AND EXISTS (SELECT 1 FROM company_profile);

DELETE FROM company_record_types
WHERE key IN ('legal_name', 'trading_name', 'abn', 'acn', 'website')
  AND EXISTS (SELECT 1 FROM company_profile);


COMMENT ON TABLE company_profile IS
  'Singleton, and the only home for the company''s legal identity. Read by the Minute gate, the /prepare front matter, the newsletter footer and the news digest email; written from /compliance. company_records holds free-form reference material (tagline, logo, mission) and deliberately no longer holds a name, ABN, ACN or website.';


-- ------------------------------------------------------------
-- Verification
-- ------------------------------------------------------------
-- Should return one row, with the five values that were in
-- company_records:
--   SELECT legal_name, trading_name, abn, acn, public_website
--   FROM company_profile;
--
-- Should return zero rows:
--   SELECT * FROM company_record_types
--   WHERE key IN ('legal_name', 'trading_name', 'abn', 'acn', 'website');
--
-- If that second query returns rows, the copy found no
-- legal_name/trading_name pair to build a profile from and stood
-- down rather than deleting anything. Fill the profile in at
-- /compliance, then re-run the two DELETEs above by hand.
--
-- The eight remaining profile fields — registered address, state
-- and postcode, public phone and email, and the three complaints
-- fields — existed nowhere in the schema before now and are
-- still blank. Nothing can copy them; they have to be typed at
-- /compliance before the Service Statement can go active.
-- ------------------------------------------------------------
