// Ecosystem Signals — types for the watch/change layer over the Ecosystem
// registers (products_services, advisors_partners).
// Spec: docs/features/ecosystem/ecosystem-signal-feature.md
//
// The DB constrains the discriminators (watch_type, change_type, severity,
// status, compliance_class) with CHECKs; the config and payload JSONB columns
// are typed here instead, because the eight adapter configs have nothing in
// common structurally and a JSONB CHECK would rot with every new adapter.

// ── Watches ────────────────────────────────────────────────────────────────

// Selects the adapter that runs for this watch.
export const EcosystemWatchType = {
  REGULATORY_REGISTER: 'regulatory_register',
  GITHUB_RELEASE:      'github_release',
  GITHUB_ADVISORY:     'github_advisory',
  RSS:                 'rss',
  NEWSLETTER:          'newsletter',
  STATUS_PAGE:         'status_page',
  ATTESTATION:         'attestation',
  POLICY_DIFF:         'policy_diff',
} as const;
export type EcosystemWatchType = (typeof EcosystemWatchType)[keyof typeof EcosystemWatchType];

// How often the scan considers this watch due. 'realtime' is event/email-driven
// (the newsletter watch rides the existing Fastmail spine) and is NEVER polled.
export const EcosystemCheckFrequency = {
  REALTIME: 'realtime',
  HOURLY:   'hourly',
  DAILY:    'daily',
  WEEKLY:   'weekly',
} as const;
export type EcosystemCheckFrequency =
  (typeof EcosystemCheckFrequency)[keyof typeof EcosystemCheckFrequency];

export const EcosystemWatchHealth = {
  HEALTHY:  'healthy',
  DEGRADED: 'degraded',
  FAILING:  'failing',
} as const;
export type EcosystemWatchHealth = (typeof EcosystemWatchHealth)[keyof typeof EcosystemWatchHealth];

// ── Adapter configs (the `config` JSONB, by watch_type) ────────────────────

export interface GithubReleaseConfig {
  owner: string;
  repo: string;
  include_prereleases?: boolean;
  track?: 'releases' | 'tags';
}

export interface GithubAdvisoryConfig {
  owner: string;
  repo: string;
}

export interface RssConfig {
  feed_url: string;
  // Optional case-insensitive substring an item title must contain to count.
  match?: string | null;
  // Terms that elevate a plain `mention` to a `corporate_event`.
  event_terms?: string[];
}

// Named ...WatchConfig, not ...Config: `NewsletterConfig` is already taken by
// the newsletter *routine* in routines.ts, and both are re-exported from the
// same barrel.
export interface NewsletterWatchConfig {
  // The plus-address local part the vendor newsletter is subscribed at.
  recipient_local_part: string;
  subdomain: string;
  event_terms?: string[];
}

export interface StatusPageConfig {
  provider: 'statuspage' | 'instatus' | 'rss';
  base_url: string;
  // JSON incidents endpoint where the provider offers one; falls back to the
  // provider's RSS feed when it does not.
  api?: string;
}

export interface AttestationConfig {
  attestation_url: string;
  // Emits a `staleness` change once this many days have elapsed since the last
  // attestation — a change detected by ABSENCE, so it needs a clock, not a diff.
  expected_cadence_days: number;
  date_selector?: string;
}

export interface PolicyDiffConfig {
  page_url: string;
  content_selector?: string;
  // Below this normalised change ratio the diff is treated as noise (a footer
  // year, a cookie banner) and nothing is emitted.
  min_change_ratio?: number;
  // 'pricing' makes the same detection emit a `pricing_change` rather than a
  // `policy_change` — one adapter, two change types.
  content_kind?: 'terms' | 'privacy' | 'custody_agreement' | 'pricing' | 'other';
}

// Australian regulatory registers. Matching is by EXACT identifier, never a
// name search: registered names, trading names and subsidiary names diverge
// constantly, and a false "de-listed" is a quiet defamation of a counterparty.
export type RegulatoryRegister = 'austrac_dce' | 'asic_afsl' | 'asic_company';

export interface RegulatoryRegisterConfig {
  register: RegulatoryRegister;
  // AUSTRAC enrolment/registration number, or ASIC ACN/AFSL/AR number.
  identifier: string;
  expected_status?: string;
}

export type EcosystemWatchConfig =
  | GithubReleaseConfig
  | GithubAdvisoryConfig
  | RssConfig
  | NewsletterWatchConfig
  | StatusPageConfig
  | AttestationConfig
  | PolicyDiffConfig
  | RegulatoryRegisterConfig;

// Maps each watch_type to its config shape, so an adapter can narrow without a
// discriminant field inside the JSONB itself.
export interface EcosystemWatchConfigByType {
  regulatory_register: RegulatoryRegisterConfig;
  github_release:      GithubReleaseConfig;
  github_advisory:     GithubAdvisoryConfig;
  rss:                 RssConfig;
  newsletter:          NewsletterWatchConfig;
  status_page:         StatusPageConfig;
  attestation:         AttestationConfig;
  policy_diff:         PolicyDiffConfig;
}

// ── Changes ────────────────────────────────────────────────────────────────

// A neutral category. A `release` is an event, not good news — nothing here
// carries valence, and the UI never colours a change_type as positive.
export const EcosystemChangeType = {
  RELEASE:           'release',
  ADVISORY:          'advisory',
  STALENESS:         'staleness',
  DISCONTINUITY:     'discontinuity',
  POLICY_CHANGE:     'policy_change',
  PRICING_CHANGE:    'pricing_change',
  REGULATORY_CHANGE: 'regulatory_change',
  CORPORATE_EVENT:   'corporate_event',
  INCIDENT:          'incident',
  MENTION:           'mention',
  OTHER:             'other',
} as const;
export type EcosystemChangeType = (typeof EcosystemChangeType)[keyof typeof EcosystemChangeType];

export const EcosystemSeverity = {
  INFO:     'info',
  LOW:      'low',
  MEDIUM:   'medium',
  HIGH:     'high',
  CRITICAL: 'critical',
} as const;
export type EcosystemSeverity = (typeof EcosystemSeverity)[keyof typeof EcosystemSeverity];

// Director curation state.
export const EcosystemChangeStatus = {
  NEW:          'new',
  ACKNOWLEDGED: 'acknowledged',
  ACTIONED:     'actioned',
  DISMISSED:    'dismissed',
  ARCHIVED:     'archived',
} as const;
export type EcosystemChangeStatus =
  (typeof EcosystemChangeStatus)[keyof typeof EcosystemChangeStatus];

// Lex's classification, attached at ingest so the client-promotion gate has its
// answer before anyone asks for it. Distinct from `ComplianceClass` in
// findings.ts, which is a different two-member scale for market-report findings.
export const EcosystemComplianceClass = {
  NEUTRAL:            'neutral',
  VALUATION_ADJACENT: 'valuation_adjacent',
  ADVICE_ADJACENT:    'advice_adjacent',
  SOLVENCY_ADJACENT:  'solvency_adjacent',
} as const;
export type EcosystemComplianceClass =
  (typeof EcosystemComplianceClass)[keyof typeof EcosystemComplianceClass];

// ── Payloads (the `payload` JSONB, by change_type) ─────────────────────────
//
// The payload is the deterministic finding AND the narration contract's only
// source: the narrator may reference nothing outside it.

export interface ReleasePayload {
  old_version: string | null;
  new_version: string;
  tag?: string;
  published_at?: string;
  url?: string;
}

export interface AdvisoryPayload {
  ghsa_id: string;
  cve_id?: string | null;
  severity: string;
  affected_range?: string;
  published_at?: string;
  url?: string;
}

// Detected by absence: nothing arrived when the cadence said it should have.
export interface StalenessPayload {
  metric: string;
  last_event_at: string | null;
  days_since: number;
  expected_cadence_days: number;
  days_overdue: number;
}

export interface DiscontinuityPayload {
  signal: string;
  detected_phrase?: string;
  effective_date?: string;
  url?: string;
}

export interface PolicyChangePayload {
  page: string;
  content_kind?: string;
  old_hash: string;
  new_hash: string;
  change_ratio: number;
  captured_at: string;
  url?: string;
}

export interface IncidentPayload {
  incident_id: string;
  impact?: string;
  status?: string;
  started_at?: string;
  url?: string;
}

export interface RegulatoryChangePayload {
  register: RegulatoryRegister;
  identifier: string;
  old_status: string | null;
  new_status: string;
  observed_at: string;
  url?: string;
}

export interface CorporateEventPayload {
  event_kind: string;
  headline_terms: string[];
  source: string;
  published_at?: string;
  url?: string;
}

export interface MentionPayload {
  headline: string;
  source: string;
  published_at?: string;
  url?: string;
}

export type EcosystemChangePayload =
  | ReleasePayload
  | AdvisoryPayload
  | StalenessPayload
  | DiscontinuityPayload
  | PolicyChangePayload
  | IncidentPayload
  | RegulatoryChangePayload
  | CorporateEventPayload
  | MentionPayload;

// ── Display labels ─────────────────────────────────────────────────────────

export const ECOSYSTEM_WATCH_TYPE_LABELS: Record<EcosystemWatchType, string> = {
  regulatory_register: 'Regulatory register',
  github_release:      'GitHub releases',
  github_advisory:     'GitHub advisories',
  rss:                 'RSS feed',
  newsletter:          'Email newsletter',
  status_page:         'Status page',
  attestation:         'Attestation freshness',
  policy_diff:         'Page diff',
};

export const ECOSYSTEM_CHANGE_TYPE_LABELS: Record<EcosystemChangeType, string> = {
  release:           'Release',
  advisory:          'Advisory',
  staleness:         'Staleness',
  discontinuity:     'Discontinuity',
  policy_change:     'Policy change',
  pricing_change:    'Pricing change',
  regulatory_change: 'Regulatory change',
  corporate_event:   'Corporate event',
  incident:          'Incident',
  mention:           'Mention',
  other:             'Other',
};

export const ECOSYSTEM_CHECK_FREQUENCY_LABELS: Record<EcosystemCheckFrequency, string> = {
  realtime: 'Realtime (event-driven)',
  hourly:   'Hourly',
  daily:    'Daily',
  weekly:   'Weekly',
};

export const ECOSYSTEM_COMPLIANCE_CLASS_LABELS: Record<EcosystemComplianceClass, string> = {
  neutral:            'Neutral',
  valuation_adjacent: 'Valuation adjacent',
  advice_adjacent:    'Advice adjacent',
  solvency_adjacent:  'Solvency adjacent',
};

// A change is promotable to a client-facing surface only when Lex has
// explicitly classified it neutral. NULL (classification failed, or has not run
// yet) is treated exactly as restrictively as a non-neutral class — a failed
// compliance call must never become an accidental promotion.
export function isClientPromotable(complianceClass: string | null | undefined): boolean {
  return complianceClass === EcosystemComplianceClass.NEUTRAL;
}
