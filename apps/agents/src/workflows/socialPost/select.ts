import { z } from 'zod';
import { SOCIAL_POST_FORM_VALUES, type SocialPostForm } from './forms.js';

// Pure story-selection helpers for the social_post_from_news routine. A founder's
// routine pulls the day's news_items, the editor picks the single story that best
// fits THAT founder's voice (and the post form), and these helpers map the rows
// and resolve the editor's pick with a safe fallback. Kept pure so they can be
// unit-tested without the DB or an agent.

/** The news_items fields one social-post run needs. */
export interface StoryCandidate {
  id: string;
  title: string;
  url: string;
  summary: string;
  source_name: string;
  category: string;
  key_points: string[];
  topic_tags: string[];
  relevance_score: number | null;
  published_at: string | null;
}

/** The post forms the editor chooses between for a given story + founder. The
 *  vocabulary (and its prompt text) lives in forms.ts — the single source of truth. */
export const socialPostFormEnum = z.enum(SOCIAL_POST_FORM_VALUES);
export type { SocialPostForm };

// The editor's pick: which candidate (by verbatim index) and which form, plus a
// one-line rationale for the audit trail.
export const editorSelectionSchema = z.object({
  story_index: z.number().int().nonnegative().describe('The verbatim candidate index from the input list.'),
  form: socialPostFormEnum.describe('The post form — one of the forms defined and described in the prompt.'),
  rationale: z.string().default('').describe('One line: why this story and form suit this founder.'),
});
export type EditorSelection = z.infer<typeof editorSelectionSchema>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

/** Map a raw news_items row to a StoryCandidate, tolerating null/missing fields. */
export function mapNewsRowToCandidate(row: Row): StoryCandidate {
  return {
    id: row.id as string,
    title: (row.title as string) ?? '',
    url: (row.url as string) ?? '',
    summary: (row.summary as string | null) ?? '',
    source_name: (row.source_name as string | null) ?? 'News',
    category: (row.category as string | null) ?? 'news',
    key_points: Array.isArray(row.key_points) ? (row.key_points as string[]) : [],
    topic_tags: Array.isArray(row.topic_tags) ? (row.topic_tags as string[]) : [],
    relevance_score: (row.relevance_score as number | null) ?? null,
    published_at: (row.published_at as string | null) ?? null,
  };
}

export interface ResolvedSelection {
  story: StoryCandidate;
  form: SocialPostForm;
  rationale: string;
}

/**
 * Resolve the editor's raw pick against the candidate list. Out-of-range or
 * missing picks fall back to the top-ranked candidate (the list arrives ordered
 * by relevance_score) with the share_with_context form — never throws as long as
 * there is at least one candidate.
 */
export function resolveSelection(
  candidates: StoryCandidate[],
  pick: EditorSelection | null,
): ResolvedSelection {
  const inRange =
    pick !== null && Number.isInteger(pick.story_index) && pick.story_index >= 0 && pick.story_index < candidates.length;
  const story = inRange ? candidates[pick!.story_index]! : candidates[0]!;
  const form: SocialPostForm = inRange ? pick!.form : 'share_with_context';
  const rationale = inRange ? pick!.rationale : 'Fallback: top-ranked story, shared with context.';
  return { story, form, rationale };
}
