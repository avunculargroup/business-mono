-- ============================================================
-- SEED — AUDIT COMMITTEE BRIEFING NOTE TEMPLATE
-- ============================================================
-- Depends on: 20260911040000_prepare.sql
--
-- The third corporate artefact, and the first written for a
-- reader who is looking for a problem. A board paper persuades an
-- audit committee of nothing; it answers what the committee is
-- obliged to ask.
--
-- INSERTED AS 'draft', NOT 'active'. See the trustee minute
-- migration header for the UPDATE that publishes it.
--
-- Two deviations from the spec's outline, both deliberate:
--
-- 1. The spec marks section 2 "(facts)", meaning the AASB
--    position. There is no fact key for an accounting standard
--    and there should not be: FACT_SOURCES serves observed and
--    reported series with a provenance rail and a cadence, and a
--    standard is neither. The measurement basis is the
--    subscriber's answer, and `regulatory_reference` on the
--    section is what points them at the standard.
--
-- 2. `btc_spot_aud` binds to section 4 rather than section 2,
--    because a price is evidence about valuation methodology and
--    not about classification.
--
-- No ASA references. The auditing standards are the auditor's
-- frame, not BTS's, and naming which ones an auditor will work to
-- is a step toward telling them their job.
-- ============================================================

INSERT INTO prepare_templates (
  slug, title, artefact_type, client_type, version, status,
  facts_required, regulatory_references, notes, body
) VALUES (
  'audit-committee-note',
  'Audit committee briefing note — bitcoin held on balance sheet',
  'audit_committee_note',
  'corporate',
  '1.0',
  'draft',
  ARRAY['btc_spot_aud'],
  ARRAY['AASB 13', 'AASB 138'],
  'Seeded with the client app. Not reviewed. See the migration header to publish.',
$template$---
slug: audit-committee-note
version: 1.0
artefact_type: audit_committee_note
client_type: corporate
title: Audit committee briefing note — bitcoin held on balance sheet
regulatory_references:
  - AASB 13
  - AASB 138
facts_required:
  - btc_spot_aud
---

::section id=scope
prompt: >
  What does this note cover, and what has it deliberately left
  out?
why: >
  An audit committee reads an unbounded note as a claim of completeness. Saying
  what is out of scope is what lets the rest of the note be read as written
  rather than as an assurance nobody offered.
facts: []
::

::section id=classification
prompt: >
  How is the holding classified, and on what measurement basis is
  it carried?
why: >
  Everything downstream follows from this answer — where movements land, what
  the auditor tests, and which disclosures are required. It is asked first
  because a note that reaches valuation before settling classification has
  already confused the committee.
facts: []
regulatory_reference: AASB 138
::

::section id=effect-on-results
prompt: >
  How does that measurement basis move reported results, and
  through which statement?
why: >
  Whether movements reach the profit and loss or sit in equity is the
  difference between a treasury decision and an earnings-volatility decision as
  far as this committee is concerned. Stating it plainly is more useful than a
  worked example, which would imply a position size.
facts: []
::

::section id=valuation
prompt: >
  What valuation methodology and price source are used, and why
  that source rather than another?
why: >
  A fair value measurement is only as defensible as the reason for the source.
  An auditor will ask why this venue, at what time, on what convention — so the
  answer is worth writing once, here, rather than reconstructing it under
  question.
facts: [btc_spot_aud]
regulatory_reference: AASB 13
::

::section id=existence-ownership
prompt: >
  How is existence evidenced, and how is ownership evidenced?
why: >
  They are two assertions and they fail differently. An address balance
  demonstrates that coins exist; it demonstrates nothing about who controls
  them. Separating the two in advance is what stops the committee conflating
  them.
facts: []
::

::section id=custody
prompt: >
  What is the custody arrangement, and what controls sit around
  it?
why: >
  Custody is where this differs most from any asset already on the balance
  sheet. The committee is entitled to know who can move the holding, what has
  to happen first, and who would know if it moved.
facts: []
::

::section id=segregation
prompt: >
  How are duties segregated over key material and over transaction
  approval?
why: >
  The classic failure is one person holding both the authority to transact and
  the means to transact. Whether these are the same person, and what stops
  them, is the control the committee will want documented.
facts: []
::

::section id=auditor-enquiries
prompt: >
  Which lines of enquiry is the auditor likely to open, and what
  would answer each?
why: >
  Anticipating the questions is not the same as answering for the auditor. A
  committee that can see the enquiries coming can decide what evidence to
  assemble before the fieldwork rather than during it.
facts: []
::

::section id=open-items
prompt: >
  What remains open for management, and by when does each need to
  be resolved?
why: >
  Every note of this kind ends with unfinished items. Recording them here, with
  dates, is what turns them into a management action rather than a paragraph
  the committee reads twice and forgets.
facts: []
::
$template$
);


-- ------------------------------------------------------------
-- Verification
-- ------------------------------------------------------------
-- Three corporate templates, all drafts:
--   SELECT slug, artefact_type, status FROM prepare_templates
--    WHERE client_type = 'corporate' ORDER BY slug;
--
-- No section accepts citations — precedent belongs in the board
-- paper, and a second candidate home would make the register's
-- cite action a coin toss:
--   SELECT slug FROM prepare_templates
--    WHERE body LIKE '%accepts_citations: true%';
-- ------------------------------------------------------------
