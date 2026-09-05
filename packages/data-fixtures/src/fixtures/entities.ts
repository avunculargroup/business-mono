/**
 * The demo's cast, defined once.
 *
 * Internal consistency across the whole fixture set is a stated requirement —
 * a trace naming different fictional entities than the lists "reads as sloppy
 * and undermines the impression the demo exists to create". Consistency by
 * discipline across ten files does not survive contact with a second author, so
 * every name in the demo comes from here and nowhere else.
 *
 * ## Rules these names are chosen under
 *
 * See [`fixture-and-trace-schema.md` § Fictional entity rules](../../../../docs/features/demo-app/fixture-and-trace-schema.md#fictional-entity-rules).
 *
 * - **Operating businesses, never funds or advisers.** An invented fund manager
 *   is the one category most likely to read as a real one, and the demo has no
 *   reason to show one: the clients of a Bitcoin treasury consultancy are
 *   companies with a balance sheet, not asset managers.
 * - **No real people.** Humans appear as their platform role. The agents
 *   (Simon, Rex, Charlie, Petra, Della, Lex) are the platform's own and are
 *   real components rather than invented people.
 * - **Emails on `example.com` only.** Never a live third-party domain.
 * - **Invented mastheads for research sources.** A headline this file invented,
 *   attributed to a real regulator or publisher, would be a fabricated record
 *   of a real institution — a worse problem than the one the naming rule is
 *   about. So sources are invented publications, and where an item concerns a
 *   regulator it says "a regulator" rather than naming one.
 *
 * ## ⚠️ Unverified: ASIC search
 *
 * The rules require every company name to be checked against an ASIC search
 * before it is committed, and **that check has not been done for the names
 * below.** They were chosen to be implausible as real businesses, which is not
 * the same thing. Search each one and replace any that resolves before this
 * demo is deployed publicly.
 */

/** An invented client company. */
export interface FixtureCompany {
  id: string;
  slug: string;
  name: string;
  industry: string;
  size: string;
  website: string | null;
}

export const COMPANIES = {
  kestrel: {
    id: 'co-kestrel',
    slug: 'kestrel-freight',
    name: 'Kestrel Freight',
    industry: 'Logistics',
    size: 'SME',
    website: 'https://kestrel-freight.example.com',
  },
  marrowbone: {
    id: 'co-marrowbone',
    slug: 'marrowbone-engineering',
    name: 'Marrowbone Engineering',
    industry: 'Manufacturing',
    size: 'Mid-market',
    website: 'https://marrowbone.example.com',
  },
  tolquist: {
    id: 'co-tolquist',
    slug: 'tolquist-partners',
    name: 'Tolquist Partners',
    industry: 'Professional services',
    size: 'SME',
    website: null,
  },
  ardenne: {
    id: 'co-ardenne',
    slug: 'ardenne-pastoral',
    name: 'Ardenne Pastoral',
    industry: 'Agriculture',
    size: 'SME',
    website: 'https://ardenne-pastoral.example.com',
  },
} as const satisfies Record<string, FixtureCompany>;

/** An invented contact. Roles are the ones a treasury conversation actually reaches. */
export const CONTACTS = {
  halloway: {
    id: 'ct-halloway',
    slug: 'wren-halloway',
    firstName: 'Wren',
    lastName: 'Halloway',
    role: 'CFO',
    email: 'w.halloway@example.com',
    companyId: COMPANIES.kestrel.id,
    pipelineStage: 'qualified',
  },
  ferrymead: {
    id: 'ct-ferrymead',
    slug: 'douglas-ferrymead',
    firstName: 'Douglas',
    lastName: 'Ferrymead',
    role: 'Finance Director',
    email: 'd.ferrymead@example.com',
    companyId: COMPANIES.marrowbone.id,
    pipelineStage: 'lead',
  },
  okonkwo: {
    id: 'ct-okonkwo',
    slug: 'adaeze-okonkwo',
    firstName: 'Adaeze',
    lastName: 'Okonkwo',
    role: 'Treasury',
    email: 'a.okonkwo@example.com',
    companyId: COMPANIES.kestrel.id,
    pipelineStage: 'qualified',
  },
} as const;

/**
 * Invented research mastheads.
 *
 * Deliberately not real publications. The feed's job in the demo is to show
 * heterogeneous sources being scored and annotated, and that reads identically
 * whether the masthead is real or invented — while an invented summary under a
 * real masthead is a fabrication attributed to someone who exists.
 */
export const SOURCES = {
  ledger: 'Southern Ledger',
  harbourline: 'Harbourline Wire',
  monetaryReview: 'Antipodean Monetary Review',
  custodyBrief: 'Custody Brief',
} as const;

/**
 * Who a human-facing field names.
 *
 * A director appears by role rather than by name: the two real co-founders are
 * real people, and the fixture rules say no real people even when they are the
 * ones who own the demo.
 */
export const DIRECTOR = 'Director' as const;

/** The projects and providers the ecosystem watches follow. Invented, same rules. */
export const WATCHED = {
  signingProject: { id: 'ps-signing', slug: 'orrery-signer', name: 'Orrery Signer' },
  custodyProvider: { id: 'ps-custody', slug: 'lachlan-vault', name: 'Lachlan Vault' },
} as const;

/**
 * The corporate research register's subjects.
 *
 * Separate from `COMPANIES` because these are not clients — they are the
 * public companies the register reports on, and the demo renders them on a
 * different surface entirely.
 *
 * They also bend one rule above, deliberately. "Operating businesses, never
 * funds or advisers" was written for invented clients, where a fund manager is
 * the entity most likely to read as a real one. The register cannot follow it:
 * the funds-manager shape is what carries the look-through pathology — a
 * company holding units in a vehicle it manages itself — and dropping it would
 * drop the second of the three mechanisms by which a stated bitcoin figure
 * overstates a corporate position. The identifier discipline below is what
 * makes the trade acceptable.
 *
 * ## Identifier discipline
 *
 * Every identifier here is constructed to be incapable of resolving to a real
 * entity, and to fail validation if it ever leaks into production ingest:
 *
 * - **ACN / ABN** — correct length, deliberately failing check digits.
 * - **ISIN** — the reserved `XX` country prefix, which no real security uses.
 * - **Tickers** — four letters. ASX and NZX codes are three.
 * - **Slugs** — prefixed `demo-`.
 * - **Documents** — local static paths, never an external host.
 *
 * ## ⚠️ Unverified: ASIC and companies-register search
 *
 * As with `COMPANIES` above, these names have **not** been searched against a
 * companies register. They were chosen to be implausible, which is not the same
 * thing. Search each one before this demo is publicly deployed.
 */
export interface FixtureResearchEntity {
  id: string;
  slug: string;
  legalName: string;
  /** Four letters. Never three, which is what a real AU or NZ code is. */
  ticker: string;
  acn: string | null;
  abn: string | null;
  isin: string;
}

export const RESEARCH_ENTITIES = {
  meridian: {
    id: 'rc-meridian',
    slug: 'demo-meridian-freight',
    legalName: 'Meridian Freight Group Limited',
    ticker: 'MFGX',
    acn: '000 000 001',
    abn: '00 000 000 001',
    isin: 'XX0000000001',
  },
  // Named Verrall rather than the roster's suggested name, which collided with
  // `COMPANIES.kestrel` — two unrelated fictional entities sharing a name in
  // one demo is the "reads as sloppy" failure this module exists to prevent.
  verrall: {
    id: 'rc-verrall',
    slug: 'demo-verrall-dam',
    legalName: 'Verrall Digital Asset Management Limited',
    ticker: 'VRDM',
    acn: '000 000 002',
    abn: '00 000 000 002',
    isin: 'XX0000000002',
  },
  nyala: {
    id: 'rc-nyala',
    slug: 'demo-nyala-payments',
    legalName: 'Nyala Payments Inc.',
    ticker: 'NYLA',
    acn: null,
    abn: null,
    isin: 'XX0000000003',
  },
  tarra: {
    id: 'rc-tarra',
    slug: 'demo-tarra-holdings',
    legalName: 'Tarra Holdings Limited',
    ticker: 'TARH',
    acn: '000 000 004',
    abn: '00 000 000 004',
    isin: 'XX0000000004',
  },
  // Calder rather than the roster's suggested name, which collided with
  // `WATCHED.signingProject`.
  calder: {
    id: 'rc-calder',
    slug: 'demo-calder-capital',
    legalName: 'Calder Capital Limited',
    ticker: 'CLDR',
    acn: '000 000 005',
    abn: '00 000 000 005',
    isin: 'XX0000000005',
  },
} as const satisfies Record<string, FixtureResearchEntity>;
