# Corporate Research — Locate Technologies Limited

**Discovery prototype, revision 4.** Doubles as the proposed page template for the Corporate Research section. Every factual row carries a source and an as-of date. Uncited claims are marked `[UNVERIFIED]` and must not render.

**Record status:** prototype — not Lex-classified, not client-facing
**Last verified against source:** 12 August 2026
**Primary documents obtained:** IPO Product Disclosure Statement, 3 November 2025 — including Section 8 risk factors, pp.53–60 (locatetech.nz/documents/pds.pdf); ASX Media Release "Treasury Update", 4 June 2025; NZX announcement 475783, 7 July 2026.
**Accounting treatment: resolved** — see section 6. AASB 138 / NZ IAS 38 indefinite-life intangible, revaluation model.

---

## 1. Identity

| Field | Value | Source |
|---|---|---|
| Legal name | Locate Technologies Limited (NZ) — "Locate NZ" | PDS |
| Australian operating entity | Locate Technologies Limited (Australia) — "Locate Australia", now a wholly-owned subsidiary | PDS |
| **Former name** | **Zoom2u Technologies Limited** — renamed May 2025 | PDS p.10 |
| Listing venue | NZX Main Board — `NZX:LOC` | NZX L&Q notice 463829 |
| Prior listing | ASX, listed September 2021 as Zoom2u Technologies; delisted 17 December 2025 | PDS p.10 |
| ISIN | NZLOCE0001S9 | NZX L&Q notice 463829 |
| Registered office | Level 17, PwC Tower, 15 Customs Street West, Auckland | NZX L&Q notice |
| Operational HQ | Pyrmont, New South Wales | Yahoo Finance; PDS |
| Financial year end | 30 June | NZX L&Q notice 463829 |
| Functional / presentation currency | Operating results in **AUD**; investor reporting presented in **NZD** | Q3 FY26 presentation |
| Chair | Drew Kelton (independent) | PDS p.28 |
| Founder, MD & CEO | Steve Orenstein | PDS p.28 |
| CFO & Company Secretary | Michael Gayst (Chartered Accountant, membership lapsed; 25+ yrs corporate finance) | PDS p.29 |
| Other directors | Mike Rosenbaum, Brett O'Riley, Janine Grainger (all independent NED) | PDS pp.29–30 |
| Bitcoin advisor | Sulabh Gupta, Chief Risk Officer of Auros — consultancy basis, remunerated in options with 50% of vesting tied to bitcoin-strategy performance conditions | PDS pp.30, 38 |
| Segments | Locate2u (SaaS), Zoom2u (marketplace), 2u Enterprises (Shred2u + marketing services) | PDS pp.17–20 |

**Archetype:** hybrid, and the company says so itself — the PDS describes a "dual identity" as logistics technology provider and treasury manager, and names the bitcoin strategy as the single aspect expected to have the most significant impact on future financial performance. Third-party accumulation is funded from capital markets; the operating business is real and growing. Both labels are correct, which is why the schema needs both.

### Entity-resolution hazards

1. **Rename and ticker change.** Zoom2u Technologies (`ASX:Z2U`) → Locate Technologies (`ASX:LOC`), May 2025. Both the name *and* the code moved. A ticker-keyed ingest and a name-keyed ingest each lose a different slice of history.
2. **Two entities, one ticker.** Locate Australia and Locate NZ both traded as LOC, on different exchanges, with an overlap period. Announcements must be attributed to the filing entity, not the code.
3. **Namesake collision.** "Locate Technologies Inc.", an unrelated Canadian entity, has SEC F-1 filings from 2006–07 that outrank the real company in full-text search.

---

## 2. Position ledger

| Date | Event | BTC | Consideration | Cumulative | Source |
|---|---|---|---|---|---|
| **January 2025** | **Treasury management policy adopted** by Locate Australia, permitting bitcoin acquisition | — | — | 0 | PDS p.12 |
| 29 May 2025 | A$1.45m placement at A$0.07/share; A$2m ATM facility established with Novus Capital | — | A$1.45m raised | 0 | ASX ann. 29 May 2025; PDS |
| **4 June 2025** | **First acquisition — primary document** | **6.08914** | **A$1,000,000** at A$164,227/BTC (~US$106,110), inclusive of fees and expenses | 6.08914 | ASX Media Release, 4 Jun 2025 |
| 26 Jun – 1 Jul 2025 | ATM issuance: 1,825,322 shares at A$0.185–0.240, avg A$0.215 | — | A$392,564 raised | — | ASX ann.; sharecafe |
| 30 June 2025 | Position at year end | — | Bitcoin A$1.6m + cash A$1.8m = A$3.4m treasury, +64% vs 30 Jun 2024 | **10.1** | PDS p.12 |
| by 30 July 2025 | Accumulation complete for the period; ATM issuances totalled ~A$1.4m through mid-July | — | — | **12.3** | PDS p.12 |
| 23 Sept 2025 | Bitcoin ~A$2.1m; market cap A$15.8m — holdings ≈13% of market capitalisation | — | — | 12.3 | PDS p.27 |
| 31 Dec 2025 (Q2 FY26) | Holdings unchanged | 0 | — | 12.3 | Q3 FY26 presentation |
| 31 Mar 2026 (Q3 FY26) | Holdings unchanged; **no ATM capital drawn** | 0 | — | 12.3 | NZX 471376 |

**Conflict resolved.** Revision 1 flagged two incompatible secondary figures for the first purchase — approximately A$647,500 and approximately US$667,000. The primary announcement says **A$1,000,000 for 6.08914 BTC**. Both secondary figures were wrong, and the correct number is roughly 50% higher than one of them. The ingest rule stands vindicated: secondary sources populate leads, primary documents populate the ledger.

---

## 3. Mandate, governance and custody

### Treasury Management Policy — obtained in substance

Adopted by Locate Australia in **January 2025**; Locate NZ adopted a policy in the same form in all material respects. Published at `locatetech.nz/documents/LOC - Treasury Management Policy (final).pdf`. Material terms as summarised in the PDS (pp.12–13, 27):

- **Permitted assets:** bitcoin only. No other digital asset class.
- **Liquidity gate:** acquisition permitted only where forecast cash reserves remain sufficient to meet operational obligations *and lender covenant requirements*, with a buffer above those thresholds. Quoted clause: cash reserves must at all times be more than 20% higher than the forecast cash required to meet covenant requirements per management's most recent monthly cashflow forecast.
- **Authority limits:** transactions above a prescribed monetary limit require prior Board approval; below it, senior executives may authorise provided liquidity buffers remain intact.
- **Dual control:** all transactions require authorisation by at least two directors and/or senior executives. Settlement funds released from bank accounts only under dual authorisation.
- **Counterparty selection:** accredited brokers only, selected on liquidity, transaction size, execution pricing and counterparty risk.
- **Disposal:** not anticipated other than to maintain liquidity buffers or comply with covenants; same approval and dual-authorisation framework applies.
- **Oversight:** regular Board reporting on acquisitions, custody and valuations; independent verification of holdings as part of annual reporting, including external auditor confirmation of existence and valuation.

This is a genuinely well-specified policy for a company of this size, and it is the most directly transferable artefact in the record. An unlisted Australian CFO can lift the structure — permitted assets, liquidity gate tied to covenant headroom, dual authorisation, delegated authority thresholds — without lifting the thesis.

### Custody — answered, and the company's own website is wrong

**Per the PDS (pp.12–13):**

- Bitcoin is held with **Zodia**, an institutional-grade custodian whose shareholders include Standard Chartered Bank, SBI Group, Northern Trust and National Australia Bank.
- Bitcoin is transferred to the custodian immediately on settlement. **It is not retained with brokers for storage.**
- Holdings sit in segregated accounts. The company intends to engage multiple independent custodians to reduce single-point-of-failure risk.
- Liability: the company can pursue uncapped damages against Zodia for loss due to fraud, wilful misconduct, or other liability that cannot lawfully be limited.
- **Insurance: none in place.** The company was engaging with brokers about additional bitcoin insurance but had not arranged any as at the PDS date.
- Assurance: intends independent quarterly reviews reconciling custodian statements against blockchain records, and consideration of SOC 2 Type II or ISAE 3402 reports where custodians make them available.
- Listed as a key risk: reliance on third-party custodians, where a cybersecurity breach, operational failure or custodian insolvency could cause partial or total loss.

**The contradiction.** The company's own About page states that self-custody means it controls its treasury directly with no counterparty risk, and that self-custody capability means no reliance on banks or intermediaries. The PDS — a regulated offer document under the Financial Markets Conduct Act — says the opposite: third-party institutional custody, with custodian insolvency named as a key risk.

Revision 2 of this dossier recorded "self-custody, controls undisclosed" on the strength of the website. That was wrong, and it was wrong in the direction that flatters. **Marketing copy and regulated disclosure documents are not the same source class, and the schema must not let the former populate a controls field.**

---

## 4. Capital allocation mechanism

**Phase 1 — accumulation via issuance (Jan–Dec 2025)**

- A$1.45m wholesale placement at A$0.07, May 2025.
- ATM facility with Novus Capital: the broker holds collateral shares issued for nil consideration, sells them on market within minimum-price and volume limits set by the company, remits proceeds, and receives replacement shares. Locate NZ's version was established with 45,000,000 initial Novus shares at nil consideration; unsold collateral shares are bought back for nil if the facility terminates.
- IPO: 13,333,333 shares at NZ$0.075 / A$0.068 (~NZ$1m). Use of proceeds disclosed as NZ$300,000 to bitcoin, NZ$340,000 listing costs, NZ$360,000 working capital.
- ATM constraints disclosed: issuance is capped by the **15% placement limit under the NZX Listing Rules** unless shareholder approval is obtained. The Locate Group believes its facility is the **first ATM used in the New Zealand market**. Disclosed risks include dilution (likelihood described as high whenever the facility is used), unreliable access to capital in weak markets, broker counterparty and execution risk, and downward pressure on the share price — including the risk that investors read ATM issuance as a signal of funding stress.
- Stated future intent: use a range of capital structures including **equity and debt** to raise fiat on a consistent basis for systematic bitcoin acquisition, with additional capital raised only on attractive terms. Also flagged: possible future dual or foreign-exempt listing on other exchanges to broaden the capital pool.

**Phase 2 — the posture changes (Jan–Jul 2026)**

| Date | Event | Source |
|---|---|---|
| Quarter to 31 Mar 2026 | **No ATM capital drawn.** Holdings unchanged. | NZX 471376 |
| 20 April 2026 | **On-market share buyback announced** — up to 12 months, subject to caps, operating only during Permitted Periods under the Securities Trading Policy, terminable at will | Q3 FY26 presentation |
| 1 July 2026 | 10,000,000 shares issued to Pure Asset Management in settlement of the **buyout of the Locate2u revenue royalty** | NZX 475783 |
| 7 July 2026 | Notice re-issued: shares on issue corrected 307,378,078 → **307,287,539**, the 90,539 difference being buyback shares not yet cancelled on the register | NZX 475783 |

An idle issuance facility running alongside an active buyback is a disclosed fact and a meaningful one. Any narration of *why*, or of what it implies about management's view of the share price, is a valuation statement and belongs in section 8.

### The Pure Asset Management facility — and the covenant that changed

This is the most surprising disclosure in the record, and the most useful one for an Australian CFO.

- Locate Australia is borrower under a facility with Pure Asset Management Pty Ltd as trustee for The Income and Growth Fund. **A$4,000,000 principal outstanding at 30 June 2025.** Pure also held 3.1% of the shares.
- All Locate Group members guarantee the facility and have granted security over all present and after-acquired property.
- Covenant history disclosed: EBITDA covenant hurdle missed for the quarters ending 31 December 2024, 31 March 2025 and 30 June 2025; the cash balance temporarily fell below the minimum in the March 2025 quarter; the September 2025 quarter EBITDA covenant was also breached, partly due to Migration costs. Pure waived its rights in each case.
- **On 14 August 2025 the cash covenant was formally amended.** The replacement covenant requires a minimum **bitcoin** balance of A$500,000, with aggregate cash *and bitcoin* of at least A$1.35m. The PDS states the change was made in recognition of the company's adoption of bitcoin as a treasury reserve asset.

The PDS assesses the likelihood of further covenant breaches as moderate to high, and states that if further breaches are neither remedied nor waived, Pure may demand immediate repayment or enforce its security over group assets — in severe cases threatening the group's ability to continue as a going concern.

A secured lender rewrote a liquidity covenant to admit bitcoin as a qualifying reserve asset — and, notably, to *require* a minimum holding of it. For a CFO whose first objection to any treasury allocation is "our financier will not wear it," this is a documented Australian counter-example. It is also the clearest evidence in the record that the bitcoin position is entangled with the debt structure rather than sitting beside it.

---

## 5. Jurisdiction delta — the ASX constraint, now settled

The PDS states the position directly, and it resolves the rule-number ambiguity that revisions 1 and 2 had to flag:

> Under **ASX Listing Rule 12.3**, if half or more of an entity's total assets is cash or in a form readily convertible to cash, ASX may suspend quotation until those assets are invested or used in the business. **ASX advised Locate Australia that it considers bitcoin to be an asset in a form readily convertible to cash**, and that the company therefore risked suspension if it continued to pursue its bitcoin strategy. The NZX Listing Rules contain no equivalent restriction.

Three things follow:

1. **12.3 is the operative rule**, not 12.5. Secondary commentary that attributed the 50% test to 12.5 was wrong. Cite rule text.
2. **This was a specific determination communicated to this company**, not general guidance. It sits above the 29 August 2025 Compliance Update in evidentiary weight and predates it in effect.
3. **The "readily convertible to cash" characterisation cuts both ways.** ASX treats bitcoin as cash-like, which penalises a treasury holder under 12.3. DigitalX Limited, an ASX entity, classifies its digital assets as *current* assets in its FY25 accounts on essentially the same reasoning — readily convertible to cash within the operating cycle. Same logic, opposite consequence, depending on which document you are reading.

**Structure of the move.** Top-hat scheme of arrangement under s411 of the Corporations Act: Locate NZ acquired all Locate Australia shares, one-for-one. Conditional on shareholder approval (1 December 2025), court approval, an independent expert's best-interests conclusion, and **an ATO class ruling confirming scrip-for-scrip rollover relief** for shareholders holding on capital account. Locate NZ listed 3 December 2025; scheme implemented 16 December; ASX delisting 17 December.

That ATO class ruling condition is worth its own line in the jurisdiction notes — a cross-border migration structured to be tax-neutral for Australian shareholders.

**What transfers to an unlisted Australian company:** the Listing Rule constraint does not apply at all. Most of BTS's audience is unaffected by it, and presenting this case as evidence of an Australian regulatory barrier would be wrong.

**What does transfer:** the covenant renegotiation; the policy structure; the fact that the binding constraint was a *proportionality* test, which financiers and auditors apply in their own forms; and the demonstration that a listed AU entity could not hold bitcoin at scale without leaving the exchange.

---

## 6. Accounting treatment — **RESOLVED**

Source: PDS Section 8, "Accounting Treatment of Bitcoin" (pp.55–56). Stated in the risk-factor section rather than the financial information section, which is why four rounds of searching the accounts missed it.

**The election.** Locate Australia accounts for bitcoin as an **intangible asset with an indefinite useful life under AASB 138, applying the revaluation model**. Bitcoin is recognised at cost on acquisition and subsequently remeasured to fair value at each reporting date. Locate NZ intends to apply the same treatment; NZ IAS 38 applies rather than AASB 138, but the PDS states there is no effective difference because the standards are aligned — same recognition, measurement and disclosure principles.

**The asymmetry, in the company's own words.** Upward revaluations go to Other Comprehensive Income and do not contribute to profit unless they reverse prior losses. Downward revaluations exceeding the revaluation reserve are charged directly to profit or loss. The company also notes the requirement for regular fair value assessments and impairment testing.

This is the single most important accounting fact on the page and it is the opposite of what a CFO reading US comparators will assume. Under ASU 2023-08 a US holder marks to fair value through net income in both directions. Under the AASB 138 / IAS 38 revaluation model, gains bypass profit and losses land in it once the reserve is exhausted. A treasury allocation that performs well produces no reported earnings benefit; one that performs badly produces a reported loss. The PDS says so plainly: this may create periods where statutory earnings do not reflect the underlying long-term strategy, and it explicitly flags that significant downward revaluations could create compliance pressure with debt covenants.

**Why that matters here specifically.** Read alongside section 4: the Pure facility carries an EBITDA covenant that has been breached repeatedly, and a covenant requiring a minimum A$500,000 bitcoin balance with aggregate cash and bitcoin of at least A$1.35m. The accounting model routes bitcoin declines into profit or loss, and the covenant package is measured partly on the bitcoin balance itself. The company identifies the linkage; the dossier records it as disclosed, and stops there.

**No hedging.** Locate Australia does not hedge its bitcoin exposure and Locate NZ has no specific plans to. The PDS commits that if hedging is adopted in future, relevant policies will be adopted and disclosed to the market.

**Comparability.** The PDS notes the divergence from the US FASB approach creates challenges for international comparability. For the jurisdiction notes: an Australian or NZ CFO cannot read a US bitcoin treasury company's earnings line and expect their own to behave the same way, even holding the same asset in the same quantity.

**Australian cross-reference.** DigitalX Limited's FY25 Appendix 4E reaches the same destination by a slightly different route — digital assets classified under the intangible asset method, measured at fair value, held as current assets to reflect liquidity as part of the treasury function. Two ASX-reporting entities, same standard, same fair-value election. That is now a pattern rather than a single data point.

**Assurance.** Independent verification of holdings forms part of annual reporting, including external auditor confirmation of existence and valuation. Auditor: Grant Thornton.

**Adjacent, deliberately not interpreted:** the H1 FY26 loss after tax widened to $2,000,318 from $934,471, with NZX transition costs and non-cash ESOP expense named by the company as contributors. Whether a downward bitcoin revaluation sits inside that figure is not stated in any document sighted, and given the model above it is a question worth asking rather than answering.

---

## 7. Operating context

**H1 FY26 (half-year to 31 December 2025), released 25 February 2026:**

| Metric | H1 FY26 | pcp |
|---|---|---|
| Group revenue | $3,508,646 | $3,511,553 |
| Locate2u revenue | $1,882,219 (+29%) | $1,456,807 |
| Locate2u segment result | loss $278,190 | loss $897,107 |
| Loss after income tax | $2,000,318 | $934,471 |

**Q3 FY26 (quarter to 31 March 2026), NZD:**

| Metric | Q3 FY26 | YoY |
|---|---|---|
| Group revenue | $1.80m | +15% |
| Locate2u revenue | $1.08m (60% of group) | +42% |
| Zoom2u revenue | $0.72m | −11% |
| Reported EBITDA | +$167k | +$269k — first positive group quarter |
| Normalised EBITDA | +$275k | excludes NZX transition costs, non-cash ESOP |
| Cash at 31 Mar 2026 | $1.1m | — |
| BTC holdings | 12.3 | unchanged |

Customer concentration, quantified: the three largest Zoom2u customers accounted for approximately **33% of Zoom2u's FY25 revenue**. Currency: the majority of operating revenue is earned in AUD while the shares are quoted in NZD; the PDS notes the AUD/NZD rate ranged roughly 1.06–1.11 over the six months to 9 September 2025.

Business context from the PDS: ~500 paying Locate2u clients across AU, NZ, US, UK and UAE; subscriptions from A$12/month to over A$10,000/month; Zoom2u has facilitated 4.4m+ deliveries with enterprise customers including DHL, Nespresso and Bunnings; Talcasoft acquired November 2022 for A$2.0m (A$1.36m cash, A$0.64m scrip). Named risks include customer concentration in Zoom2u and gig-economy worker-classification exposure across the marketplace model.

---

## 8. Restricted — not for client-facing render

Gated by Lex before any client-facing surface:

- Unrealised position against cost basis
- mNAV, premium/discount to bitcoin NAV, bitcoin-per-share
- Share price movement attributed to any treasury announcement
- Dilution narration from ATM issuance, accretion narration from the buyback
- Inference about management's view of the share price from the buyback
- Any comparison of shareholder outcome versus holding bitcoin directly
- Any characterisation of the covenant waivers as a credit-quality signal

Note the bitcoin-as-percentage-of-market-cap figure (~13% at 23 September 2025) is a company-disclosed statistic and may be cited as such, with its date. Recomputing it at today's prices is a valuation exercise and is restricted.

---

## 9. Remaining gaps

| Gap | Where it lives |
|---|---|
| Whether any bitcoin revaluation movement sits in the H1 FY26 result | H1 FY26 accounts, 25 Feb 2026 — the revaluation reserve and P&L charge lines |
| Treasury Management Policy verbatim | `locatetech.nz/documents/LOC - Treasury Management Policy (final).pdf` — located, not yet parsed |
| Whether multi-custodian and insurance intentions were executed | FY26 annual report; corporate governance statement |
| Whether quarterly independent custody reviews commenced | Same |
| Q4 FY26 and FY26 full-year result (FY ends 30 June) | NZX announcements — imminent or just past |
| Reported CFO/Company Secretary change | NZX announcement 468126 — referenced in a forum post, not sighted |

---

## Prototype findings — implications for the build

1. **Source class must be a hard field, and marketing copy is not a source class.** The About page says self-custody with no counterparty risk. The regulated offer document names a third-party custodian and lists custodian insolvency as a key risk. Revision 2 of this dossier got custody wrong by trusting the website. `source_type` needs at least: `regulated_disclosure` > `exchange_announcement` > `audited_accounts` > `investor_presentation` > `company_web` > `secondary`. Fields like custody, accounting treatment and mandate should refuse to populate from anything below `exchange_announcement`.

2. **Prospectuses and offer documents are the highest-yield document type by a wide margin.** One PDS resolved custody, mandate, the ASX determination, the covenant structure, board composition and the acquisition history — after four rounds of searching had produced none of it. Any company that has done an IPO, scheme, or migration has one. The ingest should look for offer documents *first*, before quarterlies.

3. **Secondary sources were wrong about the first purchase by ~50%.** A$1,000,000, not A$647,500 or US$667,000. Three credible-looking outlets, zero primary documents, one number that a CFO might have quoted in a board paper.

4. **Debt covenants are where treasury strategy actually gets tested.** The single most transferable fact — a secured lender amending a liquidity covenant to admit and require bitcoin — appears nowhere in any bitcoin treasury tracker. `treasury_events` needs a `covenant_change` type, and the extraction pass needs to read facility and covenant disclosures, not just holdings announcements.

5. **Capital-posture changes need their own finding type.** An idle ATM alongside a live buyback is only visible by joining a quarterly update to a capital change notice. A holdings-only watcher reports "no change" on the quarter the strategy visibly shifted.

6. **Entity resolution needs name, ticker and filing-entity history.** Zoom2u → Locate, Z2U → LOC, Locate Australia → Locate NZ, ASX → NZX, plus a Canadian namesake in EDGAR. Every one of those breaks a naive key.

7. **The reconciliation floor calibration example is in hand.** An amended notice restating shares on issue by 90,539 — 0.03% — because buyback shares had not yet been cancelled on the register. Administrative, not signal. Rex needs a materiality floor before the feed drowns.

8. **The accounting note was in the risk factors, not the financial statements.** Four rounds of searching annual reports, half-year accounts and Section 7 missed it entirely, because the company disclosed its AASB 138 revaluation election under "Accounting Treatment of Bitcoin" in the risk section. Extraction cannot key on document *sections* — the field-to-location map is unreliable across issuers. Chunk and embed whole documents, then retrieve by field semantics.

9. **Retrieval, not discovery, is the binding constraint.** Every route to the statutory accounts is a JavaScript widget — the company's IR site, Market Index, Listcorp — and the one primary document that reaches us truncates before the financials. Meanwhile the two documents that *did* yield everything were a direct PDF link on marketindex's data API and a static PDF on the company's own document path. The ingest needs a document-fetch layer that resolves announcement IDs to PDF URLs and pulls the file whole, independent of whatever renders the index page. Discovery was never the problem here; the last mile was.

10. **Archetype cannot be a single enum.** The company describes its own dual identity in its offer document. Store `primary_archetype` and `self_described_archetype`, surface the divergence.
