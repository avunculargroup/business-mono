import { z } from 'zod';

// What Rex returns for a library answer: a short synthesised answer plus the
// source NUMBERS it drew on (1-based indices into the numbered sources it was
// given). The workflow resolves those numbers back to real episode citations in
// code, so a citation can never point at a segment the model invented.
export const answerDraftSchema = z.object({
  answer: z.string(),
  cited_sources: z.array(z.number().int().positive()).default([]),
});

export type AnswerDraft = z.infer<typeof answerDraftSchema>;
