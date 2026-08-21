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
