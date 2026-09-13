-- ============================================================
-- SUBSCRIBERS DO NOT READ THE ADVISOR REGISTER
-- ============================================================
-- Depends on: 20260911030000_directory_and_signals.sql
--
-- That migration granted subscribers `advisors_partners` where
-- `active = TRUE`, on the reading that `/directory` shows "every
-- listed entity" and the ecosystem has two registers. Nothing in
-- `ClientDirectoryRepository` ever read it, so the grant has sat
-- open and unused.
--
-- It should not be opened. Five things, and the third is the one
-- that decides it:
--
-- 1. `advisors_partners` holds NAMED INDIVIDUALS, not providers.
--    `type IN ('advisor','partner')`, and the fields are `bio`,
--    `linkedin_url`, `rate_notes`, `specialization`. That is a
--    promotional profile, not a factual register entry, and a list
--    of people with specialisations reads as a shortlist of who to
--    hire however neutrally it is worded.
--
-- 2. There is no classification gate. `products_services` has
--    `is_financial_product`, and the whole no-call-to-action
--    mechanism hangs off it. Advisors have no equivalent, so
--    nothing structurally stops an advisor card carrying an
--    outbound link — the directory's safety is structural or it is
--    nothing.
--
-- 3. `engagement_model` allows 'revenue_share', and `no_fees_mvp`
--    does not reach it. That constraint forces
--    `commercial_relationships.fee_basis = 'none'`, so
--    `/directory/how-we-make-money` can only ever print "no fee".
--    An advisor on a revenue share would appear in the directory
--    while the disclosure page truthfully reported no fees, because
--    the fee lives in a different table the page does not read.
--    Accurate and misleading at the same time, which is worse than
--    either.
--
-- 4. "Advisor" is restricted under s923C, reserved for people on
--    the Financial Advisers Register. A subscriber-facing list
--    headed from `type = 'advisor'` uses the word in exactly the
--    context `.claude/skills/bts-design/references/naming.md`
--    forbids.
--
-- 5. A live grant on an unread table is the worst shape for this to
--    be in. Adding `advisors.list()` to the contract would look
--    like wiring up an existing permission rather than making a
--    product decision, and the decision would never get made.
--
-- CLOSED PENDING A DECISION, not closed forever. If advisors should
-- reach subscribers, that needs: a classification gate of its own,
-- `engagement_model` brought under the fee rule or surfaced in the
-- disclosure, and a heading that does not use a restricted term.
-- Re-granting is one policy; the three preconditions are the work.
-- ============================================================

DROP POLICY IF EXISTS "advisors_partners_client_read" ON advisors_partners;


-- ------------------------------------------------------------
-- Except the ones BTS has to name
-- ------------------------------------------------------------
-- Dropping the grant outright breaks the disclosure route, which
-- is the one place it must not break.
--
-- `ClientDirectoryRepository.disclosures()` powers
-- `/directory/how-we-make-money`, and it resolves entity names for
-- both `entity_type`s. With no grant an advisor relationship
-- renders as "Unnamed entity" — disclosing that a relationship
-- exists while hiding who it is with, which reads as evasion on
-- the one surface whose entire purpose is candour about BTS's own
-- arrangements. Worse than the blanket grant it replaced.
--
-- So: exactly the rows the disclosure has to name, and no others.
-- An advisor with no active commercial relationship stays
-- invisible; one BTS has an arrangement with can be named, because
-- BTS is obliged to name them. The directory listing is still
-- closed — `list()` does not query this table at all.
-- ------------------------------------------------------------

CREATE POLICY "advisors_partners_client_disclosure_read" ON advisors_partners
  FOR SELECT USING (
    current_client_account_id() IS NOT NULL
    AND EXISTS (
      SELECT 1
        FROM commercial_relationships cr
       WHERE cr.entity_type = 'advisor_partner'
         AND cr.entity_id = advisors_partners.id
         AND cr.is_active
    )
  );

COMMENT ON TABLE advisors_partners IS
  'Named individuals and partner organisations, internal only. Deliberately NOT readable by Minute subscribers — see 20260912060000_close_advisor_client_read.sql for the three preconditions that would have to be met first.';


-- ------------------------------------------------------------
-- Verification
-- ------------------------------------------------------------
-- Only the team policy and the narrow disclosure one:
--   SELECT policyname FROM pg_policies
--    WHERE tablename = 'advisors_partners';
--
-- An advisor with no active relationship is invisible; one with a
-- relationship is nameable. Exercise both, as a subscriber.
--
-- And the audit guard should still be clean:
--   SELECT * FROM audit_permissive_policies();
--   -- expect zero rows
-- ------------------------------------------------------------
