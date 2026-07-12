// The post-form vocabulary for the social_post_from_news routine — the single
// source of truth so the zod enum (select.ts), the editor-selection prompt, and
// Charlie's generation prompt cannot drift apart.
//
// Each form carries two strings:
//   - editorDesc: how the form is described to the editor when it picks a form.
//   - generateInstruction: the "Form: …" block handed to Charlie when it drafts.
//
// The vocabulary deliberately mixes the two essay-skeleton forms (share_with_context,
// teach) with four shapes that lack that skeleton (a flat observation, a contrarian
// one-liner, a small-note fragment, a numbers-first post). Varying the SHAPE — not
// just the words — is what breaks the automated-feeling sameness. The non-teach forms
// also carry explicit permission to hold a view and to NOT teach: the teach form is
// where the copy turns preachy, so these are the brake.

export interface SocialPostFormDef {
  /** One line shown to the editor when it chooses a form for the story. */
  editorDesc: string;
  /** The "Form: …" instruction block handed to Charlie in the generation prompt. */
  generateInstruction: string;
}

export const SOCIAL_POST_FORMS = {
  share_with_context: {
    editorDesc:
      'share the story with the founder\'s perspective and what it means for Australian businesses. Best when the news itself is the point.',
    generateInstruction:
      'Form: SHARE WITH CONTEXT. Share the story with your perspective on what it means for Australian businesses. Add the insight a reader would miss skimming the headline.',
  },
  teach: {
    editorDesc:
      'use the story as a hook to teach the underlying concept a sceptical CFO needs to understand. Best when the story surfaces a principle worth explaining.',
    generateInstruction:
      'Form: TEACH. Use the story as a hook, then teach the underlying concept a sceptical CFO needs to understand. Lead with the principle, ground it in the news.',
  },
  flat_observation: {
    editorDesc:
      'a single plain observation about the story — no hook, no framing, no takeaway. Best when one clear-eyed line lands harder than a full post.',
    generateInstruction:
      'Form: FLAT OBSERVATION. Make one plain, specific observation about the story and stop. No hook, no scene-setting, no tidy takeaway, no invitation to reflect. One idea, stated plainly, the way a person drops a thought into a feed. You do not have to teach anything — resist the urge to explain or round it off.',
  },
  contrarian_take: {
    editorDesc:
      'state a view that cuts against the obvious read of the story, backed by a single reason. Best when the consensus reaction misses something.',
    generateInstruction:
      'Form: CONTRARIAN TAKE. Hold a clear view that cuts against the obvious reading of the story, and give exactly one reason for it — no more. You are allowed to be opinionated and allowed to be plainly wrong; do not hedge it into mush or stack qualifiers. State the view, give the one reason, stop.',
  },
  small_note: {
    editorDesc:
      'flag one small, easily-missed detail in the story. Best when the interesting part is a footnote, not the headline.',
    generateInstruction:
      'Form: SMALL NOTE. Point out one small thing worth noting in the story — a detail most readers would skim past. Keep it low-key and specific, the tone of someone mentioning something in passing, not delivering a lesson. No grand framing, no "here is why this matters for every CFO".',
  },
  numbers_first: {
    editorDesc:
      'lead with the single most striking figure in the story and build the post around it. Best when a number carries the whole point.',
    generateInstruction:
      'Form: NUMBERS FIRST. Open with the single most striking figure or fact from the story — no lead-in, no throat-clearing sentence before it. Then one or two lines on why that number matters. If the story carries no concrete figure, this is the wrong form.',
  },
} as const satisfies Record<string, SocialPostFormDef>;

export type SocialPostForm = keyof typeof SOCIAL_POST_FORMS;

/**
 * The form values as a tuple, for `z.enum(...)` in select.ts. Kept as an explicit
 * list (not derived from Object.keys) so z.enum infers the literal union; the
 * forms.test.ts invariant guards that it stays in sync with SOCIAL_POST_FORMS.
 */
export const SOCIAL_POST_FORM_VALUES = [
  'share_with_context',
  'teach',
  'flat_observation',
  'contrarian_take',
  'small_note',
  'numbers_first',
] as [SocialPostForm, ...SocialPostForm[]];
