-- ============================================================
-- PRIVACY POLICY URL ONTO company_profile
-- ============================================================
-- Depends on: 20260911010000_compliance_documents.sql
--
-- `bts_privacy_policy_url` was the Service Statement's one
-- variable with no home in this table. It was read from
-- NEXT_PUBLIC_PRIVACY_POLICY_URL instead, by both apps, on two
-- separate Vercel projects — so publishing the statement needed
-- the same string set twice and a redeploy of each, because
-- Next.js fixes NEXT_PUBLIC_ values at build time.
--
-- That cost a day already: a complete profile plus an unset
-- variable still blocked the gate, and /compliance reported a key
-- as having no value while the other project plainly had it.
--
-- The reasoning that kept it out of here was that the page it
-- points at is a commitment that a page exists rather than a fact
-- about the company. True, and not a reason for a second storage
-- mechanism: an ABN is equally a commitment that the entity is
-- registered, and it is verified by a person before the document
-- goes active either way. What the environment variable actually
-- bought was a value the /compliance form could not fix.
--
-- Nullable like every other optional field, and unseeded for the
-- same reason the rest of the table is: a placeholder URL would
-- ship inside a document a subscriber acknowledges.
--
-- NOT A BACKFILL. Wherever the variable is already set in Vercel,
-- this column starts empty and the gate stays closed until the
-- value is typed into /compliance. That is one deliberate manual
-- step, and afterwards the variable can be deleted from both
-- projects.
-- ============================================================

ALTER TABLE company_profile
  ADD COLUMN privacy_policy_url TEXT;

COMMENT ON COLUMN company_profile.privacy_policy_url IS
  'Absolute URL of the published privacy policy, cited by the Service Statement. Verify the page is live before the statement goes active — this is the one field asserting something outside the database.';


-- ------------------------------------------------------------
-- Verification
-- ------------------------------------------------------------
-- Should return one row with a NULL privacy_policy_url on any
-- environment where the profile was already filled in:
--   SELECT legal_name, privacy_policy_url FROM company_profile;
--
-- Should be readable by a subscriber: the column is covered by
-- company_profile_client_read, which is a table policy with no
-- column list. A new column needs no policy change, which is why
-- this migration has none.
-- ------------------------------------------------------------
