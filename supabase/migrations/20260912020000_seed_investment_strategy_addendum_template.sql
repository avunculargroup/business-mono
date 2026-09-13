-- ============================================================
-- SEED — INVESTMENT STRATEGY ADDENDUM TEMPLATE
-- ============================================================
-- Depends on: 20260911040000_prepare.sql
--
-- The safest template in the set to write, for a reason worth
-- stating: sections 3 to 8 reproduce the six SIS Reg 4.09(2) heads
-- verbatim as prompts. BTS is quoting the regulation at the
-- trustee and the trustee is answering it. There is no advice risk
-- in reading a regulation aloud.
--
-- INSERTED AS 'draft', NOT 'active'. See the trustee minute
-- migration header for the UPDATE that publishes it.
--
-- Section 9 is where the discipline shows. Reg 4.09(2) requires
-- the strategy to have regard to those heads; it does not require
-- an allocation figure, and this template does not suggest one.
-- The trustee sets the range or declines to.
--
-- `btc_realised_vol_90d` binds to the risk head and nowhere else.
-- A fact renders in its own block with a provenance rail, never
-- inside a sentence, so the number sits beside the trustee's
-- reasoning rather than inside it — and a trustee writing about
-- risk without a volatility figure to hand tends to write about
-- something else.
-- ============================================================

INSERT INTO prepare_templates (
  slug, title, artefact_type, client_type, version, status,
  facts_required, regulatory_references, notes, body
) VALUES (
  'investment-strategy-addendum',
  'Investment strategy addendum — adding bitcoin as an asset class',
  'investment_strategy_addendum',
  'smsf',
  '1.0',
  'draft',
  ARRAY['btc_realised_vol_90d'],
  ARRAY['SIS Reg 4.09'],
  'Seeded with the client app. Not reviewed. See the migration header to publish.',
$template$---
slug: investment-strategy-addendum
version: 1.0
artefact_type: investment_strategy_addendum
client_type: smsf
title: Investment strategy addendum — adding bitcoin as an asset class
regulatory_references:
  - SIS Reg 4.09
facts_required:
  - btc_realised_vol_90d
---

::section id=fund-and-version
prompt: >
  Which fund is this addendum for, and which version and date of
  the investment strategy is it amending?
why: >
  An addendum that does not name the document it amends creates two strategies
  rather than one amended strategy. The auditor will ask which was in force at
  the time of the investment, and this is the answer.
facts: []
::

::section id=asset-class
prompt: >
  How is the asset class being added described for the purposes of
  this strategy?
why: >
  The description is what the rest of the addendum has regard to. A strategy
  that considers "cryptocurrency" and a fund that holds bitcoin have a gap
  between them that someone will eventually have to explain.
facts: []
::

::section id=risk
prompt: >
  What are the risks of making, holding and realising this
  investment, having regard to the objectives of the fund and its
  entire circumstances?
why: >
  The first head of Reg 4.09(2), reproduced as the regulation puts it. It asks
  about three distinct moments — making, holding and realising — and an answer
  addressing only the first is incomplete on its face.
facts: [btc_realised_vol_90d]
regulatory_reference: SIS Reg 4.09
::

::section id=return
prompt: >
  What is the likely return from this investment, having regard to
  the objectives of the fund and its expected cash flow
  requirements?
why: >
  The second head. Note what the regulation asks for: the trustee's
  expectation, reasoned. It does not ask for a forecast from anyone else, and
  nothing in Minute supplies one.
facts: []
regulatory_reference: SIS Reg 4.09
::

::section id=diversification
prompt: >
  What is the composition of the fund's investments as a whole,
  including the extent to which they are diverse or involve
  exposure to inadequate diversification?
why: >
  The third head. It is asked about the whole fund, not about this asset, which
  is why no answer can be composed from anything BTS holds — the fund's other
  holdings are not known here and never will be.
facts: []
regulatory_reference: SIS Reg 4.09
::

::section id=liquidity
prompt: >
  What is the liquidity of the fund's investments, having regard
  to its expected cash flow requirements?
why: >
  The fourth head. Liquidity of the asset and liquidity of the fund are
  different questions, and the regulation asks the second.
facts: []
regulatory_reference: SIS Reg 4.09
::

::section id=liabilities
prompt: >
  What is the ability of the fund to discharge its existing and
  prospective liabilities?
why: >
  The fifth head. For a fund in or approaching pension phase this is the head
  that constrains the others, and it is the one most often answered in a single
  sentence that says nothing.
facts: []
regulatory_reference: SIS Reg 4.09
::

::section id=insurance
prompt: >
  Whether the trustees of the fund hold a contract of insurance
  that provides insurance cover for one or more members of the
  fund?
why: >
  The sixth head, and the one most often skipped because it appears unrelated
  to the asset. It is not optional: the regulation requires the strategy to
  have regard to it, and an addendum silent on it leaves the amended strategy
  incomplete.
facts: []
regulatory_reference: SIS Reg 4.09
::

::section id=allocation
prompt: >
  What allocation approach or range have the trustees set for this
  asset class, and on what reasoning?
why: >
  The trustees set this. No figure is supplied here and none is implied by
  anything above, because the right number depends on the fund's balances,
  members and liabilities — none of which Minute has any facility to receive.
facts: []
::

::section id=review-triggers
prompt: >
  What would trigger a review of this addendum before the next
  scheduled strategy review?
why: >
  A strategy reviewed only on the calendar is a strategy that will be out of
  date at exactly the moment it matters. Naming the triggers now is easier than
  judging in the moment whether something counts as one.
facts: []
::

::section id=signatures
prompt: >
  What is the date of this addendum, and which trustees are
  signing it?
why: >
  An unsigned or undated addendum is not evidence that the strategy was amended
  before the investment was made, which is the single thing it exists to
  demonstrate.
facts: []
::
$template$
);


-- ------------------------------------------------------------
-- Verification
-- ------------------------------------------------------------
-- Six sections carry the Reg 4.09(2) heads:
--   SELECT slug FROM prepare_templates
--    WHERE slug = 'investment-strategy-addendum';
--   -- then read the body; nothing counts the heads for you, and
--   -- a count would pass on six sections quoting the wrong six.
--
-- Two SMSF templates, both drafts:
--   SELECT slug, status FROM prepare_templates
--    WHERE client_type = 'smsf' ORDER BY slug;
-- ------------------------------------------------------------
