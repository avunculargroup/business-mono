-- ============================================================
-- CORPORATE HOLDINGS — records 2 and 3: DigitalX and Block, by hand
-- Sources: docs/features/corporate-holdings/digitalx-dossier.md
--          docs/features/corporate-holdings/block-inc-dossier.md
--          (discovery prototypes, both verified 12 August 2026)
--
-- Scope: identity, listings, documents and the facts the source-class
-- gate admits. **No ledger.** No treasury_events, no holdings
-- snapshots.
--
-- That boundary is deliberate. The ingest acceptance criterion is to
-- run researchIngest over a company's own filings and diff its output
-- against a hand-entered record. Locate is that baseline. Hand-entering
-- the ledger here as well would spend records 2 and 3 as independent
-- checks on the workflow before it has ever run — three hand-made
-- records prove only that the same pair of hands made all three. So the
-- register gets the companies, the pages get their documents and
-- absences, and the quantities wait for the run that is supposed to
-- produce them.
--
-- Everything here is real, and lands with is_published = FALSE.
--
-- ## What the source-class gate refused, and where it went instead
--
-- Four claims in these dossiers cannot be stored as facts. Each is
-- recorded in curator_notes with its provenance, and the document it
-- came from is registered so the claim has a visible home:
--
-- 1. DigitalX's 17 February 1999 ASX listing date. The dossier sources
--    it to a third-party profile — source rank 6, against rank 5 for
--    even the most permissive field. The gate admits no rank 6 source
--    for any field at all.
-- 2. Block's ISIN, its former tickers and its FY2025 financials, all
--    sourced to an encyclopaedia and marked [UNVERIFIED] in the dossier.
--    `isin` is left NULL on the company row rather than filled from an
--    unverified source: it is key material, and the register resolves
--    on registration numbers.
-- 3. Block's accounting treatment. ASU 2023-08 early adoption is the
--    single strongest teaching point across all three records, and it
--    cannot be entered. It lives in the 10-K, which is `audited_accounts`
--    at rank 3, while `accounting_treatment` demands rank 2 or better.
--    See the note at the foot of this file — this looks like an
--    ordering bug in field_source_minimums rather than a judgement about
--    Block, and it is deliberately not worked around here.
-- 4. Block's DCA purchase policy. The Bitcoin Blueprint is a file on the
--    company's own document directory — rank 5 against `mandate`'s
--    required rank 2. Registered and populating nothing, exactly as
--    Locate's Treasury Management Policy is.
--
-- DigitalX's Appendix 4E carries its accounting treatment, so that one
-- record does have the fact its sibling cannot.
--
-- ## Dates the sources do not give
--
-- Same rule as the Locate seed: recorded as precisely as the documents
-- allow and no further. Where a dossier gives a month, published_at is
-- NULL and the title carries the month, rather than the row implying a
-- day nobody disclosed.
-- ============================================================

DO $$
DECLARE
  dx          UUID;
  dx_4c       UUID;
  dx_treasury UUID;
  dx_4e       UUID;
  dx_asxq     UUID;
  dx_siap     UUID;
  dx_profile  UUID;

  bk          UUID;
  bk_4a_jul   UUID;
  bk_4a_may   UUID;
  bk_bp       UUID;
  bk_trans    UUID;
  bk_profile  UUID;
BEGIN

-- ============================================================
-- RECORD 2 — DigitalX Limited
-- ============================================================

INSERT INTO research_companies (
  slug, legal_name, abn, jurisdiction, operational_hq,
  primary_archetype, self_described_archetype,
  reporting_standard, functional_currency, presentation_currency,
  financial_year_end, tier, expected_disclosure_cadence,
  market_cap_band, funding_source, curator_notes, last_verified_at, is_published
) VALUES (
  'digitalx',
  'DigitalX Limited',
  '59 009 575 035',
  'AU',
  'West Perth, Western Australia',
  -- A funds manager whose balance sheet holds the asset class it sells.
  -- Not a treasury decision an operating CFO can learn from.
  'native_exposure',
  -- And yet the March 2026 quarterly headlines it as "Australia's
  -- largest ASX-listed Bitcoin company". The divergence is why the
  -- schema carries both columns.
  'treasury_company',
  'aasb',
  'AUD',
  'AUD',
  '06-30',
  'regional',
  -- Monthly treasury announcements, against Locate's episodic ones.
  -- This is what makes the freshness stamp mean something: silence here
  -- is a signal, and silence at Locate is normal.
  'monthly',
  'micro',
  -- Equity issues fund the business; the position sits on the existing
  -- balance sheet and is not externally funded.
  'balance_sheet',
  'Archetype gates comparison on this record rather than labelling it. A funds manager '
  'has no treasury policy to lift, no board approval path worth studying and no covenant '
  'story, so rendering it in a table beside an operating company would actively mislead. '
  'Identifier trap: the March 2026 quarterly gives the OTC ticker as DGGFX in its own '
  'header and DGGXF in the body — one primary document, two spellings of one identifier, '
  'which is why single-document trust is not enough for identifier fields. '
  'Quantity trap: the same quarterly headlines "364 BTC" with no stated basis, while the '
  'asset table beneath it separates direct bitcoin from units in the company''s own ETF. '
  '364 sits between December''s 308.8 direct and 503.7 look-through and cannot be read off '
  'either convention without the underlying price. No holdings row is entered here for '
  'that reason. '
  'The treasury also holds units in an ETF DigitalX itself manages, which no field models '
  'yet — look-through exposure through a related-party vehicle is not economically '
  'identical to direct holding and must never be silently summed. '
  'Refused by the source gate: the 17 February 1999 ASX listing date, carried only by a '
  'third-party profile (rank 6, below the rank 5 floor that even identity requires). The '
  'profile is registered as a document; the date is not a fact.',
  DATE '2026-08-12',
  FALSE
)
ON CONFLICT (slug) DO NOTHING
RETURNING id INTO dx;

IF dx IS NULL THEN
  SELECT id INTO dx FROM research_companies WHERE slug = 'digitalx';
END IF;

-- Listings. listed_from is NULL on both: the only date available for the
-- ASX listing is the unverified one, and the OTC quotation is undated in
-- every document reviewed.
INSERT INTO company_listings
  (company_id, venue, ticker, listing_type, filing_entity, listed_from, listed_to, note)
SELECT dx, 'asx', 'DCC', 'primary', 'DigitalX Limited', NULL, NULL,
  'Listing date is given as 17 February 1999 by a third-party profile only and is '
  'not recorded: the source is below the gate for every field.'
WHERE NOT EXISTS (
  SELECT 1 FROM company_listings WHERE company_id = dx AND venue = 'asx' AND ticker = 'DCC'
);

INSERT INTO company_listings
  (company_id, venue, ticker, listing_type, filing_entity, listed_from, listed_to, note)
SELECT dx, 'otcqb', 'DGGXF', 'secondary', 'DigitalX Limited', NULL, NULL,
  'One ticker, two spellings, one document: the March 2026 quarterly gives DGGFX in its '
  'header line and DGGXF in the body. The body spelling is recorded and neither is '
  'confirmed. Entering both would assert two securities, which is precisely the error an '
  'identifier-keyed ingest would make.'
WHERE NOT EXISTS (
  SELECT 1 FROM company_listings WHERE company_id = dx AND venue = 'otcqb' AND ticker = 'DGGXF'
);

-- Documents. The Appendix 4C is the highest-yield recurring artefact for
-- any ASX small cap: standardised line items, and it carries the
-- financing facilities table that the debt absence below is drawn from.
INSERT INTO research_documents
  (company_id, document_type, source_class, title, venue, announcement_id,
   published_at, filing_entity, is_audited)
VALUES
  (dx, 'quarterly_4c', 'exchange_announcement',
   'March 2026 Quarterly Report and Appendix 4C', 'asx', 'ASX-2026-04-23-4C',
   DATE '2026-04-23', 'DigitalX Limited', FALSE)
ON CONFLICT (company_id, venue, announcement_id) DO NOTHING
RETURNING id INTO dx_4c;
IF dx_4c IS NULL THEN
  SELECT id INTO dx_4c FROM research_documents
   WHERE company_id = dx AND venue = 'asx' AND announcement_id = 'ASX-2026-04-23-4C';
END IF;

INSERT INTO research_documents
  (company_id, document_type, source_class, title, venue, announcement_id,
   published_at, filing_entity, is_audited)
VALUES
  (dx, 'announcement', 'exchange_announcement',
   'Monthly treasury update, holdings as at 31 December 2025', 'asx',
   'ASX-2026-01-23-TREASURY', DATE '2026-01-23', 'DigitalX Limited', FALSE)
ON CONFLICT (company_id, venue, announcement_id) DO NOTHING
RETURNING id INTO dx_treasury;
IF dx_treasury IS NULL THEN
  SELECT id INTO dx_treasury FROM research_documents
   WHERE company_id = dx AND venue = 'asx' AND announcement_id = 'ASX-2026-01-23-TREASURY';
END IF;

INSERT INTO research_documents
  (company_id, document_type, source_class, title, venue, announcement_id,
   published_at, filing_entity, is_audited)
VALUES
  -- published_at NULL: the dossier cites the FY25 Appendix 4E for the
  -- accounting policy without giving its lodgement date.
  (dx, 'appendix_4e', 'exchange_announcement', 'Appendix 4E, FY25 (year ended 30 June 2025)',
   'asx', 'ASX-FY25-4E', NULL, 'DigitalX Limited', FALSE)
ON CONFLICT (company_id, venue, announcement_id) DO NOTHING
RETURNING id INTO dx_4e;
IF dx_4e IS NULL THEN
  SELECT id INTO dx_4e FROM research_documents
   WHERE company_id = dx AND venue = 'asx' AND announcement_id = 'ASX-FY25-4E';
END IF;

INSERT INTO research_documents
  (company_id, document_type, source_class, title, venue, announcement_id,
   published_at, filing_entity, is_audited)
VALUES
  -- Both dated by month only in the dossier, so both published_at NULL.
  (dx, 'announcement', 'exchange_announcement',
   'Response to ASX Enforcement query on treasury asset management, October 2025',
   'asx', 'ASX-2025-10-ENFORCEMENT', NULL, 'DigitalX Limited', FALSE),
  (dx, 'announcement', 'exchange_announcement',
   'A$30m Strategic Investment and Acquisition Program, February 2026',
   'asx', 'ASX-2026-02-SIAP', NULL, 'DigitalX Limited', FALSE)
ON CONFLICT (company_id, venue, announcement_id) DO NOTHING;

SELECT id INTO dx_asxq FROM research_documents
 WHERE company_id = dx AND venue = 'asx' AND announcement_id = 'ASX-2025-10-ENFORCEMENT';
SELECT id INTO dx_siap FROM research_documents
 WHERE company_id = dx AND venue = 'asx' AND announcement_id = 'ASX-2026-02-SIAP';

-- Registered so the refused listing date has a visible home. It
-- populates nothing and cannot: rank 6 clears no field in the table.
INSERT INTO research_documents
  (company_id, document_type, source_class, title, venue, announcement_id,
   published_at, filing_entity, is_audited)
VALUES
  (dx, 'other', 'secondary', 'Third-party company profile', 'web', 'SEC-PROFILE',
   NULL, NULL, FALSE)
ON CONFLICT (company_id, venue, announcement_id) DO NOTHING
RETURNING id INTO dx_profile;
IF dx_profile IS NULL THEN
  SELECT id INTO dx_profile FROM research_documents
   WHERE company_id = dx AND venue = 'web' AND announcement_id = 'SEC-PROFILE';
END IF;

-- Facts.
INSERT INTO research_company_facts
  (company_id, field_key, label, value, as_of, source_document_id, natural_key)
VALUES
  (dx, 'identity', 'Registered office',
   'Suite 2, Level 4, 66 Kings Park Road, West Perth WA 6005',
   DATE '2026-03-31', dx_4c, 'identity-registered-office'),
  (dx, 'identity', 'ABN', '59 009 575 035', DATE '2026-03-31', dx_4c, 'identity-abn'),
  (dx, 'identity', 'Executive Chair',
   'Leigh Travers, appointed during Q3 FY26', DATE '2026-03-31', dx_4c,
   'identity-executive-chair'),
  -- The second AASB fair-value data point, and the reason this record
  -- earns a page: two ASX-reporting entities, same standard, same
  -- election, arrived at by different routes.
  (dx, 'accounting_treatment', 'Digital asset measurement',
   'Classified under the intangible asset method, no specific accounting standard '
   'covering digital assets. Measured at **fair value** unless otherwise disclosed and '
   'provided certain conditions are met. Classified as **current assets** to reflect '
   'liquidity — readily convertible to cash within the normal operating cycle or within '
   '12 months without significant financial penalty — and viewed by management as part of '
   'the treasury function.',
   DATE '2025-06-30', dx_4e, 'accounting-treatment-digital-assets'),
  (dx, 'operating_metric', 'Funding runway',
   '47.95 quarters of funding available at 31 March 2026, per Appendix 4C item 8.',
   DATE '2026-03-31', dx_4c, 'operating-metric-funding-runway')
ON CONFLICT (company_id, natural_key) DO NOTHING;

-- A structural absence, which is a stated fact rather than an empty
-- panel. DigitalX has no debt at all, so the covenant story that record
-- 1 turns on returns nothing here — and the nil is disclosed, not
-- inferred.
INSERT INTO research_findings
  (company_id, finding_type, is_absence, subject, occurred_on, headline, detail,
   source_document_id, natural_key)
VALUES
  (dx, 'structural_absence', TRUE, 'debt', DATE '2026-03-31',
   'No financing facilities at 31 March 2026',
   'Loan facilities, credit standby arrangements and other facilities are all reported '
   'nil in the Appendix 4C financing facilities table. Stated, not inferred from silence.',
   dx_4c, 'absence-debt-2026-03-31')
ON CONFLICT (company_id, natural_key) DO NOTHING;


-- ============================================================
-- RECORD 3 — Block, Inc.
-- ============================================================

INSERT INTO research_companies (
  slug, legal_name, arbn, jurisdiction,
  primary_archetype, reporting_standard,
  functional_currency, presentation_currency,
  financial_year_end, tier, expected_disclosure_cadence,
  market_cap_band, funding_source, curator_notes, last_verified_at, is_published
) VALUES (
  'block-inc',
  'Block, Inc.',
  '654151514',
  'US',
  -- The fourth archetype. Bitcoin arriving substantially as a byproduct
  -- of an operating bitcoin business is neither a treasury allocation,
  -- nor a treasury company, nor fund inventory.
  'operational_integration',
  'us_gaap',
  'USD',
  'USD',
  '12-31',
  -- Bellwether, never regional. ASX quotation is via CDI foreign exempt
  -- listing: admitted on the basis of NYSE compliance and relieved of
  -- most ASX listing rule obligations. Listing Rule 12.3 — the rule that
  -- pushed Locate off the ASX — does not bind Block at all. Including it
  -- in an AU/NZ/SG register would be technically defensible and
  -- analytically worthless.
  'bellwether',
  'quarterly',
  'large',
  -- A dollar-cost-average programme funded from monthly gross profit of
  -- the bitcoin product lines. A third funding mechanism, and the only
  -- one of the three unavailable to almost every CFO BTS speaks to.
  'business_line_gross_profit',
  'Read for mechanism and disclosure language only. Corporate bitcoin of roughly US$696m '
  'against total assets of around US$39.5bn is under 2% of the balance sheet, against '
  'Locate at roughly 13% of market capitalisation on a market cap of A$15.8m — five orders '
  'of magnitude apart in scale and two in proportion. Nothing here transfers to a '
  'mid-market Australian balance sheet. '
  'Quantity trap, and the third distinct one across three records: the Q1 2026 '
  'transparency update states 28,355 BTC total, of which 19,357.16 is held for customers '
  'via Cash App and only 8,997.89 is corporate treasury. The headline total is the number '
  'a careless ingest captures. No holdings row is entered here; the basis vocabulary needs '
  'a value for customer assets held alongside corporate treasury before one can be. '
  'Six identifiers for one company: Square to Block, SQ to XYZ, SQ2 to XYZ, plus XYZAA, '
  'an ARBN and an ISIN. Ticker is never a key on this record. '
  'Refused by the source gate, all [UNVERIFIED] against filings in the dossier: the ISIN '
  'US8522341036, the former tickers, and the FY2025 figures (revenue US$24.2bn, operating '
  'income US$1.71bn, net income US$1.31bn, total assets US$39.5bn, equity US$22.2bn). '
  'isin is left NULL on this row rather than filled from an encyclopaedia. '
  'Also refused, and more costly: the ASU 2023-08 early adoption for the year ended 31 '
  'December 2023 — fair value through net income, against Locate''s AASB 138 revaluation '
  'model routing gains to OCI. Two ASX-quoted bitcoin holders whose identical economic '
  'exposure produces opposite earnings behaviour is the strongest teaching point across '
  'all three records, and it cannot be stored: it lives in the 10-K, which is rank 3, '
  'while accounting_treatment demands rank 2. See the note at the foot of the migration.',
  DATE '2026-08-12',
  FALSE
)
ON CONFLICT (slug) DO NOTHING
RETURNING id INTO bk;

IF bk IS NULL THEN
  SELECT id INTO bk FROM research_companies WHERE slug = 'block-inc';
END IF;

INSERT INTO company_former_names (company_id, name, used_from, used_to, note) VALUES
  (bk, 'Square, Inc.', NULL, NULL,
   'Dossier gives 2009-2021, sourced to an encyclopaedia and marked [UNVERIFIED against '
   'filings]. The name is recorded because entity resolution needs it; the dates are not, '
   'because nothing filed confirms them.')
ON CONFLICT (company_id, name) DO NOTHING;

-- Listings. listing_type gates register membership here rather than
-- annotating it: cdi_foreign_exempt is what keeps this record out of the
-- regional register.
INSERT INTO company_listings
  (company_id, venue, ticker, listing_type, filing_entity, listed_from, listed_to, note)
SELECT bk, 'nyse', 'XYZ', 'primary', 'Block, Inc.', NULL, NULL,
  'Class A common stock. Primary listing; ASX quotation depends on compliance here.'
WHERE NOT EXISTS (
  SELECT 1 FROM company_listings WHERE company_id = bk AND venue = 'nyse' AND ticker = 'XYZ'
);

INSERT INTO company_listings
  (company_id, venue, ticker, listing_type, filing_entity, listed_from, listed_to, note)
SELECT bk, 'asx', 'XYZ', 'cdi_foreign_exempt', 'Block, Inc.', NULL, NULL,
  'CDI 1:1 FOREIGN EXEMPT NYSE, in the company''s own Appendix 4A. 37,945,174 CDIs on '
  'issue at 31 July 2026, against 36,543,992 at 31 May 2026. Foreign exempt status '
  'relieves the entity of most ASX listing rule obligations, Listing Rule 12.3 included.'
WHERE NOT EXISTS (
  SELECT 1 FROM company_listings WHERE company_id = bk AND venue = 'asx' AND ticker = 'XYZ'
);

INSERT INTO company_listings
  (company_id, venue, ticker, listing_type, filing_entity, listed_from, listed_to, note)
SELECT bk, 'asx', 'XYZAA', 'cdi_foreign_exempt', 'Block, Inc.', NULL, NULL,
  'Second ASX code, Class A common stock: 502,870,832 securities at 31 July 2026, per '
  'Appendix 4A. One company, two codes on one exchange.'
WHERE NOT EXISTS (
  SELECT 1 FROM company_listings WHERE company_id = bk AND venue = 'asx' AND ticker = 'XYZAA'
);

-- Documents.
INSERT INTO research_documents
  (company_id, document_type, source_class, title, venue, announcement_id,
   published_at, filing_entity, is_audited)
VALUES
  (bk, 'announcement', 'exchange_announcement',
   'Appendix 4A CDI statement, 31 July 2026', 'asx', 'ASX-2026-07-4A',
   DATE '2026-07-31', 'Block, Inc.', FALSE)
ON CONFLICT (company_id, venue, announcement_id) DO NOTHING
RETURNING id INTO bk_4a_jul;
IF bk_4a_jul IS NULL THEN
  SELECT id INTO bk_4a_jul FROM research_documents
   WHERE company_id = bk AND venue = 'asx' AND announcement_id = 'ASX-2026-07-4A';
END IF;

INSERT INTO research_documents
  (company_id, document_type, source_class, title, venue, announcement_id,
   published_at, filing_entity, is_audited)
VALUES
  -- 31 May 2026 is the balance date the July statement cites for the
  -- prior figure; the May lodgement's own date is not given.
  (bk, 'announcement', 'exchange_announcement',
   'Appendix 4A CDI statement, May 2026', 'asx', 'ASX-2026-05-4A',
   NULL, 'Block, Inc.', FALSE)
ON CONFLICT (company_id, venue, announcement_id) DO NOTHING
RETURNING id INTO bk_4a_may;
IF bk_4a_may IS NULL THEN
  SELECT id INTO bk_4a_may FROM research_documents
   WHERE company_id = bk AND venue = 'asx' AND announcement_id = 'ASX-2026-05-4A';
END IF;

-- Identified, not parsed — and it could not populate the mandate field
-- even once parsed, being a company-directory file at rank 5 against a
-- required rank 2. Registered so the gap is visible and so the fetch
-- layer has something to resolve. The same shape as Locate's Treasury
-- Management Policy, and the highest-transferability artefact on the
-- page in both cases.
INSERT INTO research_documents
  (company_id, document_type, source_class, title, venue, announcement_id, pdf_url,
   published_at, filing_entity, is_audited)
VALUES
  (bk, 'playbook', 'company_web', 'Bitcoin Blueprint for Corporate Balance Sheets',
   'company', 'DOC-BITCOIN-BLUEPRINT',
   'https://block.xyz/documents/bitcoin-blueprint.pdf',
   NULL, 'Block, Inc.', FALSE)
ON CONFLICT (company_id, venue, announcement_id) DO NOTHING
RETURNING id INTO bk_bp;
IF bk_bp IS NULL THEN
  SELECT id INTO bk_bp FROM research_documents
   WHERE company_id = bk AND venue = 'company' AND announcement_id = 'DOC-BITCOIN-BLUEPRINT';
END IF;

INSERT INTO research_documents
  (company_id, document_type, source_class, title, venue, announcement_id,
   published_at, filing_entity, is_audited)
VALUES
  (bk, 'other', 'company_web', 'Q1 2026 bitcoin transparency update', 'company',
   'DOC-TRANSPARENCY-Q1-2026', NULL, 'Block, Inc.', FALSE)
ON CONFLICT (company_id, venue, announcement_id) DO NOTHING
RETURNING id INTO bk_trans;
IF bk_trans IS NULL THEN
  SELECT id INTO bk_trans FROM research_documents
   WHERE company_id = bk AND venue = 'company' AND announcement_id = 'DOC-TRANSPARENCY-Q1-2026';
END IF;

-- The home for the [UNVERIFIED] identity claims. Populates nothing.
INSERT INTO research_documents
  (company_id, document_type, source_class, title, venue, announcement_id,
   published_at, filing_entity, is_audited)
VALUES
  (bk, 'other', 'secondary', 'Encyclopaedia company profile', 'web', 'SEC-PROFILE',
   NULL, NULL, FALSE)
ON CONFLICT (company_id, venue, announcement_id) DO NOTHING
RETURNING id INTO bk_profile;
IF bk_profile IS NULL THEN
  SELECT id INTO bk_profile FROM research_documents
   WHERE company_id = bk AND venue = 'web' AND announcement_id = 'SEC-PROFILE';
END IF;

-- Facts. Only what the Appendix 4A carries, which is the whole point of
-- this record's thinness: an ASX-quoted foreign exempt issuer files
-- almost nothing here, and the register should show that rather than
-- backfilling it from commentary.
INSERT INTO research_company_facts
  (company_id, field_key, label, value, as_of, source_document_id, natural_key)
VALUES
  (bk, 'identity', 'ARBN', '654151514', DATE '2026-07-31', bk_4a_jul, 'identity-arbn'),
  (bk, 'identity', 'ASX quotation',
   '**CDI 1:1 FOREIGN EXEMPT NYSE.** Admitted on the basis of compliance with its home '
   'exchange and relieved of most ASX Listing Rule obligations — including Listing Rule '
   '12.3, the cash-box test that record 1 could not survive.',
   DATE '2026-07-31', bk_4a_jul, 'identity-asx-quotation'),
  (bk, 'identity', 'CDIs on issue',
   '37,945,174 at 31 July 2026, against 36,543,992 at 31 May 2026.',
   DATE '2026-07-31', bk_4a_jul, 'identity-cdis-on-issue')
ON CONFLICT (company_id, natural_key) DO NOTHING;

END $$;

-- ============================================================
-- One thing this seed found, left for a decision rather than fixed
--
-- `field_source_minimums` ranks audited_accounts (3) below
-- exchange_announcement (2), and sets accounting_treatment's minimum at
-- 2. The effect is that audited financial statements cannot populate an
-- accounting-treatment fact, while an unaudited quarterly can. For
-- measurement bases specifically that ordering looks inverted — the
-- 10-K is the authoritative source for an accounting election, and it is
-- the one source the gate refuses.
--
-- It is not worked around here. Changing a rank changes what every
-- existing row is allowed to assert, and the gate refusing a claim it
-- should admit is a far better failure than the reverse. Raising it as
-- the question it is: either accounting_treatment's minimum should be 3,
-- or the rank ordering should place audited accounts above exchange
-- announcements.
-- ============================================================
