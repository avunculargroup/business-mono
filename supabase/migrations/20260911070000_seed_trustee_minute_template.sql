-- ============================================================
-- SEED — TRUSTEE MINUTE TEMPLATE
-- ============================================================
-- Depends on: 20260911040000_prepare.sql
--
-- The first /prepare template, built end to end first because it
-- is the most constrained and the most regulatory of the six, so
-- it surfaces every problem the others will have.
--
-- INSERTED AS 'draft', NOT 'active'.
--
-- active_requires_lex_review would reject an active row with no
-- reviewer, and the correct response to that constraint is to
-- respect it rather than to name a reviewer who has not read this.
-- Lex review is a human act and this template has not had one.
--
-- To publish, after review:
--
--   UPDATE prepare_templates
--      SET status = 'active',
--          lex_reviewed_at = NOW(),
--          lex_reviewed_by = '<the reviewing team member>',
--          lex_notes = '<what changed and why>',
--          review_due_date = '<per artefact, not global>'
--    WHERE slug = 'trustee-minute' AND version = '1.0';
--
-- Note what the sections do and do not do. Every prompt is a
-- question. Section 5 reproduces the six SIS Reg 4.09(2) heads
-- verbatim as prompts, which carries no advice risk whatsoever —
-- BTS is quoting the regulation at the trustee and the trustee is
-- answering it. No section suggests an allocation, a percentage or
-- a range, because the right number depends on a balance sheet BTS
-- has deliberately never seen.
-- ============================================================

INSERT INTO prepare_templates (
  slug, title, artefact_type, client_type, version, status,
  facts_required, regulatory_references, notes, body
) VALUES (
  'trustee-minute',
  'Trustee minute — considering bitcoin as a fund investment',
  'trustee_minute',
  'smsf',
  '1.0',
  'draft',
  ARRAY['btc_spot_aud', 'btc_realised_vol_90d'],
  ARRAY['SIS Act s62', 'SIS Reg 4.09', 'SIS Reg 8.02B'],
  'Seeded with the client app. Not reviewed. See the migration header to publish.',
$template$---
slug: trustee-minute
version: 1.0
artefact_type: trustee_minute
client_type: smsf
title: Trustee minute — considering bitcoin as a fund investment
regulatory_references:
  - SIS Act s62
  - SIS Reg 4.09
  - SIS Reg 8.02B
facts_required:
  - btc_spot_aud
  - btc_realised_vol_90d
---

::section id=particulars
prompt: >
  Which fund is this minute for, who was present, and when and where
  did the meeting take place?
why: >
  A minute without meeting particulars is not evidence of a decision, it is a
  note. An auditor checks that the people who made the decision were the people
  entitled to make it, and that is what this section establishes.
facts: []
::

::section id=matter
prompt: What matter was the meeting asked to consider?
why: >
  Naming the matter — including that no decision was taken — is what makes the
  minute safe to rely on later. A minute that records a discussion without
  naming its subject invites a reader to infer one.
facts: []
::

::section id=documents-tabled
prompt: What documents were tabled or relied on at the meeting?
why: >
  The auditor will ask what the trustees had in front of them. Listing the
  documents here is cheaper than reconstructing it a year later, and it is the
  difference between a considered decision and an asserted one.
facts: []
::

::section id=deed-authority
prompt: >
  Which clause of the trust deed permits this kind of investment, and
  what is the date of the deed and of any amendment relied on?
why: >
  The deed is the first thing an auditor checks and the first thing that stops
  a fund. Only the trustee can answer it, because only the trustee has the
  deed.
facts: []
regulatory_reference: Trust deed
::

::section id=sis-risk
prompt: >
  What risk did the trustees consider in making this investment, having
  regard to the whole of the fund's circumstances?
why: >
  Reg 4.09(2)(a) requires the strategy to have regard to risk. This section
  reproduces the statutory head; the answer is the trustees' own assessment of
  it.
facts: [btc_realised_vol_90d]
regulatory_reference: SIS Reg 4.09(2)(a)
::

::section id=sis-return
prompt: What likely return did the trustees have regard to, and over what period?
why: >
  Reg 4.09(2)(a) pairs likely return with risk. Naming the period the trustees
  considered is what stops a single figure being read as an expectation.
facts: [btc_spot_aud]
regulatory_reference: SIS Reg 4.09(2)(a)
::

::section id=sis-diversification
prompt: >
  How did the trustees consider the composition of the fund's investments
  as a whole, including diversification?
why: >
  Reg 4.09(2)(b). An auditor reads this section against the rest of the fund,
  so it is answered in terms of the whole portfolio rather than this asset
  alone.
facts: []
regulatory_reference: SIS Reg 4.09(2)(b)
::

::section id=sis-liquidity
prompt: >
  What did the trustees conclude about the liquidity of the fund's
  investments, having regard to expected cash flow requirements?
why: >
  Reg 4.09(2)(c). Liquidity is where a pension-phase fund and an accumulation
  fund diverge sharply, which is why the regulation asks and why no template
  can answer it.
facts: []
regulatory_reference: SIS Reg 4.09(2)(c)
::

::section id=sis-liabilities
prompt: >
  How will the fund discharge its existing and prospective liabilities?
why: >
  Reg 4.09(2)(d). Benefit payments, pension obligations and expenses all land
  here, and the answer depends on the fund's own position.
facts: []
regulatory_reference: SIS Reg 4.09(2)(d)
::

::section id=sis-insurance
prompt: >
  Did the trustees consider whether to hold insurance cover for one or
  more members, and what did they conclude?
why: >
  Reg 4.09(2)(e) requires the consideration to be made, not a particular
  answer. Recording that it was considered — including a decision not to hold
  cover — is what satisfies it.
facts: []
regulatory_reference: SIS Reg 4.09(2)(e)
::

::section id=sole-purpose
prompt: >
  How did the trustees satisfy themselves that this investment is
  consistent with the sole purpose test?
why: >
  s62 is the provision under which a fund becomes non-complying, and personal
  use or benefit is the usual way it is breached. For an asset a trustee can
  hold keys to, an auditor will look here first.
facts: []
regulatory_reference: SIS Act s62
::

::section id=custody
prompt: >
  What custody and title arrangements did the trustees adopt, and how is
  the fund's ownership separated from any personal holding?
why: >
  Separation of assets is a standing obligation and, for this asset class, the
  one most often found wanting. The answer names the arrangement; the evidence
  for it goes in the auditor evidence pack.
facts: []
::

::section id=valuation
prompt: >
  What valuation approach did the trustees adopt, on what source, and at
  what time of day?
why: >
  Reg 8.02B requires assets to be reported at market value. For an asset that
  trades continuously, the source and the timestamp are the method, and an
  auditor will ask for both.
facts: [btc_spot_aud]
regulatory_reference: SIS Reg 8.02B
::

::section id=resolution
prompt: What did the trustees resolve?
why: >
  The operative part of the minute. It records what was decided, by whom, and
  on what date, in the trustees' own words.
facts: []
::

::section id=signatures
prompt: Who signed this minute, and on what date?
why: >
  An unsigned minute is a draft. Recording the signatories and the date is what
  turns the document into a record of the meeting.
facts: []
::
$template$
);


-- ------------------------------------------------------------
-- Verification
-- ------------------------------------------------------------
-- Expect exactly one row, and it should be a draft:
--   SELECT slug, version, status FROM prepare_templates;
--
-- As an SMSF subscriber, expect ZERO rows until it is published —
-- prepare_templates_client_read filters on status = 'active':
--   SELECT count(*) FROM prepare_templates;
-- ------------------------------------------------------------
