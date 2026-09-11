-- ============================================================
-- SEED — BOARD PAPER TEMPLATE
-- ============================================================
-- Depends on: 20260911040000_prepare.sql
--
-- The corporate counterpart to the trustee minute, and the first
-- template with a precedent section — which is what makes **Cite in
-- a pack** more than a mechanism. Without a template that declares
-- `accepts_citations`, the register's cite action has nowhere to
-- put a fact and correctly offers no pack at all.
--
-- INSERTED AS 'draft', NOT 'active', for the same reason as the
-- trustee minute: active_requires_lex_review would reject an active
-- row with no reviewer, and the right response to that constraint
-- is to respect it. See the trustee minute migration header for the
-- UPDATE that publishes it.
--
-- Section 10 is the spine of the artefact. It is a list of
-- questions, it is entirely BTS-authored, and it contains no
-- recommendation — which is precisely why it is the most useful
-- page in the document.
--
-- Section 5 is the precedent section. Note what it asks and what it
-- does not: how other entities implemented this, never how it went
-- for them. The register cannot serve outcome facts, so a citation
-- landing here cannot carry one.
-- ============================================================

INSERT INTO prepare_templates (
  slug, title, artefact_type, client_type, version, status,
  facts_required, regulatory_references, notes, body
) VALUES (
  'board-paper-treasury',
  'Board paper — bitcoin as a treasury asset',
  'board_paper',
  'corporate',
  '1.0',
  'draft',
  ARRAY['btc_spot_aud', 'btc_realised_vol_90d', 'au_cash_rate'],
  ARRAY['AASB 138', 'Corporations Amendment (Digital Assets Framework) Act 2026'],
  'Seeded with the client app. Not reviewed. See the migration header to publish.',
$template$---
slug: board-paper-treasury
version: 1.0
artefact_type: board_paper
client_type: corporate
title: Board paper — bitcoin as a treasury asset
regulatory_references:
  - AASB 138
  - Corporations Amendment (Digital Assets Framework) Act 2026
facts_required:
  - btc_spot_aud
  - btc_realised_vol_90d
  - au_cash_rate
---

::section id=purpose
prompt: What decision, if any, is being sought from the board at this meeting?
why: >
  A paper that does not name the decision invites the board to infer one.
  Naming it — including "no decision is sought at this meeting" — is what makes
  the paper safe to table.
facts: []
::

::section id=why-now
prompt: Why is this on the agenda now rather than at some other time?
why: >
  Boards read timing as argument. Saying plainly what prompted the paper — a
  policy review, a question from a director, an external change — stops them
  inferring urgency that was never claimed.
facts: []
::

::section id=what-it-is
prompt: >
  What is the asset, in terms this board already uses, and what is it
  not?
why: >
  Half the objections in the room are to something the asset is not. Defining
  it in the board's own vocabulary, and naming what it is not, retires those
  objections before they are raised.
facts: []
::

::section id=market-context
prompt: >
  What context does the board need about current conditions, and what
  period are you asking them to consider?
why: >
  Boards read a single price as a recommendation. Framing the period yourself
  is how you stop them doing that.
facts: [btc_spot_aud, btc_realised_vol_90d, au_cash_rate]
::

::section id=precedent
prompt: >
  How have other Australian entities implemented this, and what can
  be taken from how they did it?
why: >
  A board's first question is who else has done this and what happened to
  them. The first half is answerable from the register — the accounting
  standard applied, the custody model chosen, the authority relied on, how it
  was disclosed. The second half is not, and this paper does not attempt it:
  how an entity's share price moved afterwards is a question about that
  entity, not about this decision.
facts: []
accepts_citations: true
::

::section id=accounting
prompt: >
  What accounting treatment applies, and how would it move reported
  results?
why: >
  The measurement basis determines whether movements reach the profit and loss
  or sit in equity, which is the difference between a treasury decision and an
  earnings-volatility decision as far as the audit committee is concerned.
facts: []
regulatory_reference: AASB 138
::

::section id=custody
prompt: >
  Which custody model is under consideration, and what operational
  risk does it carry?
why: >
  Custody is where this differs most from any asset the company already holds.
  A board that has approved a position without understanding who can move it
  has approved something other than what it thought.
facts: []
::

::section id=regulatory
prompt: >
  What is the Australian regulatory position, and what is the
  licensing status of any provider being considered?
why: >
  Digital asset platforms became financial products in April 2026 and the
  transition arrangements run for eighteen months. Provider status moves during
  that period, so the as-at date on this answer matters more than usual.
facts: []
regulatory_reference: Corporations Amendment (Digital Assets Framework) Act 2026
::

::section id=risks
prompt: What are the risks, and how would each be managed?
why: >
  A risk named without a management response reads as an argument against. A
  risk named with one reads as a decision taken with open eyes, which is what
  a board minute should record.
facts: []
::

::section id=board-questions
prompt: >
  What questions should the board be able to answer before deciding
  anything?
why: >
  This is the spine of the paper. A board that can answer these has considered
  the matter properly; one that cannot has not, whichever way it votes. The
  questions are the same regardless of the answer, which is why they can be
  asked without recommending anything.
facts: []
::

::section id=asked-of-board
prompt: What exactly is being asked of the board?
why: >
  The closing restatement. If it does not match the purpose stated at the top,
  the paper drifted while it was being written, and this is where that becomes
  visible.
facts: []
::
$template$
);


-- ------------------------------------------------------------
-- Verification
-- ------------------------------------------------------------
-- Exactly one section may accept citations, and this template is
-- the one that has it:
--   SELECT slug FROM prepare_templates
--    WHERE body LIKE '%accepts_citations: true%';
--
-- Both seeded templates should be drafts:
--   SELECT slug, client_type, status FROM prepare_templates ORDER BY slug;
-- ------------------------------------------------------------
