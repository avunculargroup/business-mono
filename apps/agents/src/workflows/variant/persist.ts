import type { VariantContext, CharlieVariant, LexVerdict } from './schemas.js';
import { charCountOf, isThreadVariant } from './prompts.js';

// Pure row mappers for the persist step — context + Charlie's draft + Lex's
// verdict → the content_items row and thread_segments rows. Kept pure (no DB,
// no clock) so they can be unit-tested; the caller passes `checkedAt`.

/** personal_opinion invites human judgement (flagged); educational and
 *  general_advice are advisory-cleared (general_advice carries a disclaimer). */
export function complianceStatusFor(verdict: LexVerdict): 'cleared' | 'flagged' {
  return verdict.classification === 'personal_opinion' ? 'flagged' : 'cleared';
}

/** Resolve Lex's chosen disclaimer key to a compliance_snippets id. Null when
 *  no disclaimer is needed or the key doesn't match an active snippet. */
export function resolveDisclaimerSnippetId(
  verdict: LexVerdict,
  snippets: VariantContext['disclaimerSnippets'],
): string | null {
  if (!verdict.needs_disclaimer || !verdict.disclaimer_key) return null;
  return snippets.find((s) => s.key === verdict.disclaimer_key)?.id ?? null;
}

export interface ContentItemRow {
  title: string | null;
  body: string | null;
  type: VariantContext['platform'];
  status: 'draft';
  source: 'charlie';
  campaign_id: string;
  beat_id: string;
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

/** Build the content_items row for a freshly generated variant draft. For a
 *  thread, char_count is null on the parent (each segment carries its own). */
export function buildContentItemRow(params: {
  ctx: VariantContext;
  draft: CharlieVariant;
  verdict: LexVerdict;
  checkedAt: string;
}): ContentItemRow {
  const { ctx, draft, verdict, checkedAt } = params;
  const thread = isThreadVariant(draft);
  return {
    title: draft.title || null,
    body: draft.body || null,
    type: ctx.platform,
    status: 'draft',
    source: 'charlie',
    campaign_id: ctx.input.campaignId,
    beat_id: ctx.input.beatId,
    social_account_id: ctx.input.socialAccountId,
    is_thread: thread,
    char_count: thread ? null : charCountOf(draft.body),
    compliance_status: complianceStatusFor(verdict),
    compliance_classification: verdict.classification,
    needs_disclaimer: verdict.needs_disclaimer,
    disclaimer_snippet_id: resolveDisclaimerSnippetId(verdict, ctx.disclaimerSnippets),
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
export function buildThreadSegmentRows(
  contentItemId: string,
  draft: CharlieVariant,
): ThreadSegmentRow[] {
  if (!isThreadVariant(draft)) return [];
  return draft.segments.map((s, i) => ({
    content_item_id: contentItemId,
    sequence: i + 1,
    body: s.body,
    char_count: charCountOf(s.body),
  }));
}
