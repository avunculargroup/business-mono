# Corporate Research — Schema & Ingest Spec (from records 4–11)

Sep 23, 2026 · @Chris Pollard

## Why this spec exists

Between records 4 and 11 the register went from three companies to eleven, and crossed four new filing systems (SEC, TDnet, the London RNS, SEDAR+) and five accounting regimes. Every structural problem below was hit in practice rather than imagined, and most were hit more than once.

The records, and what each one broke:

| # | Record | What it exposed |
| --- | --- | --- |
| 4 | Strategy | Weekly cadence has no enum value; 8-K mixes filed and furnished content in one document; flat holdings concealed 6,916 BTC of sales |
| 5 | Metaplanet | Japanese GAAP absent from `reporting_standard`; quarterly notices restate the full ledger every time; cost basis stated net of fees against Strategy's inclusive |
| 6 | 333D | Holdings disclosed in AUD with no unit count; primary announcements exist but were not located; ASX Listing Rule 11.1 applied to a treasury policy |
| 7 | Hamak Strategy | `jurisdiction` NOT NULL with no known jurisdiction; look-through exposure beside a direct holding; physical gold in the same policy with nowhere to live |
| 8 | Panther Metals | Bitcoin pledged as collateral — no basis expresses encumbrance; announced programme 50x the executed purchase |
| 9 | Angel Studios | The most precise disclosure in the register, entirely refused; principal market changed from Coinbase to BitGo unremarked; two CIKs for one company |
| 10 | RUM Group | Trackers stale by nine months and understated by 28%, caught live; tokens acquired through M&A at Level 3 |
| 11 | Goodfood | Exposure held through an ETF, not coins; SEDAR+ unreachable; week-based fiscal calendar |

Six of the eleven records are now blocked on the same source-ladder question, which makes it the first thing to settle. Everything else in this spec is small by comparison and mostly independent.

## Decision 1 — rank by filing item, not by document

> **Superseded in part (29 September).** The section-level table below stands. The single rank threshold does not: each field now carries an allow-list of source classes (see [Decided](#decided-29-september)), so where this section and Decision 2 talk about a class *outranking* another, read *is in the field's allowed set*.

This is the blocking change. Session 5 raised it as one company's problem; it is now six.

**What is refused today, and by which record:**

| Claim | Record | Source | Rank vs required |
| --- | --- | --- | --- |
| ASU 2023-08 fair value election | Block | 10-K | 3 vs 2 |
| Custody across three named custodians | Strategy | 10-K | 3 vs 2 |
| ASU 2023-08 election, cumulative-effect adjustment | Strategy | 10-K | 3 vs 2 |
| IAS 38 intangible treatment, cost basis | Hamak | annual results | 3 vs 2 |
| 303.1 BTC, cost basis, custody, principal market | Angel Studios | 10-Q | 3 vs 2 |
| 210.82 BTC, cost basis, fair value reconciliation | RUM Group | 10-Q | 3 vs 2 |

Meanwhile Panther Metals has its custody arrangements stored because they appeared in an RNS, on a holding of one bitcoin. The gate is measuring which filing system carried a claim, not how reliable the claim is.

**Why the current model cannot fix it.** `source_class` sits on the document row, and a filing is not uniform inside itself. A 10-K's Item 1 business description is unaudited prose in an audited document. An 8-K's Item 8.01 is filed under the Exchange Act while Items 2.02 and 7.01 are furnished and carry no Section 18 liability — and both arrive in one file. A 10-Q is filed and reviewed but not audited, which is why it has no honest class at all today.

**Recommendation: `research_document_sections`.** Keep `research_documents` as the retrieval unit (one URL, one fetch, one `full_text`) and add a child table that carries the rankable claim.

```sql
CREATE TABLE research_document_sections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   UUID NOT NULL REFERENCES research_documents(id) ON DELETE CASCADE,
  filing_item   TEXT NOT NULL,        -- '8-K Item 8.01', '10-K Item 1', '10-Q Note 3', 'RNS body'
  source_class  TEXT NOT NULL REFERENCES source_classes(code),
  is_filed      BOOLEAN,              -- false for furnished 8-K exhibits
  notes         TEXT,
  UNIQUE (document_id, filing_item)
);
```

Facts, events and snapshots gain `source_section_id`, nullable at first. The trigger resolves rank from the section when present and falls back to the document's own `source_class` when absent, so nothing already stored breaks.

**Why not the two simpler options.** Re-ranking `audited_accounts` above `exchange_announcement` fixes accounting treatment and simultaneously says an annual report's marketing prose outranks a continuous-disclosure announcement — wrong in the other direction, and it would silently re-authorise every existing row. Lowering `accounting_treatment` to rank 3 fixes one field and leaves custody, holdings and ledger events refused across four records.

**Migration work:** create the table; add `source_section_id` to the three child tables; update `assert_source_minimum` to prefer the section; backfill sections for the 10-Ks, 10-Qs and 8-Ks already registered; then re-run the refused claims listed above, which are all recorded verbatim in each record's `curator_notes` and need only re-entry, not re-research.

## Decision 2 — a source vocabulary that covers four filing systems

The ladder was written for the ASX. `exchange_announcement` is labelled "ASX/NZX/SGX, Appendix 4C/4E/4A", and every non-Australian record has been mapped onto it by hand, with the reasoning buried in `curator_notes`.

**There is a known dishonesty in the data right now.** Angel Studios' and RUM Group's 10-Qs are registered as `audited_accounts` with `is_audited = false`, because no class fits a filed-but-unaudited periodic report. The document titles say "class is a forced fit". That should not survive this spec.

**Proposed `source_classes` after the change:**

| Code | Rank | Covers |
| --- | --- | --- |
| `regulated_disclosure` | 1 | Prospectus, PDS, scheme booklet, 424B prospectus supplement |
| `exchange_announcement` | 2 | Continuous-disclosure announcements: ASX/NZX/SGX, TDnet timely disclosure, London RNS, SEDAR+ material change reports, filed 8-K items |
| `filed_periodic_report` | 2 | 10-Q, 10-K Items 1–7, interim reports — filed, liability-bearing, not audited |
| `audited_accounts` | 3 | The audited financial statements themselves |
| `furnished_release` | 4 | Furnished 8-K exhibits, earnings releases, investor presentations |
| `company_web` | 5 | Website, IR page, marketing |
| `secondary` | 6 | News, trackers, commentary |

Two things change materially. Filed periodic reports join rank 2, which unblocks Angel Studios and RUM Group outright. And `investor_presentation` widens into `furnished_release`, which is where earnings-release exhibits belong — Strategy's ledger was deliberately sourced only to Item 8.01 bodies, never to Exhibit 99.1, and that distinction becomes enforceable instead of a convention I kept by hand.

**Added after record 12 (Sequans).** The table above covers the ASX, TDnet, the RNS, SEDAR+ and US domestic forms, and misses the foreign private issuer regime entirely. An FPI files an annual report on Form 20-F and *furnishes* everything else on Form 6-K — there is no filed 8-K equivalent and no RNS. Applying the furnished-versus-filed rule literally would empty the record of a company whose disclosure is perfectly adequate. Two changes: add 20-F to `audited_accounts` and 6-K to `exchange_announcement` at rank 2; and write the rule as *furnished content ranks below filed content where a filed channel exists for the same disclosure*, so a US issuer's earnings exhibit stays at rank 4 while an FPI's 6-K does not. Sequans' record currently depends on this call being ratified.

**Also needed in the same migration:**

- `reporting_standard` add `jgaap`. Metaplanet currently reads `other`, which is the only record where that field says nothing useful.
- `jurisdiction_notes` seeds for the traps found: Japanese GAAP symmetric remeasurement versus AASB 136 impairment (the same English word, opposite mechanics, records 5 and 6); ASX Listing Rule 11.1 applied to a treasury policy (record 6); US GAAP ASU 2023-08 principal-market election (records 9 and 10); UK depositary-interest listings where listing venue is not incorporation (records 7 and 8).
- A `restricted_metrics` seed table so Lex matches on data rather than prose: BTC Yield, BTC Gain, BTC ¥ Gain, effective net acquisition cost, mNAV, BTC per share. Records 4, 5 and 10 all publish these in primary filings, which is the point — a primary source does not make a metric publishable.

## Identity, jurisdiction and calendars

Rule 3 of the feature is that a ticker is never a key. Eight of eleven records changed an identifier during the period covered, and the schema still has nowhere to put the identifiers that do not change.

**`company_identifiers` — the missing table.**

```sql
CREATE TABLE company_identifiers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES research_companies(id) ON DELETE CASCADE,
  scheme      TEXT NOT NULL,   -- 'sec_cik', 'acn', 'abn', 'arbn', 'iom_company_number', 'lei', 'isin', 'sedar_profile'
  value       TEXT NOT NULL,
  valid_from  DATE,
  valid_to    DATE,
  note        TEXT,
  UNIQUE (company_id, scheme, value)
);
```

This replaces the `acn`, `abn`, `arbn`, `isin` and `lei` columns on `research_companies`, which are Australian-shaped and already inadequate: Panther needs an Isle of Man company number (009753V), Strategy and Angel Studios need CIKs, and Angel Studios needs *two* — its bitcoin history spans CIK 1671941 and CIK 1865200. Entity resolution should run on this table.

**`jurisdiction` NOT NULL is forcing false data.** Hamak and RUM Group both carry the string `unknown`, because the London listing is in depositary-interest form in one case and secondary sources conflict in the other. A sentinel sitting in a country-code column will eventually be read as a country. Make the column nullable and add `jurisdiction_basis TEXT` recording how it was established (`stated_in_filing`, `inferred_from_listing`, `unknown`). Two records is already a pattern.

**`company_listings.listing_type` cannot express security class.** Strategy has five rows marked `primary` on Nasdaq — one common stock and four series of perpetual preferred — and Hamak and Panther both list depositary interests rather than ordinary shares. Add:

```sql
ALTER TABLE company_listings ADD COLUMN security_class TEXT
  CHECK (security_class IN ('common','preferred','depositary_interest','cdi','other'));
```

`listing_type` keeps its current job (primary, secondary, foreign exempt); `security_class` says what the line actually is. Anything that counts listings, or reasons about what a holder owns, needs both.

**Fiscal calendars are not all dates.** `financial_year_end` is text and now holds the sentence "week-based 52/53-week calendar (Q3 FY2026 ended 6 June 2026)" for Goodfood. Retail and food companies report this way routinely. Add `fiscal_calendar_type` (`calendar_date` | `week_based_52_53`) and keep `financial_year_end` for the date case only, so the freshness view can stop guessing at a parse.

## Holdings: encumbrance, wrappers and conventions

Hard rule 1 says no basis, no comparison, and `holding_bases.comparable` decides what enters an aggregate. The four bases seeded cover what the asset *is*. Records 8 and 11 need two more, and record 8 needs something the basis field cannot express at all.

**Two new bases:**

- `etf_wrapped` — comparable `false`. Goodfood holds spot ETF units and has never stated a coin count; the 25 BTC on the trackers is a third party's look-through of a dollar figure. Without this value the record either lies or stays empty.
- `pledged_collateral` — comparable `false`. Panther's announced model pledges bitcoin to secure a loan.

**Encumbrance is not really a basis, though.** Pledged bitcoin is direct spot in every respect except who has a claim on it, and a company can pledge part of a holding. The better model is a flag alongside the basis:

```sql
ALTER TABLE treasury_holdings_snapshots
  ADD COLUMN encumbered_quantity NUMERIC,
  ADD COLUMN encumbrance_note TEXT;
```

That keeps the comparable basis intact for the unencumbered remainder and lets the page say what ranks ahead of the holding. Three records now point the same way — Locate's lender covenant, Panther's collateral pledge, Hamak selling bitcoin to fund drilling — and for a mid-market company that question matters more than the size of the position.

**Cost-basis conventions differ and are silently incomparable.** Strategy states aggregate cost inclusive of fees and expenses; Metaplanet states it net of all fees and expenses. Averaging or ranking across the two compares different measurements. `treasury_events.fees_included` already handles the per-event case. Add the same at company level for stated aggregates:

```sql
ALTER TABLE research_companies ADD COLUMN cost_basis_convention TEXT
  CHECK (cost_basis_convention IN ('inclusive_of_fees','net_of_fees','unstated'));
```

**Non-bitcoin treasury assets.** Hamak holds 1.65kg of physical gold under the same treasury policy; RUM Group holds eIOU tokens acquired with a subsidiary, marked at Level 3 with unobservable inputs. Neither is recorded anywhere. `treasury_events.asset_class` exists but snapshots have no equivalent. Either add `asset_class` to snapshots with a `BTC` default, or state in the spec that the register is bitcoin-only and that other treasury assets live in `curator_notes`. My recommendation is the column: a treasury policy that admits gold will eventually admit something worse, and the CFO question — what else did this policy let onto the balance sheet — is answerable only if the data can hold the answer.

**A register of holders needs to say when someone stops holding.** Sequans sold its last 314 BTC on 24 September 2026 and holds none. Its `primary_archetype` still reads `treasury_company`, which is what it was, and the only signal that it is not one now is a snapshot of zero. Add `holding_status` (`active` | `exited` | `never_held`) with an `exited_on` date, so a page can state "exited 24 September 2026" rather than falling silent or implying a current position. This also gives the zero snapshot a companion: a zero with `exited` means something different from a zero with `active`, and both differ from no snapshot at all.

## Why a record is empty, and what the internet thinks

**Four records have no ledger, for four unrelated reasons, and the page cannot tell them apart.**

| Record | Why it is empty | What would fix it |
| --- | --- | --- |
| DigitalX, Block | No stated basis; the figure mixes look-through or customer assets | New basis vocabulary, or the company disclosing differently |
| Angel Studios, RUM Group | The disclosure is precise but arrives in a refused document class | Decision 1 |
| 333D, Panther | The primary announcement exists but was not located | A document URL |
| Goodfood | Primary filings are on SEDAR+, which is not fetchable | A SEDAR+ adapter |

These look identical on a company page — an absent holdings panel — and mean completely different things to a reader. Add a reason code so the page can say which:

```sql
ALTER TABLE research_companies ADD COLUMN ledger_absence_reason TEXT
  CHECK (ledger_absence_reason IN
    ('no_stated_basis','source_class_refused','primary_not_located','filing_system_unreachable','no_holding'));
```

`no_holding` matters too: PositionPanel already distinguishes "no holdings were sourced" from a bare zero, and this makes that distinction data rather than a rendering decision. It also gives the build a work queue — `primary_not_located` is research, `filing_system_unreachable` is engineering.

**Document resolution deserves the same honesty.** `documents.ts` computes `resolved` and `unresolved` at run time but the table only has `retrieval_error`, which reads as a fetch failure. Metaplanet has a document that cannot be fetched because its URL exceeds the 250-character limit; 333D and Locate have announcements with no URL at all. Add `resolution_status` (`resolved` | `no_url` | `unfetchable` | `fetch_failed`) so the register can report what it could not even attempt.

**Tracker divergence should be a first-class finding.** RUM Group is the live case: three trackers report 210.8–211 BTC stamped May 2025 while the company's own accounts say 293.14 as at June 2026 — nine months stale, understated by 28%. Goodfood's trackers assert 25 BTC for a company that has never stated a coin count. This is the failure the whole feature exists to prevent, and right now it sits in prose.

```sql
CREATE TABLE secondary_claims (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES research_companies(id) ON DELETE CASCADE,
  source_name    TEXT NOT NULL,          -- 'bitcointreasuries.net', 'theblock.co'
  source_url     TEXT,
  claimed_quantity NUMERIC,
  claimed_as_of  DATE,
  observed_at    DATE NOT NULL,
  note           TEXT
);
```

With that, Rex's scoring step can emit a `tracker_divergence` finding whenever a secondary claim and the latest sourced snapshot disagree by more than the materiality floor — which needs `tracker_divergence` added to the `research_findings.finding_type` check. For a client-facing page this is arguably the most compelling thing the register can show: not what the company holds, but how wrong the freely available number is.

**Canonical example for this table, caught on the day.** Wire coverage of Sequans' exit split between 314 BTC and 34 BTC, and at least one aggregator published both figures side by side with a note that its sources disagreed. The filing says 314, twice. Where RUM Group shows the secondary layer going stale, this shows it being wrong and internally inconsistent about a number that was freely available in a filing the same morning. Use both when demonstrating the feature.

## Discovery: how documents arrive

The rest of this spec assumes a corpus exists. It does not. `researchIngest` step 1 reads `research_documents` for the company and works with whatever is there, and every row in that table was entered by hand. If Strategy files an 8-K tomorrow, nothing notices. The workflow reads a corpus; nothing builds one.

**Do not build discovery inside `researchIngest`.** `reportWatch` already is a discovery-and-acquisition pipeline: it runs daily at 07:00 Melbourne under the `report_watch_scan` routine, with a deterministic `discover` phase that finds candidate URLs per source and records source health when one goes quiet, and an `acquire` phase that fetches, stores, extracts and indexes. It has an `adapters/` directory and a `registry.ts` where per-venue logic already lives, and `researchIngest` already borrows its HTTP layer, robots handling and PDF extraction.

The gap is only the destination: `reportWatch` delivers into `news_items` for Rex to score, and nothing routes a discovered document into `research_documents` against a company.

**Add `research_documents` as a destination.** A `report_watch_sources` row per company venue — an EDGAR feed by CIK, an RNS issuer feed, a TDnet disclosure page — carrying a company binding, so a discovered filing lands registered rather than in the news feed. `researchIngest` stays what it is.

This also puts the venue work where it belongs. Discovery adapters are per-venue and live in `reportWatch/adapters`; the SEDAR+ problem blocking Goodfood is a discovery adapter, not an ingest change. The URL shapes confirmed across records 4–12 are in the ingest section below and are the input to those adapters.

**Filter at the source, not after.** Discovering a document is not the same as it being worth registering. Strategy files constantly — 8-Ks on many subjects, prospectus supplements, Section 16 filings — and almost none of it concerns the treasury. Either discovery filters by form type and subject at the feed, or `research_documents` fills with noise that every subsequent ingest run re-reads. `assessQuality.ts` in the report-watch pipeline may already cover enough of this; check before writing a second filter.

**Consequence for `ledger_absence_reason`:** `primary_not_located`, which currently describes 333D and Panther, becomes a discovery backlog item rather than a research one. Once a venue has an adapter, the missing announcements for those two records should arrive without anyone going to look.

## Ingest workflow

`researchIngest` has never run against a real document. Records 4–11 registered about thirty real ones, which is now enough to build adapters against rather than guess at.

**Document resolution, per venue.** Session 2 refused to guess URL templates on the grounds that a guessed template 404s convincingly and fills `retrieval_error` with fiction. That was right, and the records have since supplied the real shapes:

| Venue | Shape | Notes |
| --- | --- | --- |
| SEC | `sec.gov/Archives/edgar/data/{cik}/{accession}/{file}` | Eleven Strategy documents, four Angel, three RUM, all fetched successfully; declared user agent already satisfies SEC fair-access rules |
| LSE (RNS) | Investegate and issuer IR hosts | Fetched for Hamak and Panther |
| TDnet | `metaplanet.jp/disclosure/en/...` | Issuer-hosted English versions; filenames embed the full document title, so URLs routinely exceed the 250-character fetch limit |
| ASX | `announcements.asx.com.au/asxpdf/{yyyymmdd}/pdf/{id}.pdf` | Confirmed via 333D; the id is not derivable, so per-document URLs remain mandatory — this is what Locate's two stuck announcements need |
| SEDAR+ | not fetchable | Blocks every Canadian record; needs its own adapter |

**Item-aware EDGAR parsing.** Decision 1 is worthless to the ingest unless the extractor knows which item a claim came from. The parse step should split a filing on its item headings and emit one section per item, so `research_document_sections` is populated at ingest rather than by hand. This is deterministic string work, not a model judgement — an agent asked to rank a source will do it with great confidence, which is the problem.

**Restatement-shaped documents.** Metaplanet republishes its entire holdings history — around sixty rows back to April 2024 — in every quarterly notice. An ingest that treats the table as new rows duplicates the whole ledger on each run. `reconcile.ts` must key on `natural_key` and treat a repeated row as a no-op or a correction. This is a better idempotency fixture than Locate, because the restatement is the document's normal shape rather than an exception.

**Two parsing traps worth encoding as tests.** Strategy's filed running totals differ from arithmetic on its own filed flows by one bitcoin, twice — the filings say "approximately", so `validateNumerics` must tolerate a stated rounding without tolerating a real discrepancy. And the 6 July 2026 8-K is signed "June 29, 2026" in its signature block: the filing date is not the signature date, and the extractor should take the date of earliest event reported, not whatever date appears last on the page.

**Stop asking the model for the `natural_key`.** New events are identified solely by that key: reconcile matches candidates against committed events by it, and anything unmatched is created. The key is currently produced by Rex, instructed to use `<company-slug-fragment>:<event-type-fragment>:<event-date>` and to make it identical on a re-read. Nothing validates the format, checks the prefix against the company's existing keys, or prevents `mstr:disp:2026-08-02` and `strategy:disposal:2026-08-02` from being the same sale on two runs — the second of which reconciles as new and duplicates the row.

Three failure modes already visible in the records: prefix drift, where the slug fragment is a free choice; period events, where Strategy's weekly sales run 27 July to 2 August and the key could use either end; and multiple same-type events on one date, where Metaplanet's restated table collapses two rows into one key and one silently overwrites the other.

Fix: have Rex return the components it can see — event type, date, period start, quantity — and compute the key deterministically afterwards, from the company slug on the record (not the model), a canonical event-type code from the enum, the ISO date, and a short hash of quantity plus source document where a date alone is not unique. Same idempotency guarantee, no model variance. A small change to `extractEventsStep` and a new function beside `validateNumerics`, and it must land before the first real run: the damage from an unstable key is duplicate ledger rows.

**Replace the suspend gate with a review queue.** The workflow currently ends in `suspend()` and, on resume, sets `is_published = true` — which makes the ingest the only thing in the codebase that writes that flag, and means a human approving a run does something no UI can. With `review_state` in place, a scheduled run should persist its output as `draft` and stop. The queue is the `/research` list filtered to `draft`; approving there promotes to `internal`. A suspended run waiting indefinitely for a resume holds workflow state open and needs storage-backed context to survive a restart; persist-and-stop is sturdier for something unattended.

Three decisions inside that:

- **The queue lists runs, not companies.** A weekly Strategy ingest may add one event to an otherwise settled record, and re-promoting the whole record makes no sense. `agent_activity` already carries `proposed_actions`, `approved_actions` and `workflow_run_id`, so it is the queue's backing table.
- **Review state belongs on the event, not only the company.** Otherwise a new draft event either drops a reviewed record back to draft, hiding it because one row arrived, or is committed unreviewed. This is wider than the rest of the spec and is the one part of the queue design still open.
- **Quiet runs must not queue.** `isQuietRun` already exists and already skips the scoring model. The same test should decide whether a run enters the queue at all; twelve companies filing weekly would otherwise fill it with nothing-happened entries, which is how a review queue teaches people to stop opening it.

**Scheduling, once the above exists:** a `researchIngest/run.ts` following the `variant/run.ts` pattern, a `routines` row, and an `executeRoutineWorkflow` action mapping — the pattern the six existing routines follow. Nothing triggers this workflow today; the single reference outside its own folder registers it on the Mastra instance.

**Also outstanding from session 2**, unchanged by this spec: the recorded `TraceBundle` from a real run, and a `routines` row to schedule it. Strategy is the best first target — weekly Monday filings, structured tables, one stable key in CIK 1050446, and eleven documents already registered with working URLs.

## Conformance cases

The suite in `packages/data/src/testing/corporateHoldings.ts` is parameterised by pathology rather than by company, so an adapter that cannot construct a scenario fails rather than skipping it. Records 4–11 supply seven more pathologies, each drawn from something that actually happened:

| Case | Drawn from | Asserts |
| --- | --- | --- |
| `flowsReverseWhileStockIsFlat` | Strategy | A position of 847,363 → 845,050 across a period containing 6,916 BTC of sales and 4,603 of purchases reports the flows, not just the endpoints |
| `restatedLedgerIsIdempotent` | Metaplanet | Ingesting a document that republishes sixty historical rows twice commits zero new rows the second time |
| `currencyOnlyDisclosureYieldsNoSnapshot` | 333D | A holdings disclosure denominated only in AUD produces no snapshot and no basis, and the page says why |
| `etfWrapperIsNotComparable` | Goodfood | An `etf_wrapped` position never enters an aggregate, and a third-party coin count derived from it is not stored |
| `encumberedPortionExcludedFromFreeBalance` | Panther | A pledged quantity is visible and excluded from anything described as unencumbered |
| `refusedByClassIsDistinguishableFromAbsent` | Angel Studios vs DigitalX | Two empty records render different explanations, driven by `ledger_absence_reason` |
| `trackerDivergenceRaisesFinding` | RUM Group | A secondary claim 28% below the latest sourced snapshot produces a finding above the materiality floor |

Two existing tests need extending rather than adding. `validateNumerics` should gain the Strategy rounding case — a filed running total one unit from arithmetic on filed flows, where the source says "approximately" — and the date case, where a signature block disagrees with the filing date. Both are real values from real documents and neither is currently covered.

The four earlier pathologies stay as they are: Locate's contradicting secondary source, DigitalX's basis-free figure, Block's customer assets, and the position-panel unit bug that printed fund units as BTC.

Record 12 adds two more. `exitedIsNotAbsent`: a company with a zero snapshot and `holding_status = 'exited'` renders differently from one with no snapshot and from one holding a positive balance — three states, three renderings, no inference. And `disposalWithoutConsideration`: Sequans announced the sale of 314 BTC with no date, no price and no proceeds, so an event with a quantity and nothing else must persist and display without a division-by-null anywhere downstream.

## Consumers: visibility, clearance and the three surfaces

Everything above stops at the repository. Three surfaces read it, and one of them is broken today.

### The visibility bug

Minute has a register at `/register`, backed by `ClientRegisterRepository`. It shows nothing, and five entries have been cleared for it.

Visibility is two gates. Both the RLS policy on `research_companies` and the client repository require `is_published = TRUE` **and** `client_cleared = TRUE`. Five records — Block, DigitalX, Locate, Metaplanet and Strategy — carry `client_cleared = true` with a clearer and a timestamp. All twelve carry `is_published = false`.

**No human-facing control ever writes `is_published`.** Not a server action, not a form, not a seed migration. The one writer is the `researchIngest` resume branch (`apps/agents/src/workflows/researchIngest/index.ts`), which has never run against a real record; everywhere else it appears only as a column definition, a default of `FALSE`, or a `WHERE` clause. The `review_state` migration must change that writer and its tests in the same diff. The only control that exists is `RegisterClearance` on the internal `/research/[slug]` page, which writes `client_cleared` and whose own doc comment warns that someone reading it as "publish" will clear entries that were never meant to leave the building. That is exactly what happened, and the warning was aimed at the wrong risk: the cleared entries are safe, they are simply invisible.

**The naming is the root cause.** "Published" reads as outward. The flag means visible on the *internal* register — inward. Worse, the internal list ignores it entirely: `listCompanies` filters on tier, archetype and jurisdiction and nothing else. So `is_published` gates nothing internally and silently blocks the client path, which is the only thing it does.

**Fix, in one migration and one action:**

- Rename to a `review_state` enum: `draft` | `internal` | `retired`. Two boolean flags where one is misnamed is how this happened; a state machine reads correctly and leaves room for the ingest.
- Add a database check that `client_cleared` can only be true where `review_state = 'internal'`. Cleared-but-unpublished is a nonsense state and five records are in it.
- Make the internal register honour `review_state`, or drop the concept. The present arrangement is the worst of both.
- Build `setReviewState` beside `setRegisterClearance`, using the same `ClientGate` pattern, and present them as two steps in one control so the ordering is obvious.
- Fix Minute's empty state, which says "no entries are cleared for distribution" when entries *are* cleared and the blocker is elsewhere.

The distinction between the two gates is worth keeping despite all this, and it earns its place the moment `researchIngest` runs: an agent-created record must land unread, be reviewed by a human, and only then reach the internal register. That is `draft` → `internal`. Clearance stays a separate human decision with a different standard.

### What the new fields demand of each surface

**`apps/web`** — internal, `/research` and `CompanyRecord`, sharing `ResearchPanels`, `ResearchLedger` and `ProvenanceRail` with demo. Needs: five renderings for `ledger_absence_reason`; three states for `holding_status` plus zero-versus-absent, which `PositionPanel` currently infers; `encumbered_quantity` surfaced in the position panel, since it is the first number a CFO should see; a `secondary_claims` panel for tracker divergence; and `company_identifiers` and `security_class` in `ProvenanceRail`, so a claim attaches to a stated entity and instrument rather than to a ticker.

**`apps/demo`** — same components over fixtures. Its landing copy promises no headline holdings figure anywhere on the page, so any aggregate introduced by the new bases must exclude `etf_wrapped` and `pledged_collateral` visibly rather than silently. `ArchetypeComparison` groups by tier today and will need the same treatment.

**`apps/client` (Minute)** — `/register`, grouped by tier, deliberately no holdings figure on the list page. This surface is scoped to **implementation facts, not outcome facts** — how an entity did this, never how it went for them — enforced through `field_source_minimums.client_fact_class`. Three consequences:

- `holding_status` is a phrasing risk. "Exited" is implementation; "exited after selling into a falling price" is performance. The field is fine, the rendering needs care.
- `ledger_absence_reason` needs subscriber-safe copy. `source_class_refused` is an internal concept and means nothing to a reader.
- **The curator notes cannot go to Minute.** Records 4 to 12 were written for an internal reader and several are outcome-shaped by design: Sequans' exit, Goodfood's strategic review, Angel Studios under water. Either the client surface composes from facts and ledger only, or each record needs a second, cleared summary. This needs deciding before anything is published, and it is the one item here that is a content decision rather than a code change.

## Sequencing, and what needs deciding

**Do this first, before anything else: write the seed migration.** Records 4 to 12 exist only in the live database. A reset or a fresh branch loses nine records and restores three. Every other record went in through a numbered seed migration, and nothing in the repo reviews what is currently there. One migration, idempotent, in the pattern of `20260911000000_seed_digitalx_and_block.sql`.

**Then, in order:**

1. **Decision 1 and 2 together.** One migration: `research_document_sections`, the new source classes, `source_section_id` on the three child tables, `field_source_minimums` changed from a rank threshold to a per-field allow-list, and `assert_source_minimum` amended to check the section's class against that list. Backfill sections for the filings already registered, then re-enter the refused claims — all are recorded verbatim in each record's `curator_notes`.
2. **Identity and calendars.** `company_identifiers`, nullable `jurisdiction` with `jurisdiction_basis`, `security_class`, `fiscal_calendar_type`. Migrate the Australian-shaped columns across and drop them.
3. **Holdings vocabulary.** Two bases, encumbrance columns, `cost_basis_convention`, `asset_class` on snapshots.
4. **Absence and divergence.** `ledger_absence_reason`, `resolution_status`, `secondary_claims`, `tracker_divergence`. Backfill the reason codes for the four empty records.
5. **Conformance cases**, then the ingest adapters, then the first real run.

6) **Visibility and consumers.** The `review_state` migration, the clearance ordering check, `setReviewState`, and the empty-state copy. Then the panel work for the new fields across web and demo, and the implementation-versus-outcome pass over records 4 to 12 before any of them reaches Minute. This step is independent of 1 to 5 and can go first if you want the five cleared records visible to subscribers sooner — though they are the five written before the outcome-facts rule was in front of me, so they need the content pass regardless.

Steps 2 to 4 are independent of each other and can be reordered or parallelised. Step 1 is not — it changes what every existing row is permitted to assert, so it should land alone and be reviewed as its own diff.

### Acceptance criteria

- A fresh database from migrations reproduces all twelve records, verified by count and by spot-checking three `curator_notes`.
- The custody and accounting claims listed in Decision 1 are stored, each attached to a filing item, with the gate still refusing the same claims when sourced from a furnished exhibit.
- `pnpm test`, `turbo typecheck` and `turbo lint` green; the new conformance cases pass against both adapters.
- A company page for an empty record states which of the five reasons applies.

### Decided (29 September)

- **Source ranking** — replace the single rank threshold with a per-field allow-list of source classes. This supersedes the "does Item 1 earn rank 2" question: the ladder was conflating timeliness with reliability in one integer, and per-field sets let `custody` accept filed narrative while `ledger_event` does not. `field_source_minimums` is already per-field; it stores a threshold instead of a set.
- **Encumbrance** — a flag, not a basis. `encumbered_quantity` plus the counterparty or instrument and the obligation secured, so Sequans' 817 BTC reads as convertible debt collateral rather than a bare number. Basis stays `direct_spot` for the comparable remainder. A `holding_encumbrances` child table only when a second simultaneous creditor appears.
- **Non-bitcoin assets** — record and filter. In scope if held under the treasury policy the record is about; out of scope if it is merely another balance-sheet asset. Aggregates, comparisons and tier views filter to `BTC` unless asked otherwise.
- **Tracker claims** — opportunistic only. Keep `secondary_claims`, populate it during research when a figure is in front of you, no scheduled scraping. Revisit if divergence findings prove to be what clients respond to.
- **Foreign private issuers** — ratified. 6-K is an accepted source; furnished content ranks lower only where a filed channel exists for the same disclosure. Sequans' rows stand.
- **`review_state`** — `draft | internal | retired`, with clearance permitted only from `internal`. The internal list defaults to `internal` and exposes `draft` as a filter value with a count badge, so the review queue is the existing UI rather than a new one. On migration: the three seeded records and the five cleared ones become `internal`; records written on 23 September become `draft`.
- **Minute summaries** — a hand-written `client_summary` per record, cleared as part of `setRegisterClearance`, with clearance blocked where it is empty. Composing from stored facts was rejected. Twelve to write, including the five already cleared, which predate the implementation-facts rule. Rex may draft; a human edits and clears.
- **Seeds** — records stay direct database writes during research. `packages/db/src/seeds/dump-register-seed.ts` emits an idempotent seed migration once a batch settles. Its explicit column lists need updating alongside each migration in this spec.
- **Discovery** — extend `reportWatch` rather than building a second pipeline.

**Review state lives on the event as well as the company** (decided 29 September). `treasury_events`, `research_findings` and `research_company_facts` each gain `review_state` (`draft | internal | retired`) and a `reviewed_by` / `reviewed_at` pair. A company's state stops being a property of the record and becomes the highest state any of its rows has reached: a settled record stays `internal` while a newly ingested event sits `draft` beneath it, and neither hides the other.

Consequences to build for:

- **Reads filter by row state, not record state.** `CorporateHoldingsRepository` needs the reviewer's context on every ledger read — internal callers see `internal` plus, on request, `draft`; the client path sees only `internal` rows of a cleared record. This is a signature change to the interface and therefore to the conformance suite, which is why it had to be settled before the queue.
- **Clearance composes.** `client_cleared` on the record already gates Minute; a draft event on a cleared record must not reach subscribers, and the RLS policy has to enforce that at the row level rather than the record level.
- **The queue shows deltas, and promotion is per row.** Approving a run promotes the rows that run produced, recorded against its `workflow_run_id` in `agent_activity`. Approving is not a record-level act.
- **Existing rows migrate to `internal`** where their company is `internal`, and to `draft` otherwise — matching the record-level migration, so nothing that is visible today disappears.
- **`retired` on a row** covers a correction: an event superseded by a restatement is retired rather than deleted, which keeps the provenance of what was believed and when. This is the row-level counterpart of the Metaplanet restatement case.

**The ingest drafts the `client_summary`** (decided 29 September). A step after classification composes a subscriber-facing summary from the record's stored facts — mandate, custody, accounting treatment — and writes it as a draft alongside the rest of the run's output. A human edits and clears; nothing reaches Minute on a model's say-so.

Two constraints on that step, and they are not stylistic. It is the only place in the platform where a model drafts prose intended for subscribers, and BTS holds no AFS authorisation — the text must stay information about how an entity implemented something, never anything a reader could take as advice — so: it composes only from `client_fact_class` implementation facts and never from `curator_notes`, which are internal voice and frequently outcome-shaped; and the drafted summary is inert until cleared, with clearance blocked where the text is empty or unedited from the draft. The restricted-metrics seed applies here as a hard filter, not a guideline — mNAV, BTC Yield and the rest cannot appear even when a primary filing states them. The prohibited word list in `.claude/skills/bts-design/references/naming.md` ("advice", "recommend", "should", "best" and the rest) is a hard filter on the same terms.

### Still open

- **Notification is decided and the plumbing already exists.** A dashboard card plus an email. Email sends through `lib/fastmailJmap.ts`, a typed JMAP client (RFC 8620 and 8621) authenticating with Fastmail app-specific passwords, which already carries the submission spec for sending. Two senders use it today — `sendNewsDigest.ts` for the daily headlines and `sendSocialDraft.ts` for social drafts — and the market report goes out the same way. So this is a `sendReviewQueueDigest` beside them: same client, same identity, same recipient pattern, no provider decision and no domain setup. Follow `sendNewsDigest`'s conventions rather than inventing a second digest style.
- **The card** follows the existing `show_on_dashboard` routine-tile pattern on the internal dashboard: draft count, companies involved, time of last run, linking to `/research?review_state=draft`. The email carries the same summary and the same link.
- **Both are suppressed on a quiet run.** `isQuietRun` already skips the scoring model and should gate notification and queueing alike, so a message always means something happened. Signal stays reserved for the two cases that justify interrupting someone: a numeric validation failure, and a reconcile delta on a record already cleared to subscribers — wrong data in front of clients rather than work waiting in a queue.

**Deliberately not in this spec:** scale control across five orders of magnitude, peer-shaped matching, and the `is_fixture` guard — all still open from the original spec, none of them moved by records 4 to 11.
