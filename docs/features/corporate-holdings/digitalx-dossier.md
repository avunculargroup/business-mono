# Corporate Research — DigitalX Limited

**Discovery prototype, record 2.** Chosen deliberately as a stress test: an ASX entity with a large bitcoin position whose document furniture, business model and regulatory exposure are all unlike Locate's. The purpose is to find out what the schema derived from record 1 cannot hold.

**Record status:** prototype — not Lex-classified, not client-facing
**Last verified against source:** 12 August 2026
**Primary document obtained:** March 2026 Quarterly Report and Appendix 4C, released 23 April 2026
**Freshness:** the company reports treasury holdings *monthly*. Two to four monthly disclosures and the June 2026 quarterly are unreviewed.

---

## 1. Identity

| Field | Value | Source |
|---|---|---|
| Legal name | DigitalX Limited | Mar 2026 quarterly |
| Listing | ASX:DCC; OTCQB — **see ticker note** | Mar 2026 quarterly |
| ABN | 59 009 575 035 | Mar 2026 quarterly |
| Registered office | Suite 2, Level 4, 66 Kings Park Road, West Perth WA 6005 | Mar 2026 quarterly |
| ASX listing date | 17 February 1999 | bitcoinminingstock.io — `[UNVERIFIED against ASX record]` |
| Self-description | "the only ASX-listed crypto fund manager… the longest standing publicly listed digital asset company in Australia" | Mar 2026 quarterly |
| Executive Chair | Leigh Travers, appointed during Q3 FY26 | Mar 2026 quarterly |
| Prior leadership | Demetrios Christou, Interim CEO & GM Finance (as at Oct 2025) | secondary |
| Company Secretary | Mark Licciardo | secondary |
| Reporting standard | AASB | Appendix 4E FY25 |
| Financial year end | 30 June | Appendix 4C (9-month YTD at 31 Mar) |

**Ticker note:** the March 2026 quarterly gives the OTC ticker as **DGGFX** in its own header line and **DGGXF** in the body. One primary document, two spellings of the same identifier. Recorded because an identifier-keyed ingest would treat these as different securities, and because it establishes that "primary document" does not mean "internally consistent."

**Archetype: native exposure.** This is the third category from the original taxonomy and the first record to occupy it. DigitalX is a digital asset funds manager whose balance sheet holds the asset class it sells. Its bitcoin position is not a treasury allocation decision taken by an operating business — it is closer to inventory adjacent to a product line. The distinction is not academic; see section 6.

---

## 2. Position — and the look-through problem

### 31 December 2025 (monthly treasury announcement, 23 January 2026)

| Holding | Quantity | Value A$ | % of total |
|---|---|---|---|
| Spot Bitcoin | 308.8 BTC | 40,533,170 | 51.0% |
| DigitalX Bitcoin ETF units | 889,367 units | 27,486,964 | 34.6% |
| Other digital assets | 20,521.4 | 3,831,824 | 4.8% |
| Digital asset investment, Lime Street Capital SPC | 12.8565 | 4,851,235 | 6.1% |
| Cash | — | 2,818,951 | 3.5% |
| **Total** | | **79,522,144** | 100% |

The company states the ETF units are equivalent to 194.85 BTC, giving **total bitcoin exposure of 503.7 BTC** against **direct spot holdings of 308.8 BTC**.

### 31 March 2026 (quarterly report, 23 April 2026)

| Holding | Value A$ |
|---|---|
| Cash | 14,190,884 |
| Bitcoin | 16,950,601 |
| DigitalX Bitcoin Fund (ETF units) | 18,881,075 |
| Other liquid investments | 9,004,318 |
| Bricklet property investments | 497,720 |
| **Total** | **59,524,598** |

Headline in the same document: **"Bitcoin holdings of 364 BTC, maintaining DigitalX's position as Australia's largest ASX-listed Bitcoin company."**

**The reconciliation problem.** The 364 BTC headline carries no stated basis. The asset table beneath it separates direct bitcoin from fund units, and the December disclosure establishes that the company sometimes quotes direct holdings and sometimes total exposure. 364 sits between December's 308.8 direct and 503.7 look-through, so it cannot be read off either convention without the underlying price. This is the same ambiguity that made third-party trackers report DigitalX at 308.8 and 504 simultaneously — except here the source of the ambiguity is the company's own primary document, not a tracker's sloppiness.

The company also states that liquid assets fell approximately $18m over the quarter, attributed to movements in digital asset market prices, while separately disclosing that the Superstate allocation was funded via sales of digital assets and redemptions from external managers. Price movement and disposal are both in the number and are not separated.

**Ledger rule that follows:** every holdings row needs `basis` — `direct_spot`, `look_through`, or `stated_unreconciled` — and a row whose basis cannot be determined is recorded as stated, flagged, and never used in a comparison.

---

## 3. Mandate and custody

Materially thinner than Locate's record, and the thinness is itself informative — a funds manager discloses its *product* custody in PDSs and its *balance sheet* custody barely at all.

- **Permitted assets:** not bitcoin-only. FY25 saw the purchase of A$11,519,700 of Solana with cash; the treasury table carries "other digital assets," a Cayman SPC investment, tokenised US Treasuries and property. No published single-asset mandate located.
- **Balance sheet custody:** no disclosure located. The company states generally that it implements institutional-grade custody and insurance working exclusively with reputable independent partners, but names no custodian for its own holdings. `[GAP]`
- **Product custody:** BitGo is named as listed custodian in connection with the Superstate USTB allocation. Product-level, not treasury-level.
- **Yield:** US$6.16m allocated to Superstate's USTB, a tokenised short-duration US Treasury fund yielding roughly 3.5%, with daily liquidity and on-chain subscription and redemption. Contributed A$83k in the quarter. Described as a first step in generating on-chain yield within a controlled risk and governance framework, with further market-neutral and yield strategies under evaluation.

Locate's PDS committed to explore yield opportunities "while prioritising security and custodial risk management" and had done nothing about it. DigitalX has actually deployed. Worth noting as the live example if the topic ever comes up with a CFO — and worth noting that it went into tokenised Treasuries, not bitcoin lending.

---

## 4. Capital structure and operations

**Q3 FY26 (quarter to 31 March 2026), from the Appendix 4C:**

| Item | Quarter A$'000 | 9-month YTD A$'000 |
|---|---|---|
| Receipts from customers | 848 | 2,138 |
| Net operating cash flow | (296) | (2,135) |
| Proceeds from disposal, other non-current assets | 11,685 | 20,929 |
| Payments for other non-current assets | — | (20,058) |
| Proceeds from equity issues | — | 20,756 |
| Cash at end of quarter | 14,193 | 14,193 |
| Payments to related parties (director remuneration) | 37 | — |

- **No debt of any kind.** Loan facilities, credit standby arrangements and other facilities are all nil. Estimated quarters of funding available: 47.95.
- Operating outflow down 57% on the December quarter and 77% on the prior corresponding quarter.
- Revenue A$903k for the quarter. **Sell My Shares** — a share sale platform — delivered record quarterly revenue of A$808k, up 11.8% on the prior record.
- **DigitalX Bitcoin ETF (ASX:BTXX):** returned −25.8% for the quarter; since inception +13.7% after fees; A$36.8m AUM at quarter end.
- **A$30m Strategic Investment and Acquisition Program** announced February 2026, funded from the existing balance sheet, deployed progressively, targeting revenue-generating digital asset infrastructure. Explicitly framed as following a review of treasury strategy in response to changing market conditions.

The pattern across both records is now visible: a bitcoin position built in 2024–25, and in the first half of 2026 both companies pivoting capital *away* from accumulation — Locate to a buyback with an idle ATM, DigitalX to an acquisition program and tokenised Treasuries. Two companies, different structures, same directional change in the same window. That is either a coincidence or a finding, and the only way to know is a third and fourth record.

---

## 5. Regulatory position — a different pressure point entirely

**October 2025:** DigitalX responded to a query from **ASX Enforcement** regarding its treasury asset management operations and strategy. The company's response emphasised compliance with legal requirements in the digital asset sector and clarified that its treasury strategy does not classify it as an issuer of investment products or a managed investment scheme, describing a conservative approach where legal positions are uncertain.

This is not Locate's problem. Locate was told bitcoin counts as readily convertible to cash under Listing Rule 12.3 and it therefore risked suspension. DigitalX's exposure is characterisation risk — whether running a treasury of digital assets alongside a funds management business makes the treasury itself a product or a scheme. Same regulator, same asset, entirely different question, because the archetype differs.

**The open question worth flagging rather than answering.** At 31 March 2026 DigitalX held roughly A$35.8m of bitcoin and bitcoin fund units plus A$14.2m cash against total liquid assets of A$59.5m. Locate was told it risked suspension for holding a materially smaller proportion. Why DigitalX's position is treated differently is not stated in any document reviewed. Plausible readings — that its principal activity is funds management rather than investment, that the LIC framework applies instead, that the ASX Enforcement engagement resolved it, or that the test is against total assets rather than liquid assets — are all speculation, and none belongs in the record. **This is the highest-value unresolved question across both dossiers, and answering it properly would need the ASX Enforcement correspondence and the FY25 balance sheet.**

---

## 6. Accounting treatment

From the FY25 Appendix 4E (year ended 30 June 2025):

- The consolidated entity determined its digital assets are most appropriately classified under the **intangible asset method**, noting that no specific accounting standard covers digital assets.
- Treatment continues to be to **measure digital assets at fair value**, unless otherwise disclosed and provided certain conditions are met.
- Digital assets are classified as **current assets** to reflect their liquidity — being readily convertible to cash within the normal operating cycle or within 12 months without significant financial penalty — and are viewed by management as forming part of the company's treasury function.

**Two ASX-reporting entities, same standard, same fair-value election.** Locate applies AASB 138 indefinite-life intangible with the revaluation model. DigitalX applies the intangible asset method at fair value. Between them this is now a pattern rather than a data point: the practical answer to an Australian CFO asking "can we mark bitcoin to market" is yes, under the intangible framework, where an active market exists.

**The irony worth putting in the jurisdiction notes.** DigitalX classifies its digital assets as *current* precisely because they are readily convertible to cash. ASX invoked that same characterisation to tell Locate its bitcoin counted toward the Listing Rule 12.3 cash-box limit. The identical property — liquidity — is a virtue in the accounts and a liability in the listing rules. A CFO writing a board paper needs both halves of that sentence.

---

## 7. Comparison — what a CFO should take from each

| | Locate Technologies | DigitalX |
|---|---|---|
| Archetype | Treasury allocation → bitcoin treasury company | Native exposure (funds manager) |
| Operating business | Logistics SaaS + marketplace | Funds management + share sale platform |
| Mandate | Bitcoin only, written policy published | Multi-asset, no published single-asset mandate |
| Funding of position | Equity issuance: placement, ATM, IPO | Balance sheet; equity issues fund the business |
| Debt | A$4m secured facility, covenants breached repeatedly | **None** |
| Custody | Zodia, disclosed in detail, no insurance | Not disclosed for balance sheet |
| Accounting | AASB 138, revaluation model, gains to OCI / losses to P&L | Intangible method, fair value, current assets |
| ASX pressure point | Listing Rule 12.3 cash-box → left for NZX | ASX Enforcement query on MIS/product characterisation |
| Disclosure cadence | Episodic announcements | Monthly treasury updates |
| Transferable to a mid-market AU CFO | **High** — policy, covenant, governance all liftable | **Low** — it is a fund manager |

**The honest conclusion about this record.** DigitalX is the more famous Australian bitcoin holder and the less useful case study. Its bitcoin decision is not a treasury decision an operating CFO can learn from — it is a fund manager holding the asset it sells, in a business where that is unremarkable. Putting it alongside Locate on a ranked list would be the exact category error the section is designed to avoid.

Its value to the platform is as a **jurisdiction and precedent record**, not a peer: it supplies the second AASB fair-value data point, the ASX Enforcement precedent, and the current-asset classification argument. That is worth a page. It is not worth a comparison table with an operating company, and the UI must make that structurally impossible rather than merely discouraged.

---

## 8. Restricted — not for client-facing render

Standard restrictions apply. Two additions specific to this record:

- BTXX fund performance figures (−25.8% for the quarter, +13.7% since inception after fees) are product returns for a registered managed investment scheme. Reproducing them in BTS material is a materially higher-exposure act than quoting a company's own balance sheet, and should be treated as off-limits rather than merely Lex-gated.
- Third-party analyst characterisations of the business encountered during research — "value trap," "broken business model" — are not to enter the record in any form, including as attributed quotation.

---

## 9. Gaps

| Gap | Where it lives |
|---|---|
| Basis for the 364 BTC headline | June 2026 quarterly; monthly treasury announcements Apr–Jul 2026 |
| Balance sheet custody arrangements | FY25 annual report; corporate governance statement |
| Why DigitalX's asset proportion does not trigger the ASX cash-box concern | ASX Enforcement correspondence, Oct 2025; FY25 balance sheet |
| Whether a written treasury policy exists and is published | Company website; annual report |
| Former names and corporate history back to the 1999 listing | ASX company record |
| FY26 result and any change under the new Executive Chair | Due ~August 2026 |

---

## Prototype findings — what record 2 broke

1. **Look-through exposure is a first-class field, not a footnote.** Direct spot, fund units held in the entity's *own* ETF, an SPC investment, tokenised Treasuries. `treasury_holdings_snapshots` needs `asset`, `instrument_type`, `basis` and `look_through_btc_equivalent` per row. A single `btc_held` column cannot represent this company at all.

2. **The self-referential holding has no field anywhere.** DigitalX's treasury includes units in an ETF DigitalX manages. Neither the schema nor the archetype taxonomy anticipated an entity holding its own product as treasury. It needs a flag, because look-through exposure through a related-party vehicle is not economically identical to direct holding and should never be silently summed.

3. **Bitcoin-only is an assumption record 1 smuggled in.** Locate's mandate permits bitcoin and nothing else, and the schema quietly inherited that. Solana, "other digital assets," property and tokenised Treasuries all appear here. `asset_class` belongs on every event and holding row, and the page must be able to say "and these other things" without distorting.

4. **Finding types must tolerate structural absence.** The `covenant_change` type proposed after Locate returns nothing here — DigitalX has no debt at all. Absence is informative and should render as a stated fact ("no financing facilities at quarter end, per Appendix 4C item 7.4"), not as an empty panel.

5. **Disclosure cadence varies by more than an order of magnitude.** Monthly treasury announcements here; episodic ones at Locate. `expected_disclosure_cadence` on `research_companies` is what lets the freshness stamp mean something and stops the quiet-day logic reporting silence where silence is normal.

6. **Primary documents contradict themselves.** DGGFX in the header, DGGXF in the body, one document. The source hierarchy from record 1 was necessary but is not sufficient; identifier fields need cross-document consensus, not single-document trust.

7. **Archetype must gate the comparison UI, not just label it.** Record 1 established that archetype needs two fields. Record 2 establishes something stronger: treasury allocation and native exposure require *different page templates* and must be structurally non-comparable. A funds manager has no treasury policy to lift, no board approval path worth studying, and no covenant story. Rendering it in the same table as an operating company would actively mislead.

8. **The Appendix 4C is a free, structured, quarterly primary source for every ASX small cap.** Standardised line items, machine-friendly, and it carries the financing facilities table, related-party payments and quarters-of-funding figure. For the regional register it is the single highest-yield recurring document, and it is the one the PDF pipeline should target first.
