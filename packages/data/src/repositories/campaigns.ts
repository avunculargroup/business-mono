import type { ReadContext } from '../context';

/**
 * The web app cannot reach the agents server over HTTP, so a decision is handed
 * off by writing it to `pending_decision` and letting a Supabase Realtime
 * listener claim it. These are the payload shapes of that handoff; the actions
 * validate them with Zod before they get here.
 */
/**
 * Flat rather than a discriminated union, because that is the shape actually
 * written to `pending_decision` and read by the listener. "A `request_change`
 * must carry an instruction" is enforced by the action, not by this type —
 * modelling it here would describe a payload the database never holds.
 */
export interface VariantGateDecision {
  decision: 'approve' | 'request_change';
  instruction?: string;
  approvedBy?: string;
}

export type CampaignGateDecision =
  | { decision: 'approve'; strategy?: Record<string, unknown>; beats?: unknown[] }
  | { decision: 'request_change'; instruction: string };

/** What the strategy lock is decided from. */
export interface CampaignGate {
  status: string;
  /** Null when no run is in flight. */
  workflowRunId: string | null;
  /** Which gate is open — `gate_state.gate`. Null when none is. */
  openGate: string | null;
}

export interface NewCampaignDraft {
  name: string;
  objective: string;
  audienceFilter: Record<string, unknown>;
  audiencePersona: string | null;
}

export interface CampaignCadence {
  accountIds: string[];
  postsPerWeek: number;
  slots: Array<{ day: string; time: string; label?: string }>;
  durationWeeks: number;
  startDate: string;
}

export interface VariantCopy {
  isThread: boolean;
  body: string;
  segments: string[];
}

export interface PostMetrics {
  impressions: number | null;
  reactions: number | null;
  comments: number | null;
  reposts: number | null;
  clicks: number | null;
}

export interface NewVoiceSnippet {
  body: string;
  curatorNote: string;
  snippetType: string;
  topicTags: string[];
}

/** A row of `v_campaign_overview` — progress and timeline per campaign. */
export interface CampaignOverview {
  id: string;
  slug: string;
  name: string;
  objective: string | null;
  status: string;
  startDate: string | null;
  durationWeeks: number | null;
  endDate: string | null;
  daysRemaining: number | null;
  totalVariants: number;
  publishedCount: number;
  approvedCount: number;
  pendingCount: number;
  flaggedCount: number;
}

/** An account the wizard can attach a campaign to. */
export interface CampaignAccount {
  id: string;
  platform: string;
  accountType: string | null;
  displayName: string | null;
}

export interface CampaignBeat {
  id: string;
  sequence: number;
  title: string | null;
  coreMessage: string;
  rationale: string | null;
  preferThread: boolean;
}

/** A row of `v_campaign_matrix` — one variant per beat per account. */
export interface CampaignMatrixRow {
  id: string;
  slug: string;
  beatId: string | null;
  beatSequence: number | null;
  beatTitle: string | null;
  accountId: string;
  accountName: string | null;
  platform: 'linkedin' | 'twitter_x';
  isThread: boolean;
  status: string;
  scheduledFor: string | null;
  complianceStatus: string | null;
  needsDisclaimer: boolean;
}

export interface PublishedPostMetrics {
  impressions: number | null;
  reactions: number | null;
  comments: number | null;
  reposts: number | null;
  clicks: number | null;
}

export interface PublishedPost {
  id: string;
  title: string | null;
  body: string | null;
  type: 'linkedin' | 'twitter_x';
  isThread: boolean;
  publishedUrl: string | null;
  accountName: string | null;
  metrics: PublishedPostMetrics | null;
}

/**
 * The strategy workflow's stored payloads.
 *
 * snake_case on purpose, and for the same reason `VariantGateDecision` is flat:
 * these are the shapes the workflow writes into `campaigns.strategy`,
 * `schedule_plan` and `gate_state`, and the read model describes what is
 * stored. Camel-casing them here would describe a payload no writer produces
 * and no listener reads.
 */
export interface CampaignStrategy {
  content_pillars: string[];
  key_messages: string[];
  audience_summary: string;
  tone_guidance: string;
  hooks: string[];
  hashtags: string[];
  do_not_say: string[];
  success_signals: string[];
}

export interface PlannedBeat {
  title: string;
  core_message: string;
  rationale: string;
  prefer_thread: boolean;
}

export interface ScheduleEntry {
  beat_sequence: number;
  beat_title: string | null;
  social_account_id: string;
  slot_label: string | null;
  scheduled_for: string | null;
}

export interface SchedulePlan {
  entries: ScheduleEntry[];
}

export interface Gate1State {
  gate: 'gate1';
  campaignId: string;
  strategy: CampaignStrategy;
}

export interface Gate2State {
  gate: 'gate2';
  campaignId: string;
  beats: PlannedBeat[];
  schedule: SchedulePlan;
}

/**
 * The campaign canvas.
 *
 * `beats`, `matrix` and `published` are empty until the plan is approved —
 * before that the beats live transiently in `gateState` and no variants exist.
 * The page used to work that out and issue three more queries; the adapter does
 * now, so `planLocked` is a fact the page reads rather than a rule it applies.
 */
export interface CampaignDetail {
  id: string;
  slug: string;
  name: string;
  objective: string | null;
  status: string;
  strategy: CampaignStrategy | null;
  schedulePlan: SchedulePlan | null;
  gateState: Gate1State | Gate2State | null;
  pendingDecision: unknown;
  workflowRunId: string | null;
  planLocked: boolean;
  beats: CampaignBeat[];
  matrix: CampaignMatrixRow[];
  published: PublishedPost[];
}

/** A row of `v_ready_to_post`, with its thread segments already attached. */
export interface ReadyToPostItem {
  id: string;
  slug: string;
  title: string | null;
  body: string | null;
  type: 'linkedin' | 'twitter_x';
  isThread: boolean;
  accountName: string | null;
  platform: 'linkedin' | 'twitter_x';
  profileUrl: string | null;
  scheduledFor: string | null;
  disclaimerText: string | null;
  /** Empty for a single post. A view cannot cleanly nest its children. */
  segments: string[];
}

export interface ReadyToPostQueue {
  campaignId: string;
  campaignSlug: string;
  campaignName: string;
  items: ReadyToPostItem[];
}

/** A variant at gate 3, with the campaign it belongs to resolved for the back link. */
export interface VariantReview {
  id: string;
  status: string;
  gateState: unknown;
  /** Null when the variant has no campaign — the link goes to the list instead. */
  campaignSlug: string | null;
}

export interface CampaignRepository {
  /** The campaigns list. */
  listOverview(ctx: ReadContext): Promise<CampaignOverview[]>;

  /** Active accounts the wizard can attach, by display name. */
  listAccounts(ctx: ReadContext): Promise<CampaignAccount[]>;

  /** The canvas, by id or slug. */
  getDetail(ctx: ReadContext, idOrSlug: string): Promise<CampaignDetail | null>;

  /** The ready-to-post queue for one campaign, by id or slug. */
  getReadyToPost(ctx: ReadContext, idOrSlug: string): Promise<ReadyToPostQueue | null>;

  /** One variant's gate-3 review state, by id or slug. */
  getVariantReview(ctx: ReadContext, idOrSlug: string): Promise<VariantReview | null>;

  /** The campaign's status and whether a gate is open on it. */
  getGate(ctx: ReadContext, id: string): Promise<CampaignGate | null>;

  /** Hand a gate decision to the agents server. */
  setCampaignDecision(id: string, decision: CampaignGateDecision): Promise<void>;
  setVariantDecision(contentItemId: string, decision: VariantGateDecision): Promise<void>;

  /** Returns the new campaign's id, which the wizard needs to advance. */
  createDraft(input: NewCampaignDraft): Promise<string>;

  /**
   * Save the cadence, replace the participating accounts, and signal the
   * strategy run to start — in that order, because the listener reacts to the
   * last write and must not see a half-built campaign.
   */
  saveCadenceAndLaunch(id: string, cadence: CampaignCadence): Promise<void>;

  /**
   * Record a variant as posted. Returns false when it was no longer approved,
   * so a double submit cannot clobber a row that has already moved on — the
   * check is part of the write, not a read before it.
   */
  markVariantPosted(contentItemId: string, url: string): Promise<boolean>;

  /**
   * Save edited variant copy.
   *
   * Resets compliance to pending, patches the suspended gate preview so the
   * editor reflects the edit at once, and replaces the thread segments. All
   * one user action, so all one method: splitting it would put the ordering and
   * the half-done state on the caller.
   */
  saveVariantCopy(contentItemId: string, copy: VariantCopy): Promise<boolean>;

  /** Upsert manual post-hoc metrics. One row per content item, updated in place. */
  savePostMetrics(
    contentItemId: string,
    platform: string,
    metrics: PostMetrics,
  ): Promise<void>;

  /**
   * Promote a published post into the voice exemplar library.
   *
   * Note what this does *not* take: who is promoting it. The recording actor is
   * the bundle's principal, bound at construction — the same reason no read
   * method takes a scope. A caller cannot record the snippet against someone
   * else, because it has no way to say who. Same for `savePostMetrics`.
   */
  promoteToVoiceSnippet(contentItemId: string, snippet: NewVoiceSnippet): Promise<void>;
}
