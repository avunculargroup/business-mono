import type {
  Brief,
  ClientRegisterEntry,
  ClientSubscription,
  CommercialDisclosure,
  ComplianceDocument,
  CompanyIdentity,
  CompanyProfile,
  DirectoryEntry,
  IndicatorSeries,
  LibrarySection,
  Signal,
} from '@platform/data';
import { at, onDate } from './anchor';

/**
 * Fixture data for the client domains — Minute's read models, not the internal
 * platform's.
 *
 * These exist so the client contract suite runs against two adapters rather
 * than one. The Supabase side runs against a canned-response fake that cannot
 * honour a `.eq()`, so two of the eight assertions had to be split into "the
 * fake pre-filters the rows" plus "a separate case checks the adapter issues
 * the filter". Here the data is real and the filtering is real TypeScript, so
 * each of those assertions is one whole check again.
 *
 * Everything date-bearing goes through the anchor helpers, for the reason
 * `anchor.ts` gives: an absolute date looks sharp for a month and wrong after.
 *
 * **The awkward rows are the point.** An unpromoted signal, a fact key that is
 * not cleared for client distribution, one template of each client type — none
 * of those would be here if the goal were a dataset that renders nicely. They
 * are here because they are what the assertions are about.
 */

/** Fact keys this adapter can serve. Mirrors the live adapter's registry shape. */
export const CLEARED_FACT_KEYS = ['btc_spot_aud', 'au_cash_rate'] as const;

/**
 * A key that exists but is not cleared for client distribution.
 *
 * Requested, it must come back in `absent` rather than being dropped — absence
 * is a fact, and a pack renders "not available as at this date" rather than
 * closing the gap silently.
 */
export const UNCLEARED_FACT_KEY = 'btc_unrealised_gain';

/** The signal that must never reach a subscriber. Assertion 5 names it. */
export const UNPROMOTED_SIGNAL_ID = 'sig-not-promoted';

export const SERVICE_STATEMENT_VERSION = '0.1';

export function complianceDocuments(anchor: Date): ComplianceDocument[] {
  return [
    {
      id: 'doc-service-statement',
      docType: 'service_statement',
      title: 'Service Statement',
      version: SERVICE_STATEMENT_VERSION,
      body: 'Minute is an information service. It does not provide financial advice of any kind.',
      effectiveFrom: onDate(anchor, -60),
    },
    {
      id: 'doc-information-notice',
      docType: 'information_notice',
      title: 'Information-only notice',
      version: '1.0',
      body: 'The information in Minute is factual. It does not take your circumstances into account.',
      effectiveFrom: onDate(anchor, -60),
    },
  ];
}

export function companyIdentity(): CompanyIdentity {
  // Correct in shape, deliberately failing check digits — the same rule the
  // corporate-holdings fixtures follow, so a screenshot can never be mistaken
  // for a real registration.
  return {
    legalName: 'Bitcoin Treasury Solutions Pty Ltd',
    tradingName: 'Bitcoin Treasury Solutions',
    abn: '11 222 333 444',
    acn: '222 333 444',
  };
}

export function companyProfile(): CompanyProfile {
  return {
    ...Object.fromEntries(
      Object.entries(companyIdentity()).map(([key, value]) => [
        key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`),
        value,
      ]),
    ),
    registered_address: '1 Sample Street, Melbourne',
    registered_state: 'VIC',
    registered_postcode: '3000',
    public_phone: '+61 3 0000 0000',
    public_email: 'hello@example.invalid',
    public_website: 'https://example.invalid',
    complaints_contact: 'The Directors',
    complaints_email: 'complaints@example.invalid',
    complaints_phone: '+61 3 0000 0001',
  };
}

export function briefs(anchor: Date): Brief[] {
  return [
    {
      id: 'brief-latest',
      publishedAt: at(anchor, -1),
      narration:
        'Two custody providers updated their attestation pages this week. Neither changed a control.',
      findings: [
        {
          id: 'finding-1',
          findingType: 'staleness',
          headline: 'An attestation did not arrive on its usual cadence',
          detail:
            'The provider has published within seven days of quarter end for eight quarters. This quarter it has not.',
          asAt: onDate(anchor, -1),
          provenance: [
            {
              sourceName: 'Provider attestation page',
              sourceUrl: 'https://example.invalid/attestations',
              asAt: onDate(anchor, -1),
              basis: 'observed',
            },
          ],
        },
      ],
      isQuietDay: false,
    },
    {
      // A published report that says nothing happened. Not an empty list, and
      // not a null — the third state the contract insists on.
      id: 'brief-quiet',
      publishedAt: at(anchor, -2),
      narration: 'Nothing cleared the materiality floor.',
      findings: [],
      isQuietDay: true,
    },
  ];
}

/**
 * Signals, promoted and not.
 *
 * `promoted` is not on the read model — a subscriber never learns that an
 * unpromoted signal exists — so it is carried here and stripped by the
 * repository. That is what lets assertion 5 test a filter rather than a fixture
 * that was authored pre-filtered.
 */
export function signalRows(anchor: Date): Array<Signal & { promoted: boolean }> {
  return [
    {
      id: 'sig-promoted',
      entityName: 'A custody provider',
      entityId: 'entity-1',
      changeType: 'attestation_published',
      previousState: 'Published 2026-06-30',
      currentState: 'Published 2026-09-30',
      observedAt: at(anchor, -3),
      complianceClass: 'neutral',
      clientNote: 'The quarterly attestation is available.',
      provenance: {
        sourceName: 'Provider attestation page',
        sourceUrl: 'https://example.invalid/attestations',
        asAt: onDate(anchor, -3),
        basis: 'observed',
      },
      isAbsenceSignal: false,
      promoted: true,
    },
    {
      id: 'sig-absence',
      entityName: 'Another custody provider',
      entityId: 'entity-2',
      changeType: 'attestation_missing',
      previousState: 'Published within 7 days of quarter end',
      currentState: 'Not published, 21 days after quarter end',
      observedAt: at(anchor, -4),
      complianceClass: 'neutral',
      clientNote: 'The attestation has not appeared on its usual cadence.',
      provenance: {
        sourceName: 'Provider attestation page',
        sourceUrl: 'https://example.invalid/attestations-2',
        asAt: onDate(anchor, -4),
        basis: 'observed',
      },
      // Frequently the most useful item on the page.
      isAbsenceSignal: true,
      promoted: true,
    },
    {
      id: UNPROMOTED_SIGNAL_ID,
      entityName: 'A third provider',
      entityId: 'entity-3',
      changeType: 'pricing_changed',
      previousState: '0.5%',
      currentState: '0.4%',
      observedAt: at(anchor, -5),
      complianceClass: 'advice_adjacent',
      clientNote: null,
      provenance: {
        sourceName: 'Provider pricing page',
        asAt: onDate(anchor, -5),
        basis: 'observed',
      },
      isAbsenceSignal: false,
      promoted: false,
    },
  ];
}

export function indicatorSeries(anchor: Date): IndicatorSeries[] {
  return [
    {
      key: 'btc_spot_aud',
      label: 'Bitcoin spot price (AUD)',
      unit: 'AUD',
      sourceName: 'Coin Metrics',
      sourceUrl: 'https://example.invalid/coinmetrics',
      expectedCadenceDays: 1,
      lastObservedAt: onDate(anchor, -1),
      points: [
        { at: onDate(anchor, -2), value: '167120' },
        { at: onDate(anchor, -1), value: '168342' },
      ],
    },
    {
      key: 'au_cash_rate',
      label: 'RBA cash rate target',
      unit: '%',
      sourceName: 'Reserve Bank of Australia',
      expectedCadenceDays: 35,
      lastObservedAt: onDate(anchor, -20),
      points: [{ at: onDate(anchor, -20), value: '3.60' }],
    },
  ];
}

export function registerEntries(anchor: Date): ClientRegisterEntry[] {
  return [
    {
      slug: 'sample-holdings-ltd',
      entityName: 'Sample Holdings Ltd',
      jurisdiction: 'AU',
      // Display only, and an entity may have none.
      tickers: ['SHL'],
      tier: 'listed',
      position: [
        // Implementation facts only. No current value, no unrealised gain, no
        // share price since announcement — see ClientRegisterEntry's doc
        // comment for why the register stops where it does.
        { label: 'Accounting treatment', value: 'AASB 138, cost less impairment', asAt: onDate(anchor, -40) },
        { label: 'Custody model', value: 'Third-party qualified custodian', asAt: onDate(anchor, -40) },
      ],
      ledger: [
        {
          eventDate: onDate(anchor, -120),
          description: 'Board approved a treasury policy amendment permitting the asset.',
          provenance: {
            sourceName: 'ASX announcement',
            sourceUrl: 'https://example.invalid/announcement',
            asAt: onDate(anchor, -120),
            basis: 'reported',
          },
        },
      ],
      statedAbsences: [
        {
          label: 'Custody provider name',
          reason: 'Not disclosed in any filing.',
        },
      ],
      provenance: [
        {
          sourceName: 'Annual report',
          sourceUrl: 'https://example.invalid/annual-report',
          asAt: onDate(anchor, -40),
          basis: 'reported',
        },
      ],
    },
  ];
}

export function directoryEntries(anchor: Date): DirectoryEntry[] {
  return [
    {
      id: 'dir-custodian',
      name: 'A custody provider',
      category: 'treasury_management',
      australianOwned: true,
      // The card renders with no anchor at all. Assertion 6 lives in the
      // component test, and this is the row it needs.
      isFinancialProduct: true,
      regulatoryStatus: {
        status: 'Registered, transition arrangements apply',
        asAt: onDate(anchor, -10),
        sourceName: 'ASIC register',
        sourceUrl: 'https://example.invalid/asic',
      },
      disclosure: null,
    },
    {
      id: 'dir-hardware',
      name: 'A hardware wallet maker',
      category: 'wallet_hardware',
      australianOwned: false,
      isFinancialProduct: false,
      regulatoryStatus: null,
      disclosure: 'BTS refers subscribers to this provider. No fee is paid either way.',
    },
  ];
}

export function commercialDisclosures(anchor: Date): CommercialDisclosure[] {
  return [
    {
      entityName: 'A hardware wallet maker',
      relationshipType: 'reciprocal_referral',
      direction: 'mutual',
      // Widened only with legal advice behind it. `no_fees_mvp` enforces it in
      // the database; the type enforces it here.
      feeBasis: 'none',
      disclosureText: 'BTS refers subscribers to this provider. No fee is paid either way.',
      startedAt: onDate(anchor, -200),
    },
  ];
}

export const INCLUSION_CRITERIA = [
  'Listed because BTS has assessed the provider, not because it asked to be.',
  'No provider pays to appear, and none can.',
  'A provider that is a financial product carries no call to action.',
];

export function librarySections(anchor: Date): Array<LibrarySection & { clientType: string }> {
  return [
    {
      key: 'custody',
      title: 'Custody',
      clientType: 'both',
      entries: [
        {
          slug: 'what-custody-means',
          title: 'What custody means here',
          body: 'Who can move the asset, and what has to happen first.',
          regulatoryReferences: [],
          lastReviewedAt: at(anchor, -30),
          reviewDueDate: onDate(anchor, 335),
        },
      ],
    },
    {
      key: 'smsf-obligations',
      title: 'Fund obligations',
      clientType: 'smsf',
      entries: [
        {
          slug: 'separation-of-assets',
          title: 'Separation of assets',
          body: 'Assets are held in the fund’s name and separated from personal assets.',
          regulatoryReferences: ['SIS Reg 4.09'],
          lastReviewedAt: at(anchor, -30),
          reviewDueDate: onDate(anchor, 335),
        },
      ],
    },
  ];
}

/**
 * Template bodies, stored as the source a migration would carry.
 *
 * Stored as bodies rather than as parsed sections so this adapter runs the same
 * `parseTemplate` the live one does. A fixture holding pre-parsed sections
 * would pass the contract while proving nothing about the parser, which is
 * exactly the shape of test that stops catching things.
 */
export const TEMPLATE_ROWS = [
  {
    id: 'tpl-board-paper',
    slug: 'board-paper-treasury',
    clientType: 'corporate' as const,
    body: `---
slug: board-paper-treasury
version: 1.0
artefact_type: board_paper
client_type: corporate
title: Board paper — bitcoin as a treasury asset
facts_required:
  - btc_spot_aud
---

::section id=purpose
prompt: What decision, if any, is being sought from the board?
why: A paper that does not name the decision invites the board to infer one.
facts: []
::

::section id=market-context
prompt: What context does the board need about current conditions?
why: Boards read a single price as a recommendation.
facts: [btc_spot_aud]
::

::section id=precedent
prompt: How have other Australian entities implemented this?
why: The register answers how, never how it went for them.
facts: []
accepts_citations: true
::
`,
  },
  {
    // `both` is a real value of the column and a template nobody sees is a
    // template nobody tests. Its presence is what makes assertion 7 say
    // something: a corporate session gets this one and the board paper, and
    // still no trustee minute.
    id: 'tpl-valuation-pack',
    slug: 'valuation-pack',
    clientType: 'both' as const,
    body: `---
slug: valuation-pack
version: 1.0
artefact_type: valuation_pack
client_type: both
title: Valuation pack — evidence at a balance date
facts_required:
  - btc_spot_aud
---

::section id=valuation
prompt: What is the market value at the balance date, from what source?
why: An auditor asks for the source and the method, not only the number.
facts: [btc_spot_aud]
::
`,
  },
  {
    id: 'tpl-trustee-minute',
    slug: 'trustee-minute',
    clientType: 'smsf' as const,
    body: `---
slug: trustee-minute
version: 1.0
artefact_type: trustee_minute
client_type: smsf
title: Trustee minute — considering bitcoin as a fund investment
facts_required: []
---

::section id=matter
prompt: What matter was considered at this meeting?
why: The minute is the contemporaneous record of consideration.
facts: []
::
`,
  },
];

export function subscription(anchor: Date, clientType: 'corporate' | 'smsf'): ClientSubscription {
  return {
    displayName: clientType === 'smsf' ? 'The Sample Superannuation Fund' : 'Sample Holdings Ltd',
    clientType,
    status: 'active',
    startedAt: onDate(anchor, -180),
    renewsAt: onDate(anchor, 185),
    seats: [
      {
        fullName: 'A. Subscriber',
        email: 'subscriber@example.invalid',
        role: 'primary',
        status: 'active',
        lastSeenAt: at(anchor, -1),
      },
      {
        fullName: 'B. Colleague',
        email: 'colleague@example.invalid',
        role: 'member',
        status: 'invited',
        lastSeenAt: null,
      },
    ],
  };
}
