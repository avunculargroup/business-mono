-- ============================================================
-- CORPORATE HOLDINGS — drop the per-scheme identifier columns
-- Spec: docs/features/corporate-holdings/schema-ingest-spec.md
--       → Identity, jurisdiction and calendars
--
-- The contract half of 20261001100000, which copied acn/abn/arbn/isin/lei into
-- company_identifiers and left the columns for the deploy to catch up. Nothing
-- reads them now.
-- ============================================================

-- Refuse to drop a value that was never copied. Every environment that ran
-- 20261001100000 passes; one that wrote to these columns since would lose data.
DO $$
DECLARE missing INT;
BEGIN
  SELECT count(*) INTO missing
    FROM research_companies c
   CROSS JOIN LATERAL (VALUES ('acn', c.acn), ('abn', c.abn), ('arbn', c.arbn),
                              ('isin', c.isin), ('lei', c.lei)) AS v(scheme, value)
   WHERE v.value IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM company_identifiers i
        WHERE i.company_id = c.id AND i.scheme = v.scheme AND i.value = v.value);

  IF missing > 0 THEN
    RAISE EXCEPTION '% identifier value(s) exist only in the columns being dropped', missing;
  END IF;
END $$;

-- The partial unique indexes on acn/abn/arbn/isin said no two companies share a
-- registration number. company_identifiers was unique only per company, so the
-- guarantee moves here before its source goes. Entity resolution on
-- (scheme, value) depends on it naming one company.
DROP INDEX IF EXISTS idx_ci_scheme_value;
CREATE UNIQUE INDEX IF NOT EXISTS uq_ci_scheme_value ON company_identifiers(scheme, value);

-- Drops idx_rc_acn, idx_rc_abn, idx_rc_arbn and idx_rc_isin with them.
ALTER TABLE research_companies
  DROP COLUMN IF EXISTS acn,
  DROP COLUMN IF EXISTS abn,
  DROP COLUMN IF EXISTS arbn,
  DROP COLUMN IF EXISTS isin,
  DROP COLUMN IF EXISTS lei;
