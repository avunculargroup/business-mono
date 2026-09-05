import type {
  CompanyDossier,
  CompanyFact,
  JurisdictionNote,
  LedgerEntry,
  PositionRow,
  Provenance,
  RegisterEntry,
  StructuralAbsence,
  WithheldField,
} from '@platform/data';
import { onDate } from './anchor';
import { RESEARCH_ENTITIES } from './entities';

/**
 * The corporate research register, as five shapes.
 *
 * Wholly fictional entities carrying real pathologies. Each record exists to
 * demonstrate one failure mode found while researching real companies; a set of
 * clean, well-behaved records would demonstrate nothing, and would also be the
 * more dangerous artefact — approximate data about real listed entities on a
 * public URL is precisely the harm this feature exists to prevent.
 *
 * ## Two departures from the fixture roster in the feature docs
 *
 * 1. **Two records are renamed.** The roster's suggested names collided with
 *    `COMPANIES.kestrel` and `WATCHED.signingProject`; see `entities.ts`.
 * 2. **Two source documents are upgraded.** The roster sourced a
 *    `capital_posture_change` event and a holdings snapshot from an investor
 *    presentation, which the source-class gate rejects at write time — rank 4
 *    against a required rank 2 for any ledger row. Both now come from exchange
 *    announcements, which is also the truer account: a posture change is
 *    visible by joining a quarterly cash-flow report to a capital notice, and
 *    both of those are announcements.
 *
 * ## Dates
 *
 * Every date is an offset from the anchor, per the relative dating rule. The
 * freshness records especially: "ninety days quiet" has to still be ninety days
 * quiet next year, and a literal would make the stale record un-stale the
 * moment nobody was looking.
 */

// ── Documents ──────────────────────────────────────────────────────────────
//
// Local paths, never an external host. A fixture URL that resolves to
// something real is a fixture that can be mistaken for research.

function doc(
  anchor: Date,
  init: Omit<Provenance, 'publishedAt'> & { daysAgo: number },
): Provenance {
  const { daysAgo, ...rest } = init;
  return { ...rest, publishedAt: onDate(anchor, -daysAgo) };
}

function documents(anchor: Date) {
  return {
    // Rank 1. The single document that resolved custody, mandate, covenants
    // and acquisition history after four rounds of searching produced none of
    // it. Any company that has done an offer, scheme or migration has one.
    meridianOffer: doc(anchor, {
      documentId: 'doc-mfg-offer',
      documentTitle: 'Meridian Freight Group — offer document',
      sourceClass: 'regulated_disclosure',
      sourceUrl: '/fixtures/docs/mfg-offer.pdf',
      isAudited: true,
      daysAgo: 300,
    }),
    meridianTreasuryUpdate: doc(anchor, {
      documentId: 'doc-mfg-ann-004',
      documentTitle: 'Meridian Freight Group — treasury update',
      sourceClass: 'exchange_announcement',
      sourceUrl: '/fixtures/docs/mfg-ann-004.pdf',
      isAudited: false,
      daysAgo: 452,
    }),
    meridianQuarterly: doc(anchor, {
      documentId: 'doc-mfg-4c',
      documentTitle: 'Meridian Freight Group — quarterly cash flow report',
      sourceClass: 'exchange_announcement',
      sourceUrl: '/fixtures/docs/mfg-4c.pdf',
      isAudited: false,
      daysAgo: 61,
    }),
    // Rank 5. Present so the interface can show it losing an argument it
    // should never have been in.
    meridianAbout: doc(anchor, {
      documentId: 'doc-mfg-web-about',
      documentTitle: 'Meridian Freight Group — About us',
      sourceClass: 'company_web',
      sourceUrl: '/fixtures/docs/mfg-about.html',
      isAudited: false,
      daysAgo: 40,
    }),
    verrallMonthly: doc(anchor, {
      documentId: 'doc-vrdm-monthly',
      documentTitle: 'Verrall Digital Asset Management — monthly treasury holdings',
      sourceClass: 'exchange_announcement',
      sourceUrl: '/fixtures/docs/vrdm-monthly.pdf',
      isAudited: false,
      daysAgo: 12,
    }),
    verrallQuarterly: doc(anchor, {
      documentId: 'doc-vrdm-4c',
      documentTitle: 'Verrall Digital Asset Management — quarterly cash flow report',
      sourceClass: 'exchange_announcement',
      sourceUrl: '/fixtures/docs/vrdm-4c.pdf',
      isAudited: false,
      daysAgo: 42,
    }),
    nyalaAccounts: doc(anchor, {
      documentId: 'doc-nyla-accounts',
      documentTitle: 'Nyala Payments — quarterly financial statements',
      sourceClass: 'exchange_announcement',
      sourceUrl: '/fixtures/docs/nyla-accounts.pdf',
      isAudited: true,
      daysAgo: 36,
    }),
    tarraPolicy: doc(anchor, {
      documentId: 'doc-tarh-policy',
      documentTitle: 'Tarra Holdings — treasury management policy',
      sourceClass: 'exchange_announcement',
      sourceUrl: '/fixtures/docs/tarh-policy.pdf',
      isAudited: false,
      daysAgo: 620,
    }),
    tarraAnnual: doc(anchor, {
      documentId: 'doc-tarh-annual',
      documentTitle: 'Tarra Holdings — annual report',
      sourceClass: 'exchange_announcement',
      sourceUrl: '/fixtures/docs/tarh-annual.pdf',
      isAudited: true,
      daysAgo: 210,
    }),
    calderMonthly: doc(anchor, {
      documentId: 'doc-cldr-monthly',
      documentTitle: 'Calder Capital — monthly treasury holdings',
      sourceClass: 'exchange_announcement',
      sourceUrl: '/fixtures/docs/cldr-monthly.pdf',
      isAudited: false,
      daysAgo: 92,
    }),
  };
}

export type ResearchDocuments = ReturnType<typeof documents>;

/** The documents, exposed so the trace replay and the pages cite the same rows. */
export function researchDocuments(anchor: Date): ResearchDocuments {
  return documents(anchor);
}

/**
 * Every document held against a company, whether or not a ledger row cites it.
 *
 * Freshness is measured off this rather than off the ledger: a record whose
 * most recent filing said nothing new is still a record that filed. Reading
 * staleness from cited documents only would report a company as overdue for
 * the crime of having had a quiet quarter, which is the exact mistake the
 * cadence rule exists to avoid. Mirrors `v_research_freshness`, which reads
 * `research_documents` directly.
 */
export function researchCompanyDocuments(anchor: Date): Record<string, Provenance[]> {
  const d = documents(anchor);

  return {
    [RESEARCH_ENTITIES.meridian.id]: [
      d.meridianOffer,
      d.meridianTreasuryUpdate,
      d.meridianQuarterly,
      d.meridianAbout,
    ],
    [RESEARCH_ENTITIES.verrall.id]: [d.verrallMonthly, d.verrallQuarterly],
    [RESEARCH_ENTITIES.nyala.id]: [d.nyalaAccounts],
    [RESEARCH_ENTITIES.tarra.id]: [d.tarraPolicy, d.tarraAnnual],
    [RESEARCH_ENTITIES.calder.id]: [d.calderMonthly],
  };
}

// ── Companies ──────────────────────────────────────────────────────────────

const E = RESEARCH_ENTITIES;

/**
 * The register, five records deep.
 *
 * `listings` is current venues; `listingHistory` is every venue including the
 * one a record left. Keeping both is rule 3 made visible — a lookup keyed on
 * the current ticker loses everything filed under the old one.
 */
export function researchCompanies(anchor: Date): CompanyDossier[] {
  return [
    {
      id: E.meridian.id,
      slug: E.meridian.slug,
      legalName: E.meridian.legalName,
      jurisdiction: 'NZ',
      tier: 'regional',
      primaryArchetype: 'treasury_allocation',
      // The divergence is the case study: a logistics software business
      // describing itself as a treasury company while its revenue, staff and
      // customers all sit in the operating business.
      selfDescribedArchetype: 'treasury_company',
      reportingStandard: 'nz_ifrs',
      expectedDisclosureCadence: 'episodic',
      listings: [
        {
          venue: 'nzx',
          ticker: E.meridian.ticker,
          listingType: 'primary',
          filingEntity: 'Meridian Freight Group Limited (NZ)',
          listedFrom: onDate(anchor, -276),
          listedTo: null,
        },
      ],
      listingHistory: [
        {
          venue: 'asx',
          ticker: E.meridian.ticker,
          listingType: 'primary',
          filingEntity: 'Meridian Freight Group Limited (AU)',
          listedFrom: onDate(anchor, -1600),
          listedTo: onDate(anchor, -262),
        },
        {
          venue: 'nzx',
          ticker: E.meridian.ticker,
          listingType: 'primary',
          filingEntity: 'Meridian Freight Group Limited (NZ)',
          listedFrom: onDate(anchor, -276),
          listedTo: null,
        },
      ],
      formerNames: [{ name: 'Parcelway Technologies Limited', usedTo: onDate(anchor, -480) }],
      acn: E.meridian.acn,
      abn: E.meridian.abn,
      arbn: null,
      isin: E.meridian.isin,
      operationalHq: 'New South Wales',
      functionalCurrency: 'AUD',
      presentationCurrency: 'NZD',
      financialYearEnd: '06-30',
      marketCapBand: 'micro',
      fundingSource: 'operating_cash',
      curatorNotes:
        'The ledger splits across two venues and two filing entities, so a lookup keyed ' +
        'on the current code loses everything before the migration. The About page ' +
        'contradicts the offer document on custody. The offer document wins, and the ' +
        'conflict is shown rather than resolved out of sight.',
      lastVerifiedAt: onDate(anchor, -20),
      isPublished: true,
    },
    {
      id: E.verrall.id,
      slug: E.verrall.slug,
      legalName: E.verrall.legalName,
      jurisdiction: 'AU',
      tier: 'regional',
      primaryArchetype: 'native_exposure',
      selfDescribedArchetype: null,
      reportingStandard: 'aasb',
      expectedDisclosureCadence: 'monthly',
      listings: [
        {
          venue: 'asx',
          ticker: E.verrall.ticker,
          listingType: 'primary',
          filingEntity: E.verrall.legalName,
          listedFrom: onDate(anchor, -3800),
          listedTo: null,
        },
      ],
      listingHistory: [
        {
          venue: 'asx',
          ticker: E.verrall.ticker,
          listingType: 'primary',
          filingEntity: E.verrall.legalName,
          listedFrom: onDate(anchor, -3800),
          listedTo: null,
        },
      ],
      formerNames: [],
      acn: E.verrall.acn,
      abn: E.verrall.abn,
      arbn: null,
      isin: E.verrall.isin,
      operationalHq: 'Western Australia',
      functionalCurrency: 'AUD',
      presentationCurrency: 'AUD',
      financialYearEnd: '06-30',
      marketCapBand: 'small',
      fundingSource: 'balance_sheet',
      curatorNotes:
        'Holds units in a fund it manages itself, so its headline number and its direct ' +
        'position are different quantities and must never be silently added. Carries no ' +
        'debt at all, which is why the covenant panel has to be able to state an absence ' +
        'rather than render empty. Not comparable with an operating business.',
      lastVerifiedAt: onDate(anchor, -20),
      isPublished: true,
    },
    {
      id: E.nyala.id,
      slug: E.nyala.slug,
      legalName: E.nyala.legalName,
      jurisdiction: 'US',
      tier: 'bellwether',
      primaryArchetype: 'operational_integration',
      selfDescribedArchetype: null,
      reportingStandard: 'us_gaap',
      expectedDisclosureCadence: 'quarterly',
      listings: [
        {
          venue: 'nyse',
          ticker: E.nyala.ticker,
          listingType: 'primary',
          filingEntity: E.nyala.legalName,
          listedFrom: onDate(anchor, -3200),
          listedTo: null,
        },
        {
          venue: 'asx',
          ticker: E.nyala.ticker,
          listingType: 'cdi_foreign_exempt',
          filingEntity: E.nyala.legalName,
          listedFrom: onDate(anchor, -1100),
          listedTo: null,
        },
      ],
      listingHistory: [
        {
          venue: 'nyse',
          ticker: E.nyala.ticker,
          listingType: 'primary',
          filingEntity: E.nyala.legalName,
          listedFrom: onDate(anchor, -3200),
          listedTo: null,
        },
        {
          venue: 'asx',
          ticker: E.nyala.ticker,
          listingType: 'cdi_foreign_exempt',
          filingEntity: E.nyala.legalName,
          listedFrom: onDate(anchor, -1100),
          listedTo: null,
        },
      ],
      formerNames: [{ name: 'Nyala Commerce Inc.', usedTo: onDate(anchor, -1650) }],
      acn: null,
      abn: null,
      arbn: '000 000 003',
      isin: E.nyala.isin,
      operationalHq: 'United States',
      functionalCurrency: 'USD',
      presentationCurrency: 'USD',
      financialYearEnd: '12-31',
      marketCapBand: 'large',
      fundingSource: 'business_line_gross_profit',
      curatorNotes:
        'Quoted on an Australian venue through a foreign exempt depositary interest, and ' +
        'therefore outside most of that venue rules. It belongs in the bellwether tier ' +
        'and never in the regional register: including it would be technically ' +
        'defensible and analytically worthless. Its headline position includes assets ' +
        'custodied for customers.',
      lastVerifiedAt: onDate(anchor, -20),
      isPublished: false,
    },
    {
      id: E.tarra.id,
      slug: E.tarra.slug,
      legalName: E.tarra.legalName,
      jurisdiction: 'AU',
      tier: 'regional',
      primaryArchetype: 'treasury_allocation',
      selfDescribedArchetype: null,
      reportingStandard: 'aasb',
      expectedDisclosureCadence: 'episodic',
      listings: [
        {
          venue: 'asx',
          ticker: E.tarra.ticker,
          listingType: 'primary',
          filingEntity: E.tarra.legalName,
          listedFrom: onDate(anchor, -2400),
          listedTo: null,
        },
      ],
      listingHistory: [
        {
          venue: 'asx',
          ticker: E.tarra.ticker,
          listingType: 'primary',
          filingEntity: E.tarra.legalName,
          listedFrom: onDate(anchor, -2400),
          listedTo: null,
        },
      ],
      formerNames: [],
      acn: E.tarra.acn,
      abn: E.tarra.abn,
      arbn: null,
      isin: E.tarra.isin,
      operationalHq: 'Victoria',
      functionalCurrency: 'AUD',
      presentationCurrency: 'AUD',
      financialYearEnd: '06-30',
      marketCapBand: 'micro',
      fundingSource: 'operating_cash',
      curatorNotes:
        'A policy, one acquisition, then nothing. This is the normal state of most of ' +
        'the register and it has to render as a legitimate record rather than a broken ' +
        'page. It is also the control for the freshness rule: the same silence that ' +
        'flags Calder as overdue is unremarkable here.',
      lastVerifiedAt: onDate(anchor, -20),
      isPublished: true,
    },
    {
      id: E.calder.id,
      slug: E.calder.slug,
      legalName: E.calder.legalName,
      jurisdiction: 'AU',
      tier: 'regional',
      primaryArchetype: 'native_exposure',
      selfDescribedArchetype: null,
      reportingStandard: 'aasb',
      expectedDisclosureCadence: 'monthly',
      listings: [
        {
          venue: 'asx',
          ticker: E.calder.ticker,
          listingType: 'primary',
          filingEntity: E.calder.legalName,
          listedFrom: onDate(anchor, -2000),
          listedTo: null,
        },
      ],
      listingHistory: [
        {
          venue: 'asx',
          ticker: E.calder.ticker,
          listingType: 'primary',
          filingEntity: E.calder.legalName,
          listedFrom: onDate(anchor, -2000),
          listedTo: null,
        },
      ],
      formerNames: [],
      acn: E.calder.acn,
      abn: E.calder.abn,
      arbn: null,
      isin: E.calder.isin,
      operationalHq: 'Queensland',
      functionalCurrency: 'AUD',
      presentationCurrency: 'AUD',
      financialYearEnd: '06-30',
      marketCapBand: 'micro',
      fundingSource: 'equity_issuance',
      curatorNotes:
        'Committed to monthly treasury disclosure and has published nothing for three ' +
        'months. Identical silence to Tarra, opposite verdict, because staleness is ' +
        'measured against what the issuer said it would do rather than against a fixed ' +
        'window.',
      lastVerifiedAt: onDate(anchor, -95),
      isPublished: true,
    },
  ];
}

/** The register list. The same rows, narrowed to what a list renders. */
export function researchRegister(anchor: Date): RegisterEntry[] {
  return researchCompanies(anchor).map((company) => ({
    id: company.id,
    slug: company.slug,
    legalName: company.legalName,
    jurisdiction: company.jurisdiction,
    tier: company.tier,
    primaryArchetype: company.primaryArchetype,
    selfDescribedArchetype: company.selfDescribedArchetype,
    reportingStandard: company.reportingStandard,
    expectedDisclosureCadence: company.expectedDisclosureCadence,
    listings: company.listings,
  }));
}

// ── Ledger ─────────────────────────────────────────────────────────────────
//
// Quantities and considerations are numeric fields, never prose. That is
// partly a rendering decision — a figure has to arrive with its basis chip and
// its provenance rail — and partly the rule that keeps the demo's prose clear
// of anything that reads as an allocation.

export function researchLedger(anchor: Date): Record<string, LedgerEntry[]> {
  const d = documents(anchor);

  return {
    [E.meridian.id]: [
      {
        id: 'evt-mfg-005',
        companyId: E.meridian.id,
        eventType: 'capital_posture_change',
        assetClass: 'btc',
        eventDate: onDate(anchor, -61),
        quantity: null,
        considerationNative: null,
        nativeCurrency: null,
        considerationAud: null,
        fxRateUsed: null,
        feesIncluded: null,
        headline: 'On-market buyback running while the issuance facility sits undrawn',
        detail:
          'No at-the-market capital was drawn during the quarter. The accumulation ' +
          'facility and the buyback point in opposite directions on the share register, ' +
          'and neither document says so on its own — this is only visible by reading the ' +
          'quarterly report against the capital notice.',
        disclosureVenue: 'nzx',
        basis: null,
        basisComparable: null,
        classification: 'publishable',
        provenance: d.meridianQuarterly,
      },
      {
        id: 'evt-mfg-004',
        companyId: E.meridian.id,
        eventType: 'listing_change',
        assetClass: 'btc',
        eventDate: onDate(anchor, -262),
        quantity: null,
        considerationNative: null,
        nativeCurrency: null,
        considerationAud: null,
        fxRateUsed: null,
        feesIncluded: null,
        headline: 'Listing migration complete',
        detail:
          'A top-hat scheme of arrangement moved the listed parent across venues. ' +
          'Operations did not move. The venue it left applies a cash-box test to an ' +
          'entity holding a large share of its assets in readily convertible form; the ' +
          'venue it moved to has no equivalent rule.',
        disclosureVenue: 'nzx',
        basis: null,
        basisComparable: null,
        classification: 'publishable',
        provenance: d.meridianOffer,
      },
      {
        id: 'evt-mfg-003',
        companyId: E.meridian.id,
        eventType: 'covenant_change',
        assetClass: 'btc',
        eventDate: onDate(anchor, -386),
        quantity: null,
        considerationNative: 500000,
        nativeCurrency: 'AUD',
        considerationAud: 500000,
        fxRateUsed: null,
        feesIncluded: null,
        headline: 'Cash covenant amended to admit bitcoin',
        detail:
          'The replacement covenant sets a floor on the bitcoin balance and a second ' +
          'floor on cash and bitcoin combined. The offer document states the amendment ' +
          'was made in recognition of the treasury policy. A secured lender rewrote a ' +
          'liquidity covenant to admit and then require the asset.',
        disclosureVenue: 'asx',
        basis: null,
        basisComparable: null,
        // Reads on credit quality, which is a view on the security. Lex holds
        // it internal, and holding it is the point: the row is in the ledger
        // and out of anything client-facing.
        classification: 'internal',
        provenance: d.meridianOffer,
      },
      {
        id: 'evt-mfg-002',
        companyId: E.meridian.id,
        eventType: 'acquisition',
        assetClass: 'btc',
        eventDate: onDate(anchor, -452),
        quantity: 6.08914,
        considerationNative: 1000000,
        nativeCurrency: 'AUD',
        considerationAud: 1000000,
        fxRateUsed: null,
        feesIncluded: true,
        headline: 'First acquisition',
        detail:
          'The stated consideration is inclusive of fees and expenses, which is why it ' +
          'does not reconcile against an average price computed from the quantity alone.',
        disclosureVenue: 'asx',
        basis: 'direct_spot',
        basisComparable: true,
        classification: 'publishable',
        provenance: d.meridianTreasuryUpdate,
      },
      {
        id: 'evt-mfg-001',
        companyId: E.meridian.id,
        eventType: 'policy_adoption',
        assetClass: 'btc',
        eventDate: onDate(anchor, -580),
        quantity: null,
        considerationNative: null,
        nativeCurrency: null,
        considerationAud: null,
        fxRateUsed: null,
        feesIncluded: null,
        headline: 'Treasury management policy adopted',
        detail:
          'Bitcoin only. Acquisition permitted where forecast cash meets operational ' +
          'obligations and lender covenants with a buffer above both. Dual authorisation ' +
          'by at least two directors or senior executives.',
        disclosureVenue: 'asx',
        basis: null,
        basisComparable: null,
        classification: 'publishable',
        provenance: d.meridianOffer,
      },
    ],

    [E.verrall.id]: [
      {
        id: 'evt-vrdm-002',
        companyId: E.verrall.id,
        eventType: 'accounting_election',
        assetClass: 'btc',
        eventDate: onDate(anchor, -42),
        quantity: null,
        considerationNative: null,
        nativeCurrency: null,
        considerationAud: null,
        fxRateUsed: null,
        feesIncluded: null,
        headline: 'Revaluation model elected for digital assets',
        detail:
          'Disclosed under a heading about accounting treatment inside the risk factors, ' +
          'not in the financial statements. Retrieval that keys on document sections ' +
          'misses it.',
        disclosureVenue: 'asx',
        basis: null,
        basisComparable: null,
        classification: 'publishable',
        provenance: d.verrallQuarterly,
      },
      {
        id: 'evt-vrdm-001',
        companyId: E.verrall.id,
        eventType: 'policy_adoption',
        assetClass: 'btc',
        eventDate: onDate(anchor, -900),
        quantity: null,
        considerationNative: null,
        nativeCurrency: null,
        considerationAud: null,
        fxRateUsed: null,
        feesIncluded: null,
        headline: 'Treasury framework published',
        detail:
          'Digital assets held in treasury under a stated framework, alongside units in ' +
          'funds the company manages. Holding investments is the business, which is why ' +
          'the cash-box question lands differently here than for an operating company.',
        disclosureVenue: 'asx',
        basis: null,
        basisComparable: null,
        classification: 'publishable',
        provenance: d.verrallQuarterly,
      },
    ],

    [E.nyala.id]: [
      {
        id: 'evt-nyla-001',
        companyId: E.nyala.id,
        eventType: 'accounting_election',
        assetClass: 'btc',
        eventDate: onDate(anchor, -36),
        quantity: null,
        considerationNative: null,
        nativeCurrency: null,
        considerationAud: null,
        fxRateUsed: null,
        feesIncluded: null,
        headline: 'Digital assets measured at fair value through income',
        detail:
          'Movements run through the income statement rather than accumulating in ' +
          'equity, which is the opposite of the revaluation model the other records use. ' +
          'Any comparison drawn from carrying value across the two has to say which ' +
          'standard applies.',
        disclosureVenue: 'nyse',
        basis: null,
        basisComparable: null,
        classification: 'internal',
        provenance: d.nyalaAccounts,
      },
    ],

    [E.tarra.id]: [
      {
        id: 'evt-tarh-002',
        companyId: E.tarra.id,
        eventType: 'acquisition',
        assetClass: 'btc',
        eventDate: onDate(anchor, -540),
        quantity: 2.5,
        considerationNative: 400000,
        nativeCurrency: 'AUD',
        considerationAud: 400000,
        fxRateUsed: null,
        feesIncluded: false,
        headline: 'Single acquisition under the policy',
        detail: 'The only acquisition the company has disclosed. Nothing since.',
        disclosureVenue: 'asx',
        basis: 'direct_spot',
        basisComparable: true,
        classification: 'publishable',
        provenance: d.tarraPolicy,
      },
      {
        id: 'evt-tarh-001',
        companyId: E.tarra.id,
        eventType: 'policy_adoption',
        assetClass: 'btc',
        eventDate: onDate(anchor, -620),
        quantity: null,
        considerationNative: null,
        nativeCurrency: null,
        considerationAud: null,
        fxRateUsed: null,
        feesIncluded: null,
        headline: 'Treasury management policy adopted',
        detail: 'A single-page policy, board approved, with a stated cap on the holding.',
        disclosureVenue: 'asx',
        basis: null,
        basisComparable: null,
        classification: 'publishable',
        provenance: d.tarraPolicy,
      },
    ],

    [E.calder.id]: [
      {
        id: 'evt-cldr-001',
        companyId: E.calder.id,
        eventType: 'policy_adoption',
        assetClass: 'btc',
        eventDate: onDate(anchor, -800),
        quantity: null,
        considerationNative: null,
        nativeCurrency: null,
        considerationAud: null,
        fxRateUsed: null,
        feesIncluded: null,
        headline: 'Monthly treasury disclosure committed to',
        detail:
          'The company undertook to publish holdings monthly. The undertaking is what ' +
          'makes its current silence reportable.',
        disclosureVenue: 'asx',
        basis: null,
        basisComparable: null,
        classification: 'publishable',
        provenance: d.calderMonthly,
      },
    ],
  };
}

// ── Positions ──────────────────────────────────────────────────────────────

export function researchPositions(anchor: Date): Record<string, PositionRow[]> {
  const d = documents(anchor);

  return {
    [E.meridian.id]: [
      {
        id: 'pos-mfg-spot',
        asOfDate: onDate(anchor, -92),
        asset: 'btc',
        instrumentType: 'spot',
        quantity: 12.3,
        basis: 'direct_spot',
        basisComparable: true,
        lookThroughBtcEquivalent: null,
        isRelatedPartyVehicle: false,
        includesCustomerAssets: false,
        provenance: d.meridianQuarterly,
      },
    ],

    // The look-through record. The direct holding and the fund units are
    // different quantities of different things, and the second is the one a
    // headline figure quietly folds into the first.
    [E.verrall.id]: [
      {
        id: 'pos-vrdm-spot',
        asOfDate: onDate(anchor, -12),
        asset: 'btc',
        instrumentType: 'spot',
        quantity: 308.8,
        basis: 'direct_spot',
        basisComparable: true,
        lookThroughBtcEquivalent: null,
        isRelatedPartyVehicle: false,
        includesCustomerAssets: false,
        provenance: d.verrallMonthly,
      },
      {
        id: 'pos-vrdm-units',
        asOfDate: onDate(anchor, -12),
        asset: 'btc',
        instrumentType: 'fund_units',
        quantity: 889367,
        basis: 'look_through',
        basisComparable: false,
        lookThroughBtcEquivalent: 194.85,
        isRelatedPartyVehicle: true,
        includesCustomerAssets: false,
        provenance: d.verrallMonthly,
      },
      {
        id: 'pos-vrdm-sol',
        asOfDate: onDate(anchor, -12),
        asset: 'sol',
        instrumentType: 'spot',
        quantity: 41200,
        basis: 'direct_spot',
        basisComparable: true,
        lookThroughBtcEquivalent: null,
        isRelatedPartyVehicle: false,
        includesCustomerAssets: false,
        provenance: d.verrallMonthly,
      },
    ],

    // Customer assets custodied alongside the corporate position. Same
    // exclusion, unrelated reason.
    [E.nyala.id]: [
      {
        id: 'pos-nyla-corporate',
        asOfDate: onDate(anchor, -36),
        asset: 'btc',
        instrumentType: 'spot',
        quantity: 8997.89,
        basis: 'direct_spot',
        basisComparable: true,
        lookThroughBtcEquivalent: null,
        isRelatedPartyVehicle: false,
        includesCustomerAssets: false,
        provenance: d.nyalaAccounts,
      },
      {
        id: 'pos-nyla-total',
        asOfDate: onDate(anchor, -36),
        asset: 'btc',
        instrumentType: 'other',
        quantity: 28355.05,
        basis: 'includes_customer_assets',
        basisComparable: false,
        lookThroughBtcEquivalent: null,
        isRelatedPartyVehicle: false,
        includesCustomerAssets: true,
        provenance: d.nyalaAccounts,
      },
    ],

    [E.tarra.id]: [
      {
        id: 'pos-tarh-spot',
        asOfDate: onDate(anchor, -210),
        asset: 'btc',
        instrumentType: 'spot',
        quantity: 2.5,
        basis: 'direct_spot',
        basisComparable: true,
        lookThroughBtcEquivalent: null,
        isRelatedPartyVehicle: false,
        includesCustomerAssets: false,
        provenance: d.tarraAnnual,
      },
    ],

    [E.calder.id]: [
      {
        id: 'pos-cldr-spot',
        asOfDate: onDate(anchor, -92),
        asset: 'btc',
        instrumentType: 'spot',
        quantity: 61.4,
        basis: 'direct_spot',
        basisComparable: true,
        lookThroughBtcEquivalent: null,
        isRelatedPartyVehicle: false,
        includesCustomerAssets: false,
        provenance: d.calderMonthly,
      },
    ],
  };
}

// ── Qualitative facts ──────────────────────────────────────────────────────

/**
 * The panel that carries the source-class rule.
 *
 * Meridian's About page and its offer document disagree about custody. The
 * offer document wins because it is a regulated disclosure and the About page
 * is marketing copy, and the losing claim is rendered beside the winning one
 * rather than deleted — a register that resolved the conflict silently would be
 * teaching the opposite of the lesson.
 */
export function researchFacts(anchor: Date): Record<string, CompanyFact[]> {
  const d = documents(anchor);

  return {
    [E.meridian.id]: [
      {
        id: 'fact-mfg-custody',
        fieldKey: 'custody',
        label: 'Custody',
        value:
          'Held with an institutional custodian. Transferred on settlement and not '
          + 'retained with brokers for storage; holdings sit in segregated accounts. '
          + 'No insurance is in place. Reliance on third-party custodians is listed as a '
          + 'key risk, naming custodian insolvency among the causes of loss.',
        asOf: onDate(anchor, -300),
        provenance: d.meridianOffer,
        conflicting: {
          value:
            'The About page states that self-custody means the company controls its '
            + 'treasury directly with no counterparty risk, and no reliance on banks or '
            + 'intermediaries.',
          provenance: {
            documentTitle: d.meridianAbout.documentTitle,
            sourceClass: d.meridianAbout.sourceClass,
            sourceUrl: d.meridianAbout.sourceUrl,
          },
        },
      },
      {
        id: 'fact-mfg-mandate',
        fieldKey: 'mandate',
        label: 'Mandate and authority',
        value:
          'Bitcoin only. Acquisition permitted where forecast cash meets operational '
          + 'obligations and lender covenants with a buffer above both. Transactions '
          + 'above a prescribed limit require prior board approval; all require dual '
          + 'authorisation by at least two directors or senior executives.',
        asOf: onDate(anchor, -300),
        provenance: d.meridianOffer,
        conflicting: null,
      },
    ],
    [E.verrall.id]: [
      {
        id: 'fact-vrdm-custody',
        fieldKey: 'custody',
        label: 'Custody',
        value:
          'Not disclosed for the balance sheet. The company describes institutional-'
          + 'grade custody in general terms and names no custodian for its own holdings. '
          + 'A funds manager discloses its product custody and its treasury custody '
          + 'barely at all.',
        asOf: onDate(anchor, -42),
        provenance: d.verrallQuarterly,
        conflicting: null,
      },
    ],
  };
}

// ── Structural absences ────────────────────────────────────────────────────

/**
 * What each record can state because it is missing.
 *
 * An empty covenant panel and a company with no debt look identical on a
 * screen, and only one of them is an answer.
 */
export function researchAbsences(anchor: Date): Record<string, StructuralAbsence[]> {
  const d = documents(anchor);

  return {
    [E.verrall.id]: [
      {
        companyId: E.verrall.id,
        subject: 'covenants',
        statement:
          'No financing facilities at quarter end, per the financing facilities item of ' +
          'the quarterly cash flow report. There is no covenant to report because there ' +
          'is no debt.',
        provenance: d.verrallQuarterly,
      },
    ],
    [E.tarra.id]: [
      {
        companyId: E.tarra.id,
        subject: 'holdings',
        statement:
          'No treasury event has been disclosed since the single acquisition. The ' +
          'position is unchanged, which the annual report restates rather than revises.',
        provenance: d.tarraAnnual,
      },
    ],
    [E.calder.id]: [
      {
        companyId: E.calder.id,
        subject: 'holdings',
        statement:
          'No monthly holdings statement has been published since the last one shown ' +
          'here, against a stated monthly cadence.',
        provenance: d.calderMonthly,
      },
    ],
  };
}

// ── Withheld ───────────────────────────────────────────────────────────────

/**
 * What Lex declined to publish, rendered rather than silently omitted.
 *
 * The same list for every record, because these are categories of claim rather
 * than facts about a particular company. A page that quietly dropped them would
 * look identical to one that never computed them.
 */
export function researchWithheld(): WithheldField[] {
  return [
    {
      fieldKey: 'unrealised_position',
      classification: 'restricted',
      reason:
        'Position against cost basis is a valuation output. The register states what was '
        + 'disclosed, never what it is worth.',
    },
    {
      fieldKey: 'nav_premium',
      classification: 'restricted',
      reason:
        'Premium or discount to net asset value, and holdings per share, are valuation '
        + 'measures of a listed security.',
    },
    {
      fieldKey: 'share_price_attribution',
      classification: 'restricted',
      reason:
        'Attributing a share price movement to a treasury announcement is a statement '
        + 'about the security.',
    },
    {
      fieldKey: 'dilution_narration',
      classification: 'restricted',
      reason:
        'Narrating dilution from issuance, or accretion from a buyback, is a view on '
        + 'shareholder outcomes.',
    },
    {
      fieldKey: 'shareholder_outcome_comparison',
      classification: 'restricted',
      reason:
        'Comparing the shareholder outcome against holding the asset directly compares '
        + 'two investments.',
    },
    {
      fieldKey: 'covenant_credit_signal',
      classification: 'restricted',
      reason:
        'Characterising a covenant waiver as a credit-quality signal is a credit view on '
        + 'a listed borrower.',
    },
    {
      fieldKey: 'curator_notes',
      classification: 'internal',
      reason:
        'Curator notes record retrieval traps and provenance. Working material, not a '
        + 'client-facing claim.',
    },
  ];
}

// ── Jurisdiction notes ─────────────────────────────────────────────────────

/**
 * The notes the panel joins onto a record.
 *
 * Written without naming a real exchange or regulator. Naming one is not the
 * risk on its own; attributing an invented analysis to one is, and these are
 * written for a demo rather than for the internal register, where the real
 * notes seeded by the migration carry rule references and source links.
 */
export function researchJurisdictionNotes(anchor: Date): JurisdictionNote[] {
  return [
    {
      id: 'jn-revaluation',
      noteKey: 'revaluation_model',
      topic: 'accounting',
      title: 'The revaluation model, and where the election hides',
      body:
        'Under the Australian and New Zealand standards a digital asset held in treasury ' +
        'is generally an intangible, measured after recognition under either a cost model ' +
        'or a revaluation model. Under the revaluation model an increase accumulates in ' +
        'equity rather than passing through profit.\n\n' +
        'Two things to check on any record. The election may not be in the financial ' +
        'statements — one record in this register discloses it inside the risk factors. ' +
        'And a presentation convention is not a measurement basis: a quarterly deck ' +
        'marking a holding at spot and saying so is telling you how the deck is drawn.',
      ruleReference: null,
      primarySourceUrl: null,
      appliesToStandard: 'aasb',
      appliesToVenue: null,
      appliesToListingType: null,
      verifiedAt: onDate(anchor, -20),
      isPublished: true,
    },
    {
      id: 'jn-fair-value',
      noteKey: 'fair_value_through_income',
      topic: 'accounting',
      title: 'Fair value through income, and why the two records do not compare',
      body:
        'A United States issuer measures in-scope digital assets at fair value with ' +
        'changes recognised in net income each period, presented separately from other ' +
        'intangibles.\n\n' +
        'The movement is the same as under a revaluation model. The reported earnings are ' +
        'not. A comparison drawn from carrying value that does not say which standard ' +
        'applies is comparing two different questions.',
      ruleReference: null,
      primarySourceUrl: null,
      appliesToStandard: 'us_gaap',
      appliesToVenue: null,
      appliesToListingType: null,
      verifiedAt: onDate(anchor, -20),
      isPublished: true,
    },
    {
      id: 'jn-cash-box',
      noteKey: 'cash_box_test',
      topic: 'listing_rules',
      title: 'The cash-box test has two limbs, and the second one is the answer',
      body:
        'Where half or more of a listed entity total assets is cash or readily ' +
        'convertible to cash, the primary Australian venue may suspend quotation until ' +
        'the entity invests those assets or uses them for its business.\n\n' +
        'The rule is not a prohibition on holding liquid assets. It is a prohibition on ' +
        'holding them uncommitted, and the test turns on the second limb. An operating ' +
        'business holding a treasury position is not using that position for its ' +
        'business. A funds manager holding digital assets under a stated framework ' +
        'arguably is, because holding investments is the business.\n\n' +
        'Nothing here transfers directly to an unlisted company: the listing rules bind ' +
        'listed entities. The shape of the test does transfer, because financiers, ' +
        'auditors and insurers apply their own versions of it. A holding is assessed ' +
        'relative to the business it sits inside, and the question is always whether the ' +
        'asset is committed to something or merely parked.',
      ruleReference: null,
      primarySourceUrl: null,
      appliesToStandard: null,
      appliesToVenue: 'asx',
      appliesToListingType: 'primary',
      verifiedAt: onDate(anchor, -20),
      isPublished: false,
    },
  ];
}
