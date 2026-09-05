-- ============================================================
-- CORPORATE HOLDINGS — the Locate Technologies record, by hand
-- Source: docs/features/corporate-holdings/locate-technologies-dossier.md
--         (discovery prototype, revision 4, verified 12 August 2026)
--
-- The regional register is seeded by hand. Discovery automation costs
-- more than the manual pass, and the manual pass produces the ground
-- truth the ingest workflow is tested against: session 2 runs
-- researchIngestWorkflow over the same documents and diffs its output
-- against these rows.
--
-- Everything here is real, and lands with is_published = FALSE. v1 is
-- internal only; nothing reaches a client-facing surface until Lex's
-- classifications are approved by a director.
--
-- ## Three places the source-class gate changed what could be entered
--
-- 1. The 31 December 2025 holdings figure is NOT here. The dossier
--    sources it to the Q3 FY26 investor presentation — source rank 4,
--    against a required rank 2 for any ledger row. The 31 March 2026
--    figure is here because a quarterly announcement carries it.
-- 2. The custody claim on the company's own About page is stored, but
--    only as a superseded fact pointing at the offer document that beat
--    it. Deleting it would destroy the evidence that the gate did
--    anything, and this record is the reason the gate exists.
-- 3. The Treasury Management Policy PDF is registered as a document but
--    populates nothing. It has been located and not parsed, and as a
--    company-directory file it is rank 5 — it could not populate the
--    mandate field even once parsed. The mandate below comes from the
--    offer document, which is where its terms were actually read.
--
-- ## Dates the sources do not give
--
-- Recorded as precisely as the documents allow and no further. Where a
-- source gives a month, the note says so rather than the row implying a
-- day nobody disclosed; where a source gives no date at all,
-- published_at is NULL rather than a plausible guess.
-- ============================================================

DO $$
DECLARE
  co        UUID;
  d_pds     UUID;
  d_treas   UUID;
  d_place   UUID;
  d_q3ann   UUID;
  d_capnote UUID;
  d_pres    UUID;
  d_about   UUID;
  d_policy  UUID;
  d_lq      UUID;
  d_h1      UUID;
  f_custody UUID;
BEGIN

-- ------------------------------------------------------------
-- Company
-- ------------------------------------------------------------
INSERT INTO research_companies (
  slug, legal_name, isin, jurisdiction, operational_hq,
  primary_archetype, self_described_archetype,
  reporting_standard, functional_currency, presentation_currency,
  financial_year_end, tier, expected_disclosure_cadence,
  market_cap_band, funding_source, curator_notes, last_verified_at, is_published
) VALUES (
  'locate-technologies',
  'Locate Technologies Limited',
  'NZLOCE0001S9',
  'NZ',
  'Pyrmont, New South Wales',
  -- Both labels are correct, which is why the schema carries both. The
  -- offer document describes a dual identity: a logistics technology
  -- provider and a treasury manager. The operating business is real and
  -- growing; the accumulation is funded from capital markets.
  'treasury_allocation',
  'treasury_company',
  'nz_ifrs',
  'AUD',   -- operating results
  'NZD',   -- investor reporting
  '06-30',
  'regional',
  'episodic',
  'micro',
  'equity_issuance',
  'Entity resolution breaks three ways on this record. The name and the code moved '
  'together (Zoom2u Technologies / Z2U to Locate Technologies / LOC, May 2025), so a '
  'ticker-keyed ingest and a name-keyed ingest each lose a different slice of history. '
  'Two entities traded as LOC on two exchanges with an overlap period, so announcements '
  'must be attributed to the filing entity rather than the code. And an unrelated '
  'Canadian namesake outranks the real company in full-text search. '
  'The most valuable document on this page — the Treasury Management Policy — sits on '
  'the company document directory under the current name, while the announcements that '
  'establish the ledger were filed under the old one.',
  DATE '2026-08-12',
  FALSE
)
ON CONFLICT (slug) DO NOTHING
RETURNING id INTO co;

IF co IS NULL THEN
  SELECT id INTO co FROM research_companies WHERE slug = 'locate-technologies';
END IF;

-- ------------------------------------------------------------
-- Identity history — rule 3, as data
-- ------------------------------------------------------------
INSERT INTO company_former_names (company_id, name, used_from, used_to, note) VALUES
  (co, 'Zoom2u Technologies Limited', DATE '2021-09-01', DATE '2025-05-31',
   'Renamed May 2025; the offer document gives the month, not the day. '
   'The ASX code changed with the name.')
ON CONFLICT (company_id, name) DO NOTHING;

INSERT INTO company_listings
  (company_id, venue, ticker, listing_type, filing_entity, listed_from, listed_to, note)
VALUES
  (co, 'asx', 'Z2U', 'primary', 'Zoom2u Technologies Limited',
   DATE '2021-09-01', DATE '2025-05-31',
   'Listed September 2021; the source gives the month. Code retired at the rename.'),
  (co, 'asx', 'LOC', 'primary', 'Locate Technologies Limited (Australia)',
   DATE '2025-06-01', DATE '2025-12-17',
   'Delisted 17 December 2025, the day after the scheme was implemented.'),
  (co, 'nzx', 'LOC', 'primary', 'Locate Technologies Limited (NZ)',
   DATE '2025-12-03', NULL,
   'NZX Main Board. Quotation began 3 December 2025, two weeks before the '
   'ASX delisting — the two entities overlapped under the same code.')
ON CONFLICT (company_id, venue, ticker, listed_from) DO NOTHING;

-- ------------------------------------------------------------
-- Documents
--
-- The offer document is the highest-yield artefact by a wide margin: it
-- resolved custody, mandate, the listing determination, the covenant
-- structure and the acquisition history after four rounds of searching
-- had produced none of them.
-- ------------------------------------------------------------
INSERT INTO research_documents
  (company_id, document_type, source_class, title, venue, announcement_id, pdf_url,
   published_at, filing_entity, is_audited)
VALUES
  (co, 'offer_document', 'regulated_disclosure',
   'Product Disclosure Statement', 'company', 'PDS-2025-11-03',
   'https://locatetech.nz/documents/pds.pdf', DATE '2025-11-03',
   'Locate Technologies Limited (NZ)', TRUE)
ON CONFLICT (company_id, venue, announcement_id) DO NOTHING
RETURNING id INTO d_pds;

INSERT INTO research_documents
  (company_id, document_type, source_class, title, venue, announcement_id, published_at,
   filing_entity, is_audited)
VALUES
  (co, 'announcement', 'exchange_announcement', 'Treasury Update', 'asx',
   'ASX-2025-06-04-TREASURY-UPDATE', DATE '2025-06-04',
   'Locate Technologies Limited (Australia)', FALSE)
ON CONFLICT (company_id, venue, announcement_id) DO NOTHING
RETURNING id INTO d_treas;

INSERT INTO research_documents
  (company_id, document_type, source_class, title, venue, announcement_id, published_at,
   filing_entity, is_audited)
VALUES
  (co, 'capital_notice', 'exchange_announcement',
   'Placement and at-the-market facility', 'asx', 'ASX-2025-05-29-PLACEMENT',
   DATE '2025-05-29', 'Locate Technologies Limited (Australia)', FALSE),
  -- published_at is NULL: the dossier cites this announcement by number
  -- and does not give its date. A plausible guess would be indistinguishable
  -- from a sourced one on the page.
  (co, 'quarterly_4c', 'exchange_announcement', 'Q3 FY26 quarterly update', 'nzx',
   '471376', NULL, 'Locate Technologies Limited (NZ)', FALSE),
  (co, 'capital_notice', 'exchange_announcement',
   'Notice of issue and correction to securities on issue', 'nzx', '475783',
   DATE '2026-07-07', 'Locate Technologies Limited (NZ)', FALSE),
  (co, 'other', 'investor_presentation', 'Q3 FY26 investor presentation', 'nzx',
   'PRES-Q3-FY26', DATE '2026-04-20', 'Locate Technologies Limited (NZ)', FALSE),
  (co, 'other', 'company_web', 'About us', 'company', 'WEB-ABOUT',
   NULL, 'Locate Technologies Limited (NZ)', FALSE),
  -- Located, not parsed. Registered so the gap is visible and so the
  -- fetch layer has something to resolve; it populates nothing, and as a
  -- company-directory file it could not populate the mandate field even
  -- once parsed.
  (co, 'playbook', 'company_web', 'Treasury Management Policy', 'company',
   'DOC-TREASURY-POLICY', NULL, 'Locate Technologies Limited (NZ)', FALSE),
  (co, 'other', 'exchange_announcement', 'Listing and quotation notice', 'nzx',
   '463829', NULL, 'Locate Technologies Limited (NZ)', FALSE),
  (co, 'half_year', 'exchange_announcement', 'Half-year report, H1 FY26', 'nzx',
   'NZX-2026-02-25-H1', DATE '2026-02-25', 'Locate Technologies Limited (NZ)', FALSE)
ON CONFLICT (company_id, venue, announcement_id) DO NOTHING;

UPDATE research_documents SET pdf_url = 'https://locatetech.nz/about'
 WHERE company_id = co AND announcement_id = 'WEB-ABOUT' AND pdf_url IS NULL;
UPDATE research_documents
   SET pdf_url = 'https://locatetech.nz/documents/LOC - Treasury Management Policy (final).pdf'
 WHERE company_id = co AND announcement_id = 'DOC-TREASURY-POLICY' AND pdf_url IS NULL;

SELECT id INTO d_pds     FROM research_documents WHERE company_id = co AND announcement_id = 'PDS-2025-11-03';
SELECT id INTO d_treas   FROM research_documents WHERE company_id = co AND announcement_id = 'ASX-2025-06-04-TREASURY-UPDATE';
SELECT id INTO d_place   FROM research_documents WHERE company_id = co AND announcement_id = 'ASX-2025-05-29-PLACEMENT';
SELECT id INTO d_q3ann   FROM research_documents WHERE company_id = co AND announcement_id = '471376';
SELECT id INTO d_capnote FROM research_documents WHERE company_id = co AND announcement_id = '475783';
SELECT id INTO d_pres    FROM research_documents WHERE company_id = co AND announcement_id = 'PRES-Q3-FY26';
SELECT id INTO d_about   FROM research_documents WHERE company_id = co AND announcement_id = 'WEB-ABOUT';
SELECT id INTO d_policy  FROM research_documents WHERE company_id = co AND announcement_id = 'DOC-TREASURY-POLICY';
SELECT id INTO d_lq      FROM research_documents WHERE company_id = co AND announcement_id = '463829';
SELECT id INTO d_h1      FROM research_documents WHERE company_id = co AND announcement_id = 'NZX-2026-02-25-H1';

-- ------------------------------------------------------------
-- Ledger
--
-- The first acquisition is the row three credible secondary sources got
-- wrong. Two reported figures — roughly A$647,500 and roughly
-- US$667,000 — against A$1,000,000 in the announcement. The correct
-- number is about 50% higher than one of them, and a CFO might have
-- quoted either in a board paper.
-- ------------------------------------------------------------
INSERT INTO treasury_events
  (company_id, event_type, asset_class, event_date, quantity, consideration_native,
   native_currency, fees_included, headline, detail, disclosure_venue, filing_entity,
   basis, source_document_id, natural_key)
VALUES
  (co, 'policy_adoption', 'btc', DATE '2025-01-01', NULL, NULL, NULL, NULL,
   'Treasury management policy adopted',
   'Adopted by the Australian entity in January 2025; the offer document gives the '
   'month, not the day. Bitcoin only, no other digital asset class. Acquisition is '
   'permitted only where forecast cash reserves remain sufficient to meet operational '
   'obligations and lender covenant requirements with a buffer above both — the stated '
   'clause requires cash reserves to remain more than 20% above the forecast cash needed '
   'to meet covenant requirements per the most recent monthly cashflow forecast. '
   'Transactions above a prescribed limit require prior board approval; all transactions '
   'require authorisation by at least two directors or senior executives.',
   'asx', 'Locate Technologies Limited (Australia)', NULL, d_pds, 'loc:policy:2025-01'),

  (co, 'capital_raise', 'btc', DATE '2025-05-29', NULL, 1450000, 'AUD', NULL,
   'Placement and at-the-market facility established',
   'A$1.45m placement at A$0.07 per share, alongside a A$2m at-the-market facility. '
   'Under the facility the broker holds collateral shares issued for nil consideration, '
   'sells them on market within price and volume limits set by the company, and receives '
   'replacement shares.',
   'asx', 'Locate Technologies Limited (Australia)', NULL, d_place, 'loc:raise:2025-05-29'),

  (co, 'acquisition', 'btc', DATE '2025-06-04', 6.08914, 1000000, 'AUD', TRUE,
   'First acquisition',
   'A$164,227 average per bitcoin, inclusive of fees and expenses — which is why the '
   'stated consideration does not reconcile against an average price computed from the '
   'quantity alone. Two secondary sources reported roughly A$647,500 and roughly '
   'US$667,000 for this purchase. Both were wrong.',
   'asx', 'Locate Technologies Limited (Australia)', 'direct_spot', d_treas,
   'loc:acq:2025-06-04'),

  (co, 'capital_raise', 'btc', DATE '2025-07-01', NULL, 392564, 'AUD', NULL,
   'At-the-market issuance',
   '1,825,322 shares issued between 26 June and 1 July 2025 at A$0.185 to A$0.240, '
   'averaging A$0.215.',
   'asx', 'Locate Technologies Limited (Australia)', NULL, d_pds, 'loc:raise:2025-07-01'),

  (co, 'covenant_change', 'btc', DATE '2025-08-14', NULL, NULL, NULL, NULL,
   'Cash covenant amended to admit and require bitcoin',
   'The borrower is the Australian entity under a secured facility with A$4,000,000 '
   'principal outstanding at 30 June 2025, guaranteed by all group members and secured '
   'over all present and after-acquired property. The EBITDA covenant was missed for the '
   'quarters ending 31 December 2024, 31 March 2025 and 30 June 2025, and again for the '
   'September 2025 quarter; the cash balance temporarily fell below the minimum in the '
   'March 2025 quarter. Each was waived. On 14 August 2025 the cash covenant was formally '
   'amended: the replacement requires a minimum bitcoin balance of A$500,000, with '
   'aggregate cash and bitcoin of at least A$1.35m. The offer document states the change '
   'was made in recognition of the adoption of bitcoin as a treasury reserve asset. '
   'A secured Australian lender rewrote a liquidity covenant to admit — and then to '
   'require — the asset.',
   'asx', 'Locate Technologies Limited (Australia)', NULL, d_pds, 'loc:covenant:2025-08-14'),

  (co, 'accounting_election', 'btc', DATE '2025-11-03', NULL, NULL, NULL, NULL,
   'Indefinite-life intangible under the revaluation model',
   'Bitcoin is recognised at cost and subsequently remeasured to fair value at each '
   'reporting date. Upward revaluations go to other comprehensive income and do not '
   'contribute to profit unless they reverse prior losses; downward revaluations '
   'exceeding the revaluation reserve are charged directly to profit or loss. The company '
   'notes this may create periods where statutory earnings do not reflect the underlying '
   'strategy, and flags that significant downward revaluations could create pressure '
   'against debt covenants. Disclosed in the risk factors under a heading about '
   'accounting treatment, not in the financial information section — four rounds of '
   'searching the accounts missed it.',
   'nzx', 'Locate Technologies Limited (NZ)', NULL, d_pds, 'loc:accounting:aasb138'),

  (co, 'listing_change', 'btc', DATE '2025-12-17', NULL, NULL, NULL, NULL,
   'Migration to a venue with no cash-box test',
   'Top-hat scheme of arrangement: the NZ entity acquired all shares in the Australian '
   'entity one for one, conditional on shareholder approval, court approval, an '
   'independent expert conclusion, and a tax ruling confirming scrip-for-scrip rollover '
   'relief for shareholders holding on capital account. Quotation on the new venue began '
   '3 December 2025, the scheme was implemented on 16 December and the prior listing '
   'ended on 17 December. The company was advised that its bitcoin was considered an '
   'asset in a form readily convertible to cash, and that it risked suspension under the '
   'prior venue cash-box rule if it continued. The new venue has no equivalent rule. '
   'Operations remained in New South Wales throughout.',
   'nzx', 'Locate Technologies Limited (NZ)', NULL, d_pds, 'loc:listing:2025-12-17'),

  -- The finding no holdings-only watcher sees. Neither document says it
  -- on its own: the quarterly reports an undrawn facility, the
  -- presentation announces a buyback, and the posture change is the join.
  (co, 'capital_posture_change', 'btc', DATE '2026-04-20', NULL, NULL, NULL, NULL,
   'On-market buyback announced while the issuance facility sat undrawn',
   'No at-the-market capital was drawn during the quarter to 31 March 2026 and holdings '
   'were unchanged, per the quarterly update. An on-market buyback of up to twelve '
   'months was announced on 20 April 2026, subject to caps, operating only during '
   'permitted periods and terminable at will — that announcement is in the Q3 FY26 '
   'investor presentation, which is below the source class this ledger accepts, so this '
   'row is sourced to the quarterly. An accumulation facility and a buyback point in '
   'opposite directions on the share register.',
   'nzx', 'Locate Technologies Limited (NZ)', NULL, d_q3ann, 'loc:posture:2026-04-20'),

  (co, 'capital_raise', 'btc', DATE '2026-07-01', NULL, NULL, NULL, NULL,
   'Shares issued in settlement of a revenue royalty buyout',
   '10,000,000 shares issued to the lender in settlement of the buyout of the SaaS '
   'revenue royalty. A notice re-issued on 7 July 2026 corrected shares on issue from '
   '307,378,078 to 307,287,539 — a difference of 90,539, being buyback shares not yet '
   'cancelled on the register. That is 0.03%: administrative, and below any materiality '
   'floor worth reporting.',
   'nzx', 'Locate Technologies Limited (NZ)', NULL, d_capnote, 'loc:raise:2026-07-01')
ON CONFLICT (company_id, natural_key) DO NOTHING;

-- ------------------------------------------------------------
-- Position
--
-- Every row direct spot: this issuer holds bitcoin and nothing else,
-- with no vehicle in between and no customer assets alongside. It is the
-- record against which the other two failure modes are visible.
-- ------------------------------------------------------------
INSERT INTO treasury_holdings_snapshots
  (company_id, as_of_date, asset, instrument_type, quantity, basis,
   value_native, native_currency, source_document_id, natural_key)
VALUES
  (co, DATE '2025-06-04', 'btc', 'spot', 6.08914, 'direct_spot',
   1000000, 'AUD', d_treas, 'loc:pos:2025-06-04'),
  (co, DATE '2025-06-30', 'btc', 'spot', 10.1, 'direct_spot',
   1600000, 'AUD', d_pds, 'loc:pos:2025-06-30'),
  (co, DATE '2025-07-30', 'btc', 'spot', 12.3, 'direct_spot',
   NULL, NULL, d_pds, 'loc:pos:2025-07-30'),
  (co, DATE '2025-09-23', 'btc', 'spot', 12.3, 'direct_spot',
   2100000, 'AUD', d_pds, 'loc:pos:2025-09-23'),
  -- The 31 December 2025 figure is deliberately absent; see the header.
  (co, DATE '2026-03-31', 'btc', 'spot', 12.3, 'direct_spot',
   NULL, NULL, d_q3ann, 'loc:pos:2026-03-31')
ON CONFLICT (company_id, natural_key) DO NOTHING;

-- ------------------------------------------------------------
-- Qualitative facts, and the custody conflict
-- ------------------------------------------------------------
INSERT INTO research_company_facts
  (company_id, field_key, label, value, as_of, source_document_id, natural_key)
VALUES
  (co, 'custody', 'Custody',
   'Held with an institutional custodian whose shareholders include four regulated '
   'banking and trust groups. Bitcoin is transferred to the custodian immediately on '
   'settlement and is not retained with brokers for storage; holdings sit in segregated '
   'accounts. The company can pursue uncapped damages against the custodian for loss due '
   'to fraud, wilful misconduct, or liability that cannot lawfully be limited, and '
   'intends to engage multiple independent custodians to reduce single-point-of-failure '
   'risk.' || E'\n\n' ||
   '**No insurance is in place.** The company was engaging with brokers about additional '
   'bitcoin insurance and had arranged none as at the offer document date. Reliance on '
   'third-party custodians is listed as a key risk, naming cybersecurity breach, '
   'operational failure and custodian insolvency as causes of partial or total loss.',
   DATE '2025-11-03', d_pds, 'loc:fact:custody'),

  (co, 'mandate', 'Mandate and authority',
   'Bitcoin only; no other digital asset class. Acquisition is permitted only where '
   'forecast cash reserves remain sufficient to meet operational obligations and lender '
   'covenant requirements with a buffer above both. Transactions above a prescribed '
   'monetary limit require prior board approval; below it senior executives may authorise '
   'provided the liquidity buffers hold. All transactions require authorisation by at '
   'least two directors or senior executives, and settlement funds are released only '
   'under dual authorisation. Counterparties are accredited brokers selected on '
   'liquidity, transaction size, execution pricing and counterparty risk. Disposal is not '
   'anticipated other than to maintain liquidity buffers or comply with covenants.'
   || E'\n\n' ||
   'This is the most directly transferable artefact in the record. The structure — '
   'permitted assets, a liquidity gate tied to covenant headroom, dual authorisation, '
   'delegated authority thresholds — can be lifted by an unlisted company without '
   'lifting the thesis.',
   DATE '2025-11-03', d_pds, 'loc:fact:mandate'),

  (co, 'accounting_treatment', 'Accounting treatment',
   'Intangible asset with an indefinite useful life, revaluation model. Gains bypass '
   'profit and accumulate in a revaluation reserve; losses land in profit once that '
   'reserve is exhausted. The company states the standards applying either side of its '
   'migration are aligned, with no effective difference in recognition, measurement or '
   'disclosure. No hedging is in place, and the company commits to adopting and '
   'disclosing a policy if that changes. Independent verification of holdings forms part '
   'of annual reporting, including external auditor confirmation of existence and '
   'valuation.',
   DATE '2025-11-03', d_pds, 'loc:fact:accounting'),

  (co, 'covenants', 'Financing and covenants',
   'A$4,000,000 principal outstanding at 30 June 2025 under a secured facility, '
   'guaranteed by all group members and secured over all present and after-acquired '
   'property. The EBITDA covenant has been breached repeatedly and waived each time. The '
   'cash covenant was amended on 14 August 2025 to require a minimum bitcoin balance and '
   'a combined cash-and-bitcoin floor. The company assesses the likelihood of further '
   'breaches as moderate to high, and states that unremedied and unwaived breaches could '
   'lead to a demand for immediate repayment or enforcement of the security — in severe '
   'cases threatening the ability to continue as a going concern.',
   DATE '2025-11-03', d_pds, 'loc:fact:covenants'),

  (co, 'operating_metric', 'Operating context',
   'Quarter to 31 March 2026, in NZD: group revenue $1.80m, up 15% year on year; the '
   'SaaS segment $1.08m, up 42%, now 60% of group; the marketplace segment $0.72m, down '
   '11%. Reported EBITDA +$167k, the first positive group quarter. Cash $1.1m. '
   'Approximately 500 paying SaaS clients across five countries. The three largest '
   'marketplace customers accounted for approximately 33% of that segment FY25 revenue.'
   || E'\n\n' ||
   'From an investor presentation, which is explicitly unaudited — acceptable for an '
   'operating metric and not for anything in the ledger.',
   DATE '2026-04-20', d_pres, 'loc:fact:operating')
ON CONFLICT (company_id, natural_key) DO NOTHING;

SELECT id INTO f_custody FROM research_company_facts
 WHERE company_id = co AND natural_key = 'loc:fact:custody';

-- The claim that lost. Revision 2 of the dossier recorded this as the
-- answer on the strength of the website, and it was wrong in the
-- direction that flatters. It is stored, superseded, and rendered beside
-- the document that beat it — because the conflict is the finding, and a
-- register that silently resolved it would be teaching the wrong lesson.
INSERT INTO research_company_facts
  (company_id, field_key, label, value, as_of, source_document_id,
   is_superseded, superseded_by, natural_key)
VALUES
  (co, 'custody', 'Custody — company website claim',
   'The company About page states that self-custody means it controls its treasury '
   'directly with no counterparty risk, and that self-custody capability means no '
   'reliance on banks or intermediaries. The offer document — a regulated disclosure — '
   'says the opposite: a named third-party institutional custodian, with custodian '
   'insolvency listed as a key risk.',
   NULL, d_about, TRUE, f_custody, 'loc:fact:custody-web')
ON CONFLICT (company_id, natural_key) DO NOTHING;

-- ------------------------------------------------------------
-- Classification
--
-- Lex's pass, entered from the dossier's own restricted list. Rows are
-- classified per field, and anything absent defaults to internal — which
-- is why the restricted entries below are recorded explicitly rather
-- than left to the default. Nothing is approved: approved_by is null on
-- every row, and the publishable view requires the company to be
-- published as well, which it is not.
-- ------------------------------------------------------------
INSERT INTO research_classifications
  (subject_table, subject_id, field_key, classification, reason, classified_by)
SELECT 'treasury_events', e.id, 'ledger_event',
  CASE
    -- Reads on credit quality, which is a view on the security.
    WHEN e.natural_key = 'loc:covenant:2025-08-14' THEN 'internal'
    ELSE 'publishable'
  END,
  CASE
    WHEN e.natural_key = 'loc:covenant:2025-08-14'
      THEN 'Characterising a covenant waiver or amendment carries an implied view on '
           'credit quality. The fact is disclosed and citable; the reading is not.'
    ELSE 'A disclosed fact with a citation, stating what was done and where it was said. '
         'No inference about the security.'
  END,
  'lex'
FROM treasury_events e
WHERE e.company_id = co
ON CONFLICT (subject_table, subject_id, field_key) DO NOTHING;

INSERT INTO research_classifications
  (subject_table, subject_id, field_key, classification, reason, classified_by)
VALUES
  ('research_companies', co, 'unrealised_position', 'restricted',
   'Position against cost basis is a valuation output. The register states what was '
   'disclosed, never what it is worth.', 'lex'),
  ('research_companies', co, 'nav_premium', 'restricted',
   'mNAV, premium or discount to bitcoin NAV, and bitcoin per share are all valuation '
   'measures of a listed security.', 'lex'),
  ('research_companies', co, 'share_price_attribution', 'restricted',
   'Attributing a share price movement to a treasury announcement is a statement about '
   'the security.', 'lex'),
  ('research_companies', co, 'dilution_narration', 'restricted',
   'Narrating dilution from issuance, or accretion from the buyback, is a view on '
   'shareholder outcomes.', 'lex'),
  ('research_companies', co, 'buyback_inference', 'restricted',
   'Inferring management view of the share price from a buyback is a valuation '
   'statement, however it is phrased.', 'lex'),
  ('research_companies', co, 'shareholder_outcome_comparison', 'restricted',
   'Comparing the shareholder outcome against holding bitcoin directly is advice-shaped '
   'and compares two investments.', 'lex'),
  ('research_companies', co, 'covenant_credit_signal', 'restricted',
   'Characterising the covenant waivers as a credit-quality signal is a credit view on a '
   'listed borrower.', 'lex'),
  -- The one that is allowed, and the condition it is allowed under.
  ('research_companies', co, 'disclosed_market_cap_proportion', 'publishable',
   'The company disclosed bitcoin at approximately 13% of market capitalisation as at '
   '23 September 2025. A company-disclosed statistic is citable with its date. '
   'Recomputing it at a later price is a valuation exercise and is not.', 'lex'),
  ('research_companies', co, 'curator_notes', 'internal',
   'Curator notes describe retrieval traps and record provenance. Working material, not '
   'a client-facing claim.', 'lex')
ON CONFLICT (subject_table, subject_id, field_key) DO NOTHING;

END $$;
