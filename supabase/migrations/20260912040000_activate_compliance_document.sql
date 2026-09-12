-- ============================================================
-- ACTIVATE A COMPLIANCE DOCUMENT
-- ============================================================
-- Depends on: 20260911010000_compliance_documents.sql
--
-- One function, and it exists because of an index.
--
-- `idx_compliance_documents_one_active` is a partial unique index
-- on (doc_type) WHERE status = 'active'. Publishing a new version
-- therefore means two changes — supersede the incumbent, activate
-- the successor — and they must both happen or neither, because
-- the failure mode in between is zero active Service Statements,
-- which blocks every subscriber out of the app.
--
-- The obvious single statement does NOT work:
--
--   UPDATE compliance_documents
--      SET status = CASE WHEN id = p_id THEN 'active'
--                        ELSE 'superseded' END
--    WHERE doc_type = ... AND (id = p_id OR status = 'active');
--
-- Postgres maintains the unique index as each row is updated, so
-- whether that statement succeeds depends on which row the executor
-- reaches first. Tested both ways against a mirror of the live
-- catalogue: incumbent-first succeeds, successor-first raises
-- 23505. A statement that passes or fails on physical row order is
-- worse than one that always fails, because it passes in testing.
--
-- Two statements in one function body is the fix. The index is
-- checked at the end of each statement, so the incumbent is fully
-- superseded before the successor claims the slot, and the function
-- is one transaction so a failure in the second rolls back the
-- first.
--
-- SECURITY INVOKER (the default), deliberately. This needs no
-- elevated rights — `compliance_documents_team` already grants a
-- team member write access — and a SECURITY DEFINER function here
-- would be a way to change what a subscriber acknowledges without
-- passing RLS. The one privileged function in this schema is
-- `redeem_client_invite`, which has to be.
-- ============================================================

CREATE OR REPLACE FUNCTION activate_compliance_document(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_doc_type TEXT;
BEGIN
  SELECT doc_type INTO v_doc_type
    FROM compliance_documents
   WHERE id = p_id;

  IF v_doc_type IS NULL THEN
    -- Also what a caller sees when RLS hides the row, which is the
    -- correct conflation: a document you cannot read is one you
    -- cannot publish.
    RAISE EXCEPTION 'No compliance document with id %', p_id
      USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE compliance_documents
     SET status = 'superseded'
   WHERE doc_type = v_doc_type
     AND status = 'active'
     AND id <> p_id;

  UPDATE compliance_documents
     SET status = 'active',
         effective_from = COALESCE(effective_from, CURRENT_DATE)
   WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION activate_compliance_document(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION activate_compliance_document(UUID) TO authenticated;

COMMENT ON FUNCTION activate_compliance_document(UUID) IS
  'Supersedes the active document of the same doc_type and activates this one, in one transaction. Two statements rather than one: the partial unique index is maintained per row, so a single CASE update succeeds or fails on physical row order.';


-- ------------------------------------------------------------
-- Verification
-- ------------------------------------------------------------
-- Activating a second version leaves exactly one active row,
-- whichever order the rows were inserted in:
--   SELECT activate_compliance_document('<the new id>');
--   SELECT version, status FROM compliance_documents
--    WHERE doc_type = 'service_statement' ORDER BY version;
--
-- Should raise no_data_found:
--   SELECT activate_compliance_document(gen_random_uuid());
-- ------------------------------------------------------------
