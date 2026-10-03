-- ============================================================
-- CORPORATE HOLDINGS — canonical event natural keys
-- Spec: docs/features/corporate-holdings/schema-ingest-spec.md
--       → Ingest workflow ("Stop asking the model for the natural_key")
--
-- The ingest now computes an event's key as <slug>:<code>:<YYYY-MM-DD>
-- (apps/agents/src/workflows/researchIngest/naturalKey.ts) instead of asking
-- Rex for one. Reconcile matches on that key and creates whatever does not
-- match, so every committed key has to be in the same form before the first
-- real run, or that run duplicates the row.
--
-- Seventeen of the twenty-nine seeded keys already are. The other twelve carry a
-- shortened slug (loc, hamak, panther), a month-only date (loc:policy:2025-01,
-- sequans:posture:2026-05) or no date at all (loc:accounting:aasb138).
--
-- The codes below must match EVENT_KEY_CODES. A row is rewritten only where
-- no other event of the company already holds its canonical key, so the
-- UNIQUE (company_id, natural_key) constraint cannot fire; at the time of
-- writing no company has two events of one type on one date. Idempotent:
-- a second run finds every key already canonical.
-- ============================================================

WITH canonical AS (
  SELECT e.id,
         e.company_id,
         c.slug || ':' ||
         CASE e.event_type
           WHEN 'policy_adoption'        THEN 'policy'
           WHEN 'acquisition'            THEN 'acq'
           WHEN 'disposal'               THEN 'disp'
           WHEN 'capital_raise'          THEN 'raise'
           WHEN 'covenant_change'        THEN 'covenant'
           WHEN 'capital_posture_change' THEN 'posture'
           WHEN 'custody_change'         THEN 'custody'
           WHEN 'listing_change'         THEN 'listing'
           WHEN 'accounting_election'    THEN 'accounting'
         END || ':' || to_char(e.event_date, 'YYYY-MM-DD') AS natural_key
    FROM treasury_events e
    JOIN research_companies c ON c.id = e.company_id
),
unambiguous AS (
  SELECT id, company_id, natural_key
    FROM canonical
   WHERE natural_key IS NOT NULL
     AND (company_id, natural_key) IN (
       SELECT company_id, natural_key FROM canonical
        GROUP BY company_id, natural_key HAVING count(*) = 1
     )
)
UPDATE treasury_events e
   SET natural_key = u.natural_key
  FROM unambiguous u
 WHERE e.id = u.id
   AND e.natural_key IS DISTINCT FROM u.natural_key
   AND NOT EXISTS (
     SELECT 1 FROM treasury_events other
      WHERE other.company_id = u.company_id
        AND other.natural_key = u.natural_key
        AND other.id <> u.id
   );
