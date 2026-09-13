-- ============================================================
-- SEED — AUDITOR EVIDENCE CHECKLIST TEMPLATE
-- ============================================================
-- Depends on: 20260911040000_prepare.sql
--
-- The last of the six artefacts, and the one a subscriber will use
-- most often, because it recurs every year on a fixed date.
--
-- INSERTED AS 'draft', NOT 'active'. See the trustee minute
-- migration header for the UPDATE that publishes it.
--
-- Item 8 is where the vertical integration shows: a custody
-- provider's regulatory status as at a date is an audit evidence
-- item, and the ecosystem signals engine is already tracking it
-- for other reasons. Note that it is NOT bound as a fact. The
-- fact registry serves observed and reported series; provider
-- status is a `/signals` entry with a Lex-gated compliance class,
-- and routing it through `facts` would strip the gate. The
-- subscriber reads it on `/signals` and states it here.
--
-- The seasonal 30 June valuation pack is items 6, 7 and 8 run
-- standalone, surfaced from 1 May and retired 31 July. It is a
-- seventh template with artefact_type 'valuation_pack' and is not
-- seeded here — a subset that drifts from its parent is worse
-- than no subset, so it should be generated from this body rather
-- than copied from it.
-- ============================================================

INSERT INTO prepare_templates (
  slug, title, artefact_type, client_type, version, status,
  facts_required, regulatory_references, notes, body
) VALUES (
  'auditor-evidence',
  'Auditor evidence checklist — bitcoin held by a self-managed fund',
  'auditor_evidence',
  'smsf',
  '1.0',
  'draft',
  ARRAY['btc_spot_aud'],
  ARRAY['SIS Act s62', 'SIS Act Part 8', 'SIS Reg 4.09', 'SIS Reg 8.02B'],
  'Seeded with the client app. Not reviewed. See the migration header to publish.',
$template$---
slug: auditor-evidence
version: 1.0
artefact_type: auditor_evidence
client_type: smsf
title: Auditor evidence checklist — bitcoin held by a self-managed fund
regulatory_references:
  - SIS Act s62
  - SIS Act Part 8
  - SIS Reg 4.09
  - SIS Reg 8.02B
facts_required:
  - btc_spot_aud
---

::section id=deed
prompt: >
  Which clause of the trust deed permits this investment, and what
  is the deed date and the date of any amendment relied on?
why: >
  The first thing an auditor establishes, and the one that cannot be fixed
  afterwards. A deed silent on the asset is a different conversation from a
  deed that permits it, and the clause reference is what settles which
  conversation this is.
facts: []
::

::section id=strategy
prompt: >
  Which version of the investment strategy addresses this asset,
  and what is its date?
why: >
  The auditor is testing whether the strategy addressed the asset before the
  fund acquired it. A version and a date answer that; a copy of the current
  strategy does not.
facts: []
regulatory_reference: SIS Reg 4.09
::

::section id=minute
prompt: >
  What is the date of the trustee minute recording the decision,
  and where is it held?
why: >
  The minute is the contemporaneous record of consideration. Its date relative
  to the strategy amendment and the first transaction is the sequence the
  auditor is reconstructing.
facts: []
::

::section id=separation
prompt: >
  What evidence shows the assets are held in the fund's name and
  separated from personal and business assets?
why: >
  Separation of assets is a standing obligation and the most common finding
  against funds holding this asset, because a personal wallet used once is
  indistinguishable from a fund wallet afterwards.
facts: []
regulatory_reference: SIS Reg 4.09
::

::section id=source-of-funds
prompt: >
  Which fund bank account record evidences the source of funds for
  the acquisition?
why: >
  Tracing the payment from the fund's own account is what connects the asset to
  the fund. A transfer from a member's account, however promptly reimbursed, is
  a different transaction with different consequences.
facts: []
::

::section id=existence
prompt: >
  By what method is existence and ownership evidenced at balance
  date, and who performed it?
why: >
  Existence and ownership are separate assertions and an address balance
  evidences only the first. Naming the method — and whether it demonstrated
  control rather than visibility — is what makes the evidence useful.
facts: []
::

::section id=valuation
prompt: >
  What is the market value at 30 June, from what source, by what
  method, at what timestamp, and on what AUD conversion basis?
why: >
  Four separate things, and an answer missing any one of them will be queried.
  The conversion basis in particular is where two defensible methods produce
  different numbers, which is exactly why the auditor asks.
facts: [btc_spot_aud]
regulatory_reference: SIS Reg 8.02B
::

::section id=custody-status
prompt: >
  Which provider holds the custody arrangement, and what was its
  regulatory status as at the balance date?
why: >
  As-at is the whole of this item. Digital asset platforms became financial
  products in April 2026 and the transition arrangements run for eighteen
  months, so a provider's status at 30 June is not necessarily its status when
  the audit is performed. The status as at the date is on the signals page.
facts: []
::

::section id=related-party
prompt: >
  What related party and in-house asset considerations arise, and
  how has each been addressed?
why: >
  Acquiring from a related party and the in-house asset limit are separate
  rules that both bite here, and an answer of "none" is a finding in itself if
  the auditor can see a counterparty the fund is connected to.
facts: []
regulatory_reference: SIS Act Part 8
::

::section id=contributions-pensions
prompt: >
  What contribution or pension implications, if any, arise from
  this holding in the period?
why: >
  Usually nothing, and occasionally the most consequential item on the list —
  an in-specie contribution or a pension payment made in the asset changes what
  the auditor is testing entirely.
facts: []
optional: true
::
$template$
);


-- ------------------------------------------------------------
-- Verification
-- ------------------------------------------------------------
-- All six artefacts seeded, all drafts, none active:
--   SELECT slug, artefact_type, client_type, status
--     FROM prepare_templates ORDER BY client_type, slug;
--
-- Nothing is active, which is the point — active_requires_lex_review
-- would have rejected any of these:
--   SELECT count(*) FROM prepare_templates WHERE status = 'active';
--   -- expect 0
-- ------------------------------------------------------------
