# Corporate Research — Block, Inc.

**Discovery prototype, record 3.** Selected because it is ASX-quoted and holds bitcoin, but is a US issuer accessing the ASX by a route that exempts it from almost everything that constrained record 1. The question this record answers is not "what did Block do" but "does an ASX-quoted foreign issuer belong in an Australian register at all."

**Record status:** prototype — not Lex-classified, not client-facing
**Last verified against source:** 12 August 2026
**Freshness:** most recent disclosure reviewed is the July 2026 Appendix 4A CDI statement. Q2 2026 results are referenced from secondary sources only.

---

## 1. Identity — and an identifier problem worse than record 1's

| Field | Value | Source |
|---|---|---|
| Legal name | Block, Inc. | Appendix 4A |
| **Former name** | **Square, Inc.** (2009–2021) | Wikipedia — `[UNVERIFIED against filings]` |
| Primary listing | NYSE: XYZ (Class A) | Appendix 4A |
| **Former primary ticker** | **NYSE: SQ** (2015–2025) | Wikipedia — `[UNVERIFIED]` |
| ASX quotation | `ASX:XYZ` — CDI 1:1 Foreign Exempt NYSE | Appendix 4A, May & Jul 2026 |
| **Former ASX ticker** | **`ASX:SQ2`** | Listcorp announcement history |
| Second ASX code | `XYZAA` — Class A Common Stock, 502,870,832 securities at 31 Jul 2026 | Appendix 4A Jul 2026 |
| ARBN | 654151514 | Appendix 4A |
| ISIN | US8522341036 | Wikipedia — `[UNVERIFIED]` |
| CDIs on issue | 37,945,174 at 31 Jul 2026 (36,543,992 at 31 May 2026) | Appendix 4A |
| Reporting standard | US GAAP | ASU 2023-08 adoption |
| Chair & CEO | Jack Dorsey | Wikipedia |
| CFO & COO | Amrita Ahuja | Wikipedia |
| FY2025 | Revenue US$24.2bn; operating income US$1.71bn; net income US$1.31bn; total assets US$39.5bn; equity US$22.2bn | Wikipedia — `[UNVERIFIED against 10-K]` |

**Six identifiers for one company:** Square → Block, SQ → XYZ, SQ2 → XYZ, plus XYZAA, an ARBN and an ISIN. Record 1 had two renames; this has two renames across two exchanges plus a second ASX code for the underlying stock. The `former_names[]` and `listing_history` structures proposed after Locate hold this, but only if `ticker` is never treated as a stable key anywhere in the pipeline.

**Archetype: operational integration.** A fourth category, and it needs adding. Block's bitcoin is neither a treasury allocation from surplus cash (Locate), nor inventory adjacent to a fund product (DigitalX). It arrives substantially as a byproduct of an operating bitcoin business — Cash App bitcoin trading, Bitkey hardware wallets, Proto mining hardware — and the purchase policy is funded from that business's own gross profit. Different funding source, different governance, different transferability.

---

## 2. Position — and a third distinct way the headline misleads

**As at March 2026 (Q1 2026 transparency update):** 28,355 BTC total, split:

| Category | BTC | Approx. value |
|---|---|---|
| Held for customers via Cash App | 19,357.16 | ~US$1.5bn |
| **Corporate treasury** | **8,997.89** | ~US$696m |

Independent auditors confirmed full backing and on-chain verification of these holdings.

Third-party trackers report Block at roughly 9,000 BTC — correctly using the corporate figure — but the headline "28,355 BTC" appears in coverage and is the number a careless ingest would capture.

**The pattern across three records is now complete.** Each gave a different mechanism by which a stated bitcoin number overstates the corporate position:

| Record | Failure mode | Ratio |
|---|---|---|
| Locate | Secondary sources wrong on consideration | A$1.0m actual vs A$647.5k reported |
| DigitalX | Look-through via units in its *own* ETF | 308.8 direct vs 503.7 exposure |
| Block | Customer assets custodied alongside corporate treasury | 8,998 corporate vs 28,355 total |

Three records, three unrelated causes. The `basis` field proposed after DigitalX needs a fourth value — `includes_customer_assets` — and a hard rule that any holdings row without an explicit basis is unusable for comparison.

**Proportionality inverts completely.** Corporate bitcoin of roughly US$696m against total assets of US$39.5bn is under 2% of the balance sheet. Locate's holdings were around 13% of its market capitalisation at a market cap of A$15.8m. Same asset, same archetype family on a superficial read, five orders of magnitude apart in scale and two in proportion. Nothing about Block's position tells an Australian mid-market CFO anything about materiality thresholds, covenant interaction, or auditor scrutiny at their own scale.

---

## 3. Mandate — the most transferable artefact across all three records

Block publishes a **Bitcoin Blueprint for Corporate Balance Sheets** at `block.xyz/documents/bitcoin-blueprint.pdf`. It is an explicit corporate treasury playbook, published for other companies to use, and it is the single most directly relevant document encountered in this exercise.

**The purchase mechanism:** a dollar-cost-average programme allocating a portion of monthly gross profit from bitcoin products to bitcoin investment on a predetermined, recurring cadence. The company's stated rationale is that this sidesteps market timing, and optimises the long-term position while minimising the price risk of attempting larger, less frequent purchases. Monthly gross profit from bitcoin products is defined as gross profit from Cash App customer buying and selling of bitcoin, Cash App bitcoin withdrawals, and other bitcoin products from emerging initiatives. For April 2024 the amount purchased under the DCA was US$4.4m.

**Why this matters for BTS.** It is a third funding mechanism, distinct from both prior records:

- Locate: newly issued equity (placement, ATM, IPO)
- DigitalX: existing balance sheet, no external funding for the position
- Block: gross profit from the bitcoin business line itself

Only the first is available to a private Australian company with no bitcoin revenue. The Block mechanism is unavailable to almost every CFO BTS speaks to, and should be presented as illustrative of *policy design* — predetermined cadence, defined funding source, no discretionary timing — rather than as a replicable mechanism.

`[GAP]` The Blueprint has been identified but not parsed. Custody architecture, authority limits and disposal policy are all likely inside it and none has been extracted.

---

## 4. Jurisdiction — the foreign exempt listing, and why it resolves record 1's open question

Block's ASX securities are described in its own Appendix 4A as **"CDI 1:1 FOREIGN EXEMPT NYSE"**, and the company's investor relations material confirms Class A shares are listed on ASX as CHESS Depositary Interests via a Foreign Exempt Listing.

A foreign exempt listing is a materially different animal from a standard ASX listing: the entity is admitted on the basis of its compliance with its home exchange, and is relieved of most ASX Listing Rule obligations. Which means:

**Listing Rule 12.3 — the rule that pushed Locate off the ASX — does not bind Block.**

This closes a loop opened in record 1. Locate's PDS stated an intention to "dual or foreign-exempt list on other exchanges" to broaden its capital pool. Block is the working example of what that status looks like in the opposite direction: a company holding bitcoin, quoted on the ASX, in the ASX 200, entirely outside the cash-box test that a A$15m Perth-adjacent logistics company could not survive.

**The register-membership problem this creates.** An Australian CFO searching for ASX companies holding bitcoin will find Block. It is ASX-quoted and index-included. It is also a US issuer, reporting under US GAAP, with no ASX listing rule obligations, whose only Australian operational connection is Afterpay. Including it in a "regional register" alongside Locate and DigitalX would be technically defensible and analytically worthless.

**Schema consequence:** `listing_type` — `primary`, `secondary`, `cdi_foreign_exempt` — must gate register membership, not merely annotate it. Regional register inclusion should require a primary listing or domestic incorporation. Block belongs in the bellwether tier with a visible foreign-exempt flag, never in the AU/NZ/SG register.

---

## 5. Accounting — the counter-example, and it is quoted on the same exchange

**Block adopted ASU 2023-08 early, for its year ended 31 December 2023.** Bitcoin is remeasured to fair value with gains and losses flowing through net income each reporting period, replacing the prior cost-less-impairment model.

Set against the other two records:

| Record | Standard | Model | Gains | Losses |
|---|---|---|---|---|
| Locate | AASB 138 → NZ IAS 38 | Revaluation model | **OCI** (profit only when reversing prior losses) | P&L once reserve exhausted |
| DigitalX | AASB, intangible asset method | Fair value, current assets | Fair value movements | Fair value movements |
| Block | US GAAP, ASC 350-60 | Fair value through net income | **Net income** | Net income |

**This is the jurisdiction delta made concrete, and it is the strongest single teaching point across all three records.** An Australian investor can hold two ASX-quoted bitcoin holders whose identical economic exposure produces opposite earnings behaviour. Under Locate's model, a rising bitcoin price produces no reported profit. Under Block's, it produces reported profit directly. A CFO reading US commentary about bitcoin treasury companies "marking to market" is reading about a regime that does not apply to them, even though the company describing it may be quoted on their own exchange.

Note also that Block recognises bitcoin sales on a gross basis, which inflates revenue relative to peers reporting net — Q4 2021 bitcoin revenue of US$1.96bn produced US$46m of bitcoin gross profit, roughly 2%. Any comparison of "bitcoin revenue" across companies without checking gross versus net presentation is meaningless. Worth a jurisdiction note of its own.

---

## 6. Restricted — not for client-facing render

Standard restrictions, plus:

- Block is an S&P 500 constituent with continuous analyst coverage. The volume of readily available valuation commentary makes accidental restatement of a market view unusually easy. Treat any Block page as maximum-caution.
- Segment profitability figures sourced from secondary aggregators (for example Q2 2026 bitcoin gross profit growth and adjusted operating margin) must be verified against the 10-Q before entering the record at all.

---

## 7. Gaps

| Gap | Where it lives |
|---|---|
| Bitcoin Blueprint contents — custody, authority limits, disposal | block.xyz/documents/bitcoin-blueprint.pdf — identified, not parsed |
| Custody architecture for corporate holdings | Blueprint; 10-K |
| Current DCA rate and cumulative purchases since inception | Quarterly transparency updates; 10-Q |
| FY2025 figures verified against the 10-K | SEC EDGAR |
| Whether the corporate/customer split is presented in the audited statements or only in transparency updates | 10-K |

---

## Prototype findings — what record 3 broke

1. **A fourth archetype exists: operational integration.** Bitcoin acquired from the gross profit of a bitcoin business line is not a treasury allocation, not a treasury company, and not fund inventory. The taxonomy needs the category, and the page template needs to show funding source as a first-class field rather than inferring it from the ledger.

2. **`listing_type` must gate register membership.** ASX quotation via foreign exempt CDI is not the same market-access fact as an ASX primary listing. A regional register that includes Block because it appears on the ASX is a register that has stopped answering the question it exists to answer. This is a product decision, not a data-modelling detail, and it should be made before any register is seeded.

3. **The holdings-basis field now needs four values, from three records.** Direct spot, look-through, includes-customer-assets, stated-unreconciled. Each was discovered empirically. Assume a fifth exists and build the field as an open vocabulary with a hard rule: no basis, no comparison.

4. **Ticker is never a key.** Three records, six identifier changes between them. `ticker` is a display field and a search hint. Resolution runs on legal entity plus registration number — ARBN, ACN, ABN, ISIN — with a name and ticker history table alongside.

5. **The three accounting models are the actual product.** Across three records we now have AASB 138 revaluation, AASB intangible-at-fair-value, and US GAAP ASC 350-60 fair-value-through-income — with two of the three quoted on the ASX. A jurisdiction_notes panel that shows all three side by side, keyed to the reporting standard rather than the company, does more for an Australian CFO than any individual company page. That panel should be built first and joined onto every record, exactly as scoped.

6. **Published corporate playbooks are a document type, not an accident.** Block wrote a treasury blueprint for other companies. Locate published a Treasury Management Policy. Both are the highest-transferability artefacts on their respective pages, and neither is an exchange filing. The document layer needs a `playbook` type with its own acquisition path — company document directories, not announcement feeds.

7. **Scale ranges over five orders of magnitude within the same section.** US$696m corporate bitcoin against A$1.0m. Any UI element that ranks, charts, or tables across records without a scale control will render the small Australian companies — the ones that actually matter to the audience — as rounding errors. Peer-shaped matching, already specced, is now load-bearing rather than a nicety.
