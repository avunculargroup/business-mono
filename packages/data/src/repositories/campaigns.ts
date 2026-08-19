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

export interface CampaignRepository {
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
