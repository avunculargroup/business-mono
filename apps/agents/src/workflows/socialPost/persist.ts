import type { Platform, CharlieVariant, LexVerdict } from '../variant/schemas.js';
import { charCountOf, isThreadVariant } from '../variant/prompts.js';
import { complianceStatusFor, resolveDisclaimerSnippetId } from '../variant/persist.js';

// Pure row mappers for the social-post persist step. Like the campaign variant
// persist, but the idea is a news story, not a campaign beat — so campaign_id and
// beat_id are NULL and the post is tied only to the founder's social_account.
// Reuses the variant compliance mappers so a post's compliance fields are filled
// exactly as a campaign variant's are.

export interface DisclaimerRef {
  id: string;
  key: string;
}

export interface SocialPostRow {
  title: string | null;
  body: string | null;
  type: Platform;
  status: 'draft';
  source: 'charlie';
  campaign_id: null;
  beat_id: null;
  social_account_id: string;
  is_thread: boolean;
  char_count: number | null;
  compliance_status: 'cleared' | 'flagged';
  compliance_classification: LexVerdict['classification'];
  needs_disclaimer: boolean;
  disclaimer_snippet_id: string | null;
  compliance_rationale: string | null;
  compliance_checked_at: string;
}

/** Build the content_items row for a founder social post drafted from a news story. */
export function buildSocialPostRow(params: {
  platform: Platform;
  socialAccountId: string;
  draft: CharlieVariant;
  verdict: LexVerdict;
  disclaimerSnippets: DisclaimerRef[];
  checkedAt: string;
}): SocialPostRow {
  const { platform, socialAccountId, draft, verdict, disclaimerSnippets, checkedAt } = params;
  const thread = isThreadVariant(draft);
  return {
    title: draft.title || null,
    body: draft.body || null,
    type: platform,
    status: 'draft',
    source: 'charlie',
    campaign_id: null,
    beat_id: null,
    social_account_id: socialAccountId,
    is_thread: thread,
    char_count: thread ? null : charCountOf(draft.body),
    compliance_status: complianceStatusFor(verdict),
    compliance_classification: verdict.classification,
    needs_disclaimer: verdict.needs_disclaimer,
    disclaimer_snippet_id: resolveDisclaimerSnippetId(verdict, disclaimerSnippets),
    compliance_rationale: verdict.rationale || null,
    compliance_checked_at: checkedAt,
  };
}

export interface ThreadSegmentRow {
  content_item_id: string;
  sequence: number;
  body: string;
  char_count: number;
}

/** Build ordered thread_segments rows (1-based sequence). Empty for single posts. */
export function buildThreadSegmentRows(contentItemId: string, draft: CharlieVariant): ThreadSegmentRow[] {
  if (!isThreadVariant(draft)) return [];
  return draft.segments.map((s, i) => ({
    content_item_id: contentItemId,
    sequence: i + 1,
    body: s.body,
    char_count: charCountOf(s.body),
  }));
}
