-- ============================================================
-- SEED — TREASURY POLICY SKELETON TEMPLATE
-- ============================================================
-- Depends on: 20260911040000_prepare.sql
--
-- The discipline test for the whole feature, and the reason it is
-- worth reading before writing any further template.
--
-- Section 4 is a limits framework with no numbers in it. BTS
-- supplies the structure — that a position limit exists, that a
-- concentration limit exists, that a rebalancing trigger exists —
-- and not one figure. A template that suggested a number would be
-- advice, and it would also be worthless, because the right number
-- depends on a balance sheet BTS has deliberately never seen.
--
-- INSERTED AS 'draft', NOT 'active'. See the trustee minute
-- migration header for the UPDATE that publishes it.
--
-- `facts_required` IS DELIBERATELY EMPTY, and it is the only
-- seeded template of which that is true. A policy states standing
-- rules; a fact is true as at a timestamp. Binding a spot price
-- into a document meant to outlive the quarter would put a stale
-- number inside a standing instruction, which is worse than no
-- number at all — and worse still, it would read as the figure the
-- limits were set against.
-- ============================================================

INSERT INTO prepare_templates (
  slug, title, artefact_type, client_type, version, status,
  facts_required, regulatory_references, notes, body
) VALUES (
  'treasury-policy',
  'Treasury policy skeleton — digital asset holdings',
  'treasury_policy',
  'corporate',
  '1.0',
  'draft',
  ARRAY[]::TEXT[],
  ARRAY['Corporations Amendment (Digital Assets Framework) Act 2026'],
  'Seeded with the client app. Not reviewed. See the migration header to publish.',
$template$---
slug: treasury-policy
version: 1.0
artefact_type: treasury_policy
client_type: corporate
title: Treasury policy skeleton — digital asset holdings
regulatory_references:
  - Corporations Amendment (Digital Assets Framework) Act 2026
facts_required: []
---

::section id=purpose-scope
prompt: >
  What is this policy for, and which entities, accounts and
  instruments does it cover?
why: >
  A policy with an unstated perimeter gets applied to whatever someone thinks
  it covers. Naming the entities and accounts in scope is what makes a later
  breach identifiable as a breach.
facts: []
::

::section id=definitions
prompt: >
  Which terms does this policy define, and what does each mean
  here?
why: >
  Custody, wallet, cold storage and self-custody are used loosely everywhere
  else. A policy that does not fix their meaning cannot be enforced, because
  two people can comply with opposite readings of the same clause.
facts: []
::

::section id=authorised-prohibited
prompt: >
  What activity is authorised under this policy, and what is
  prohibited outright?
why: >
  The prohibitions carry more weight than the authorisations. Lending,
  pledging, staking, derivatives and margin are each a separate decision, and a
  policy silent on one has permitted it by omission.
facts: []
::

::section id=limits
prompt: >
  What limits does the board set — position, concentration, and
  the trigger at which a rebalance is considered?
why: >
  This section is the structure of a limits framework and nothing else. The
  headings come from BTS; every figure under them is the board's, because the
  right number depends on a balance sheet, a liquidity profile and a risk
  appetite that only the board can see. A number supplied here would be a
  conclusion dressed as a template.
facts: []
::

::section id=authorities
prompt: >
  Who is authorised to approve a transaction, at what size, and to
  whom may that authority be delegated?
why: >
  Approval authority and transaction capability are different things and are
  often held by the same person by accident. Writing the authority down is what
  makes that visible.
facts: []
::

::section id=custody-keys
prompt: >
  What custody arrangement does this policy require, and how is
  key material generated, stored, backed up and recovered?
why: >
  Key management is the operational core of the policy. The recovery path in
  particular is the clause nobody reads until the day it is the only clause
  that matters.
facts: []
::

::section id=counterparties
prompt: >
  How is a counterparty selected, and on what criteria and cadence
  is that selection reviewed?
why: >
  Digital asset platforms became financial products in April 2026 and the
  transition arrangements run for eighteen months, so a provider's status
  changes during the life of this policy. A selection made once and never
  revisited is a control that has already expired.
facts: []
regulatory_reference: Corporations Amendment (Digital Assets Framework) Act 2026
::

::section id=valuation-reporting
prompt: >
  How is the holding valued, on what accounting basis is it
  carried, and what is reported to whom and how often?
why: >
  Naming the price source and the reporting cadence in the policy means the
  valuation used at year end is the one the policy always specified, rather
  than the one chosen after the fact.
facts: []
::

::section id=breach
prompt: >
  How is a breach of this policy identified, and to whom is it
  escalated, within what time?
why: >
  A limit with no detection mechanism is a preference. This is the clause that
  turns the numbers in section 4 into controls.
facts: []
::

::section id=review-owner
prompt: >
  Who owns this policy, and on what cycle is it reviewed?
why: >
  An unowned policy ages until it contradicts practice, at which point it is
  evidence against the company rather than for it. A named owner and a date are
  the cheapest control in the document.
facts: []
::
$template$
);


-- ------------------------------------------------------------
-- Verification
-- ------------------------------------------------------------
-- The only seeded template binding no facts:
--   SELECT slug, cardinality(facts_required) AS facts
--     FROM prepare_templates ORDER BY slug;
--
-- Section 4 contains the word "limit" and no digits. Worth
-- re-reading by eye at review; nothing enforces it, because a
-- constraint that rejected digits would also reject a clause
-- number.
-- ------------------------------------------------------------
