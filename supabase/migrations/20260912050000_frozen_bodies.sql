-- ============================================================
-- A PUBLISHED BODY IS IMMUTABLE
-- ============================================================
-- Depends on: 20260911010000_compliance_documents.sql,
--             20260911040000_prepare.sql
--
-- Both tables are edited from /compliance in apps/web. These
-- triggers are what makes that safe.
--
-- The reason is two denormalised columns:
--
--   client_disclosures.document_version  — what a subscriber
--       acknowledged. Not a foreign key to a row, a copy of the
--       version string, because versions get superseded and the
--       acknowledgement has to outlive them.
--
--   prepare_generations.template_version — what a pack was built
--       from. Its whole purpose, per the table's own comment: "if
--       a template is later found to be wrong, this answers who
--       received it."
--
-- Editing the body of a live row silently invalidates both. A
-- subscriber has acknowledged text that no longer exists anywhere,
-- and a pack cites a version whose content changed underneath it.
-- Nothing in either table would show it, because both record the
-- version string and the version string did not change.
--
-- So: edit freely before publication, never after. To change
-- something live, create a new version — which is a new row, which
-- gets its own acknowledgements and its own generations, and which
-- supersedes the old one on publish.
--
-- This is enforced here rather than in the app because it is the
-- kind of rule an app forgets. A second surface, a script, a
-- console session at 11pm: all of those go through Postgres.
-- ============================================================


-- ------------------------------------------------------------
-- compliance_documents
-- ------------------------------------------------------------
-- 'active' is the only live state. 'superseded' and 'archived'
-- are frozen too: a superseded Service Statement is exactly the
-- text some subscriber acknowledged last year, and it is evidence.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION freeze_published_document_body()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status IN ('active', 'superseded', 'archived')
     AND NEW.body IS DISTINCT FROM OLD.body THEN
    RAISE EXCEPTION
      'Cannot edit the body of a % document. Create a new version instead.',
      OLD.status
      USING ERRCODE = 'check_violation';
  END IF;

  -- The version string is the identity a disclosure was recorded
  -- against. Renaming it after the fact detaches every
  -- acknowledgement from the text it was given for.
  IF OLD.status IN ('active', 'superseded', 'archived')
     AND NEW.version IS DISTINCT FROM OLD.version THEN
    RAISE EXCEPTION
      'Cannot change the version of a % document — acknowledgements are recorded against it.',
      OLD.status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER compliance_documents_freeze_body
  BEFORE UPDATE ON compliance_documents
  FOR EACH ROW EXECUTE FUNCTION freeze_published_document_body();

COMMENT ON FUNCTION freeze_published_document_body() IS
  'A published body is immutable. client_disclosures.document_version records what a subscriber acknowledged; editing the text underneath it would leave that record pointing at nothing.';


-- ------------------------------------------------------------
-- prepare_templates
-- ------------------------------------------------------------
-- Same rule, plus one more: a Lex review is a review of specific
-- text. Change the text and the review no longer describes it, so
-- the review is cleared rather than left standing.
--
-- Clearing rather than rejecting, deliberately. Rejecting would
-- mean a reviewer who spots a typo has to ask someone to unpick
-- the review first, and the likely outcome of that friction is the
-- typo shipping. Clearing costs a re-review, which is the correct
-- price and the same bargain a new commit strikes with a code
-- review approval.
--
-- active_requires_lex_review then does the rest: a template whose
-- review was just cleared cannot be active, so this cannot quietly
-- put unreviewed text in front of a subscriber.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION freeze_published_template_body()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status IN ('active', 'superseded', 'archived')
     AND NEW.body IS DISTINCT FROM OLD.body THEN
    RAISE EXCEPTION
      'Cannot edit the body of a % template. Create a new version instead.',
      OLD.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.status IN ('active', 'superseded', 'archived')
     AND NEW.version IS DISTINCT FROM OLD.version THEN
    RAISE EXCEPTION
      'Cannot change the version of a % template — generations are recorded against it.',
      OLD.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.body IS DISTINCT FROM OLD.body AND OLD.lex_reviewed_at IS NOT NULL THEN
    NEW.lex_reviewed_at := NULL;
    NEW.lex_reviewed_by := NULL;
    NEW.lex_notes       := NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER prepare_templates_freeze_body
  BEFORE UPDATE ON prepare_templates
  FOR EACH ROW EXECUTE FUNCTION freeze_published_template_body();

COMMENT ON FUNCTION freeze_published_template_body() IS
  'A published body is immutable, and editing an unpublished one clears its Lex review. prepare_generations.template_version records what a pack was built from; a review describes specific text.';


-- ------------------------------------------------------------
-- Verification
-- ------------------------------------------------------------
-- Should fail with check_violation:
--   UPDATE compliance_documents SET body = 'x' WHERE status = 'active';
--   UPDATE prepare_templates    SET body = 'x' WHERE status = 'active';
--
-- Should succeed, and leave lex_reviewed_at NULL:
--   UPDATE prepare_templates SET body = body || ' ' WHERE status = 'draft';
--
-- Should still succeed on a live row — the freeze is on the body
-- and the version, not on the row:
--   UPDATE prepare_templates SET review_due_date = CURRENT_DATE
--    WHERE status = 'active';
-- ------------------------------------------------------------
