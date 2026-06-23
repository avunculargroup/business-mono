import type { PlannedBeat } from './schemas.js';

// Pure row mappers for the Campaign Strategy workflow's persistence. Margot's
// planned beats → campaign_beats rows. Kept pure (no DB) so they can be
// unit-tested; the caller owns the inserts/updates.

export interface CampaignBeatRow {
  campaign_id: string;
  sequence: number;
  title: string | null;
  core_message: string;
  rationale: string | null;
  prefer_thread: boolean;
  status: 'planned';
}

/** Map ordered planned beats → campaign_beats rows with 1-based sequence. */
export function buildBeatRows(campaignId: string, beats: PlannedBeat[]): CampaignBeatRow[] {
  return beats.map((b, i) => ({
    campaign_id: campaignId,
    sequence: i + 1,
    title: b.title || null,
    core_message: b.core_message,
    rationale: b.rationale || null,
    prefer_thread: b.prefer_thread,
    status: 'planned' as const,
  }));
}
