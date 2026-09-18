/**
 * The client app's repository contracts — Minute, `apps/client`.
 *
 * Every interface here is read-only by construction. There is no method
 * anywhere in this file that writes subscriber content, and that is the
 * enforcement mechanism for the not-advice boundary rather than a convention
 * anyone has to remember.
 *
 * Two exceptions exist in the whole app, both narrow, both at the bottom of
 * this file: acknowledging a disclosure, and recording that a document pack was
 * generated. Neither accepts free text.
 *
 * Conformance suite: `../testing/client.ts`. Every implementation must pass it.
 *
 * Reads take `ReadContext` first, writes do not — the house convention, and the
 * reason no method here takes a principal: scoping is a constructor argument or
 * it does not exist. See `docs/features/demo-app/repository-contract.md`.
 */
import type { ReadContext } from '../context';

// ============================================================
// Shared types
// ============================================================

export type ClientType = 'corporate' | 'smsf';

/**
 * There is deliberately no `ClientClassification`.
 *
 * Retail and wholesale are distinctions inside a regime this service is not in:
 * BTS does not give financial advice and holds no AFS authorisation. A type
 * recording the distinction would imply the app had a reason to care, and the
 * next question after that is which behaviour changes — to which the answer
 * must always be none.
 */

export type ComplianceClass =
  | 'neutral'
  | 'valuation_adjacent'
  | 'advice_adjacent'
  | 'solvency_adjacent';

/** How a fact came to be known. Mirrors the register's own vocabulary. */
export type FactBasis = 'reported' | 'observed' | 'derived';

/**
 * A single fact served to a client surface.
 *
 * `value` is a PRE-FORMATTED STRING and never a number. A number in the browser
 * invites arithmetic; arithmetic on facts is derivation; derivation is a basis
 * claim. The platform rule is no basis, no comparison, and the type system is
 * the cheapest place to enforce it. Anything genuinely derived arrives with
 * `basis: 'derived'`, computed server-side by a view where it can be reviewed.
 */
export interface Fact {
  key: string;
  label: string;
  value: string;
  unit?: string;
  /** ISO 8601. */
  asAt: string;
  sourceName: string;
  sourceUrl?: string;
  basis: FactBasis;
  complianceClass: ComplianceClass;
  /** Expected update cadence in days. Drives the freshness indicator. */
  expectedCadenceDays?: number;
  /** Client-safe note only. Never the internal curator note. */
  note?: string;
}

/**
 * A fact that was requested but is unavailable.
 *
 * Returned rather than omitted, because absence is a fact. The template renders
 * "not available as at this date" instead of silently closing the gap, same as
 * the register and the signals feed.
 */
export interface AbsentFact {
  key: string;
  label: string;
  reason: 'not_cleared' | 'no_data' | 'source_unavailable';
  asAt: string;
}

export interface ClientProvenance {
  sourceName: string;
  sourceUrl?: string;
  asAt: string;
  basis: FactBasis;
}

// ============================================================
// Session
// ============================================================

export interface ClientSession {
  userId: string;
  accountId: string;
  clientType: ClientType;
  displayName: string;
  /** False blocks every route except the Service Statement gate. */
  disclosureCurrent: boolean;
}

export interface ClientSessionRepository {
  current(ctx: ReadContext): Promise<ClientSession | null>;
}

// ============================================================
// The Brief
// ============================================================

export type FindingType =
  | 'anomaly'
  | 'divergence'
  | 'inflection'
  | 'streak'
  | 'threshold'
  | 'staleness';

/**
 * One measured quantity behind a finding.
 *
 * `value` is a pre-formatted string for the same reason `Fact.value` is: a
 * number in the browser invites arithmetic, arithmetic on a served figure is a
 * derivation, and a derivation nobody reviewed is a basis claim. Every figure
 * here was computed server-side by the findings engine and is read back, never
 * recomputed on the way out.
 */
export interface FindingEvidence {
  label: string;
  value: string;
}

export interface Finding {
  id: string;
  findingType: FindingType;
  headline: string;
  detail: string;
  /**
   * The numbers the finding rests on — what was observed, and the trailing
   * distribution it was judged against.
   *
   * On the read model rather than folded into `detail`, because a subscriber
   * paying to be told what changed is owed the measurement and not only the
   * sentence about it. A finding that arrives with an empty array is one whose
   * stored shape carried no figures, and the page says so rather than
   * rendering a card that looks complete.
   */
  evidence: FindingEvidence[];
  asAt: string;
  provenance: ClientProvenance[];
}

export interface Brief {
  id: string;
  publishedAt: string;
  narration: string;
  findings: Finding[];
  /**
   * True when nothing cleared the materiality floor.
   *
   * This is a first-class state, not an empty list to be styled later. If the
   * system has nothing to say it says so, rather than manufacturing insight to
   * fill the page. Backed by `market_reports.report_mode = 'quiet'`, which is a
   * column rather than an inference — a quiet day is a published report that
   * says nothing happened.
   */
  isQuietDay: boolean;
}

export interface ClientBriefRepository {
  /**
   * `null` means no brief has ever published. `isQuietDay` means one published
   * and said nothing happened. Different states, and the caller handles both.
   */
  latest(ctx: ReadContext): Promise<Brief | null>;
  recent(ctx: ReadContext, days: number): Promise<Brief[]>;
}

// ============================================================
// Signals
// ============================================================

export interface Signal {
  id: string;
  entityName: string;
  entityId: string | null;
  changeType: string;
  previousState: string | null;
  currentState: string;
  observedAt: string;
  complianceClass: ComplianceClass;
  /** Authored separately from the internal curator note, never derived from it. */
  clientNote: string | null;
  provenance: ClientProvenance;
  /**
   * True when the signal is the absence of an expected event — an attestation
   * that did not arrive, a registration not renewed. Frequently the most useful
   * item on the page.
   */
  isAbsenceSignal: boolean;
}

export interface SignalQuery {
  since?: string;
  categories?: string[];
  limit?: number;
}

export interface ClientSignalRepository {
  /**
   * Returns only promoted signals. The gate is a `WHERE` clause in the database
   * and an RLS policy behind it, not a filter in a component.
   */
  list(ctx: ReadContext, query?: SignalQuery): Promise<Signal[]>;
  byEntity(ctx: ReadContext, entityId: string): Promise<Signal[]>;
}

// ============================================================
// Indicators
// ============================================================

export interface IndicatorPoint {
  at: string;
  /** String, per `Fact`. Same reasoning: a number invites arithmetic. */
  value: string;
}

export interface IndicatorSeries {
  key: string;
  label: string;
  unit?: string;
  sourceName: string;
  sourceUrl?: string;
  expectedCadenceDays: number;
  lastObservedAt: string;
  points: IndicatorPoint[];
}

export interface ClientIndicatorRepository {
  series(ctx: ReadContext, keys: string[], fromDate?: string): Promise<IndicatorSeries[]>;
  available(ctx: ReadContext): Promise<Array<{ key: string; label: string }>>;
}

// ============================================================
// Register
// ============================================================

/**
 * One entry in the register.
 *
 * **Implementation facts, not outcome facts.** The register exists for learning
 * and for building your own treasury case: which accounting standard, which
 * custody model, what board or deed authority, how it was disclosed and when.
 * It never answers how it went for them.
 *
 * In: accounting treatment, custody model, mandate, financing terms, identity,
 * what was done and when. Out: current holding value, unrealised gain, share
 * price since announcement.
 *
 * The moment outcome facts appear the page stops being precedent and starts
 * being performance, which is a different question about a different asset —
 * and performance figures about named listed securities, served to a paying
 * subscriber, is the one shape this product must not take.
 *
 * The rule is enforced by `field_source_minimums.client_fact_class` and the RLS
 * policy that reads it, not by this comment. The comment is here so an
 * implementer adding a field knows which way the decision goes.
 */
export interface ClientRegisterEntry {
  slug: string;
  entityName: string;
  jurisdiction: string;
  /** Ticker is never a key. Display only, and may be an empty array. */
  tickers: string[];
  tier: string;
  position: Array<{ label: string; value: string; asAt: string }>;
  ledger: Array<{ eventDate: string; description: string; provenance: ClientProvenance }>;
  /** Explicitly stated absences. Rendered, not hidden. */
  statedAbsences: Array<{ label: string; reason: string }>;
  provenance: ClientProvenance[];
}

export interface ClientRegisterRepository {
  list(ctx: ReadContext): Promise<ClientRegisterEntry[]>;
  bySlug(ctx: ReadContext, slug: string): Promise<ClientRegisterEntry | null>;
}

// ============================================================
// Directory
// ============================================================

export interface DirectoryEntry {
  id: string;
  name: string;
  category: string;
  australianOwned: boolean;
  /**
   * DAP or TCP under s764A(1) as amended April 2026.
   *
   * When true the card renders with no outbound link and no contact action. The
   * absence of a call to action is the structural difference between reporting
   * on a provider and distributing one.
   */
  isFinancialProduct: boolean;
  regulatoryStatus: {
    status: string;
    asAt: string;
    sourceName: string;
    sourceUrl?: string;
  } | null;
  /**
   * `null` means BTS has no relationship with the entity. Rendered
   * affirmatively, not as blank space — both are statements.
   */
  disclosure: string | null;
}

export interface CommercialDisclosure {
  entityName: string;
  relationshipType: string;
  direction: string;
  /** Widen only with legal advice behind it. `no_fees_mvp` enforces it in the DB. */
  feeBasis: 'none';
  disclosureText: string;
  startedAt: string | null;
}

export interface ClientDirectoryRepository {
  list(ctx: ReadContext): Promise<DirectoryEntry[]>;
  inclusionCriteria(ctx: ReadContext): Promise<string[]>;
  /** Powers `/directory/how-we-make-money`. Generated, never hand-maintained. */
  disclosures(ctx: ReadContext): Promise<CommercialDisclosure[]>;
}

// ============================================================
// Library
// ============================================================

export interface LibraryEntry {
  slug: string;
  title: string;
  body: string;
  regulatoryReferences: string[];
  lastReviewedAt: string;
  reviewDueDate: string | null;
}

export interface LibrarySection {
  key: string;
  title: string;
  entries: LibraryEntry[];
}

export interface ClientLibraryRepository {
  sections(ctx: ReadContext, clientType: ClientType): Promise<LibrarySection[]>;
  entry(ctx: ReadContext, slug: string): Promise<LibraryEntry | null>;
}

// ============================================================
// Prepare
// ============================================================

export type ArtefactType =
  | 'board_paper'
  | 'audit_committee_note'
  | 'treasury_policy'
  | 'trustee_minute'
  | 'investment_strategy_addendum'
  | 'auditor_evidence'
  | 'valuation_pack';

export interface TemplateSection {
  id: string;
  /** Always a question. Validation rejects anything that is not. */
  prompt: string;
  /** Why a board or auditor asks this. The teaching layer. */
  why: string;
  facts: string[];
  optional: boolean;
  regulatoryReference?: string;
  /**
   * The precedent section: where facts cited from `/register` land.
   *
   * At most one per template, checked by the validator. The register and
   * `/prepare` are the same feature at two stages — gathering evidence and
   * assembling it — and this is the join between them.
   */
  acceptsCitations: boolean;
}

export interface PrepareTemplate {
  id: string;
  slug: string;
  version: string;
  title: string;
  artefactType: ArtefactType;
  clientType: ClientType | 'both';
  regulatoryReferences: string[];
  sections: TemplateSection[];
  factsRequired: string[];
}

export interface ResolvedFacts {
  facts: Fact[];
  absent: AbsentFact[];
  resolvedAt: string;
}

export interface ClientPrepareRepository {
  templates(ctx: ReadContext, clientType: ClientType): Promise<PrepareTemplate[]>;
  template(ctx: ReadContext, slug: string): Promise<PrepareTemplate | null>;
  /** Cleared facts only. Requested-but-uncleared keys come back in `absent`. */
  resolveFacts(ctx: ReadContext, keys: string[]): Promise<ResolvedFacts>;
}

// ============================================================
// Identity, for the export front matter
// ============================================================

/**
 * Read from `company_profile`, which is a singleton.
 *
 * A `/prepare` export may be read by an auditor, so the front matter carries
 * the legal name and ABN rather than the trading name — see
 * `.claude/skills/bts-design/references/naming.md` on the three registers.
 *
 * No AR number and no licensee. BTS holds no AFS authorisation, so a field for
 * one could only ever be empty, and an empty licence line on an export invites
 * the reader to wonder which kind of empty it is.
 */
export interface CompanyIdentity {
  legalName: string;
  tradingName: string;
  abn: string | null;
  acn: string | null;
}

/**
 * A statement of position, served verbatim.
 *
 * `service_statement` is the blocking gate's document: what the service is and
 * is not. Deliberately not an FSG — none is required, and publishing one would
 * wrongly imply an authorisation BTS does not hold.
 *
 * `information_notice` is the standing notice in the app shell and in every
 * `/prepare` export. Not a "general advice warning": that phrase implies
 * licensed general advice, which is a different thing from factual information.
 */
export interface ComplianceDocument {
  id: string;
  docType: 'service_statement' | 'information_notice' | 'privacy_policy' | 'terms';
  title: string;
  version: string;
  body: string;
  effectiveFrom: string | null;
}

/**
 * The whole profile, for resolving a compliance document's variables.
 *
 * Distinct from `CompanyIdentity`, which is the four fields a `/prepare` export
 * puts in its front matter. The Service Statement needs registered address,
 * public contact details and complaints contact as well — and putting those in
 * `CompanyIdentity` would push nine fields into every export's front matter to
 * serve one document.
 */
export type CompanyProfile = Record<string, string | null>;

export interface ClientComplianceRepository {
  identity(ctx: ReadContext): Promise<CompanyIdentity | null>;
  /** For document variable resolution. Null when the profile is unset. */
  profile(ctx: ReadContext): Promise<CompanyProfile | null>;
  /** The active document of a type, or null when none has been drafted. */
  activeDocument(
    ctx: ReadContext,
    docType: ComplianceDocument['docType'],
  ): Promise<ComplianceDocument | null>;
  /** What the subscriber has acknowledged, newest first. Powers `/account`. */
  acknowledgements(
    ctx: ReadContext,
  ): Promise<Array<{ documentVersion: string; acknowledgedAt: string }>>;
}

// ============================================================
// Seats, for /account
// ============================================================

export interface ClientSeat {
  fullName: string;
  email: string;
  role: 'primary' | 'member';
  status: 'invited' | 'active' | 'disabled';
  lastSeenAt: string | null;
}

export interface ClientSubscription {
  displayName: string;
  clientType: ClientType;
  status: 'invited' | 'active' | 'paused' | 'lapsed' | 'cancelled';
  startedAt: string | null;
  renewsAt: string | null;
  seats: ClientSeat[];
}

export interface ClientAccountRepository {
  subscription(ctx: ReadContext): Promise<ClientSubscription | null>;
}

// ============================================================
// The only two writes in the application
// ============================================================

/**
 * Both are deliberately narrow, and neither accepts free text.
 *
 * If a third write appears here, that is the moment to ask whether the
 * not-advice boundary is still enforced by architecture or has quietly become a
 * thing people remember.
 */
export interface ClientWriteRepository {
  acknowledgeDisclosure(input: {
    documentId: string;
    documentVersion: string;
    ipAddress?: string;
  }): Promise<void>;

  recordGeneration(input: {
    templateId: string;
    templateVersion: string;
    artefactType: ArtefactType;
    factSnapshot: Fact[];
    event: 'created' | 'facts_refreshed' | 'exported';
  }): Promise<void>;
}

// ============================================================
// Composite
// ============================================================

/**
 * What `apps/client` holds instead of a database client.
 *
 * Not a `Bundle<K>` slice of `RepositoryDomains`: the client domains are
 * different read models over the same spine, not the same interfaces scoped
 * differently. `ClientRegisterEntry` and the internal `RegisterEntry` share a
 * name and almost nothing else — one carries `withheld` and basis chips for a
 * director, the other carries only what cleared Lex. Collapsing them would put
 * a `mode` branch inside the register component, which is exactly the failure
 * `RepositoryMode`'s comment warns about.
 */
export interface ClientDataContext {
  session: ClientSessionRepository;
  brief: ClientBriefRepository;
  signals: ClientSignalRepository;
  indicators: ClientIndicatorRepository;
  register: ClientRegisterRepository;
  directory: ClientDirectoryRepository;
  library: ClientLibraryRepository;
  prepare: ClientPrepareRepository;
  compliance: ClientComplianceRepository;
  account: ClientAccountRepository;
  writes: ClientWriteRepository;
}

/**
 * The read domains, as data.
 *
 * The conformance suite walks this to assert assertion 1 — that no repository
 * other than `writes` exposes a mutating method — so a new domain is covered by
 * adding it here rather than by remembering to add a test.
 */
export const CLIENT_READ_DOMAINS = [
  'session',
  'brief',
  'signals',
  'indicators',
  'register',
  'directory',
  'library',
  'prepare',
  'compliance',
  'account',
] as const satisfies ReadonlyArray<Exclude<keyof ClientDataContext, 'writes'>>;

export type ClientReadDomain = (typeof CLIENT_READ_DOMAINS)[number];
