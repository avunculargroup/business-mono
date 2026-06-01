import { describe, it, expect } from 'vitest';
import { coerceToSchema } from './coerce.js';
import {
  storyCandidateSchema,
  storyShortlistSchema,
  researchNoteSchema,
  storyDraftSchema,
  introOutroSchema,
  editorialReviewSchema,
} from './schemas.js';

// Regression for the "Expected string, received null" crash: a model can emit
// JSON null / omit / mistype a required field, which used to fail strict
// step-boundary validation and abort the whole run. coerceToSchema fills bad
// leaves with type defaults so the run survives.

describe('coerceToSchema', () => {
  it('coerces null string/number/boolean fields on a story candidate', () => {
    const out = coerceToSchema(storyCandidateSchema, {
      story_id: null,
      working_title: null,
      angle: null,
      key_points: [null, 'real point'],
      source_ids: [null],
      relevance_score: null,
      data_completeness: null,
      needs_research: null,
      rex_rationale: null,
    });
    expect(out).toEqual({
      story_id: '',
      working_title: '',
      angle: '',
      key_points: ['', 'real point'],
      source_ids: [''],
      relevance_score: 0,
      data_completeness: 0,
      needs_research: false,
      rex_rationale: '',
    });
    // Coerced output satisfies the strict schema (would throw before).
    expect(() => storyCandidateSchema.parse(out)).not.toThrow();
  });

  it('coerces a shortlist with a null editorial note and recommended ids', () => {
    const out = coerceToSchema(storyShortlistSchema, {
      candidates: [],
      recommended: [null],
      rex_editorial_note: null,
    });
    expect(out.recommended).toEqual(['']);
    expect(out.rex_editorial_note).toBe('');
  });

  it('coerces null fields inside research-note sources', () => {
    const out = coerceToSchema(researchNoteSchema, {
      story_id: 's1',
      sources: [{ url: null, title: null, key_excerpt: null, retrieved_at: null }],
      research_summary: null,
      confidence: 'low',
    });
    expect(out.sources[0]).toEqual({ url: '', title: '', key_excerpt: '', retrieved_at: '' });
    expect(out.research_summary).toBe('');
    expect(() => researchNoteSchema.parse(out)).not.toThrow();
  });

  it('falls back to the first enum option when confidence is null', () => {
    const out = coerceToSchema(researchNoteSchema, {
      story_id: 's1',
      sources: [],
      research_summary: '',
      confidence: null,
    });
    expect(out.confidence).toBe('high');
  });

  it('coerces a draft with null body/notes', () => {
    const out = coerceToSchema(storyDraftSchema, {
      story_id: null,
      working_title: null,
      draft_title: null,
      body: null,
      word_count: null,
      key_message: null,
      sources_used: [null],
      charlie_note: null,
    });
    expect(out).toMatchObject({ body: '', word_count: 0, key_message: '', sources_used: [''], charlie_note: '' });
  });

  it('coerces null intro/outro', () => {
    expect(coerceToSchema(introOutroSchema, { intro: null, outro: null })).toEqual({ intro: '', outro: '' });
  });

  it('coerces null editorial scores and tolerates null revised_draft', () => {
    const out = coerceToSchema(editorialReviewSchema, {
      story_id: null,
      scores: { voice_match: null, audience_fit: null, bitcoin_accuracy: null, clarity: null, evidence_quality: null, length_discipline: null },
      overall_score: null,
      passes_gate: null,
      critique: null,
      revised_draft: null,
      editor_note: null,
    });
    expect(out.scores.voice_match).toBe(0);
    expect(out.passes_gate).toBe(false);
    expect(out.critique).toBe('');
    expect(out.revised_draft).toBeUndefined();
    expect(() => editorialReviewSchema.parse(out)).not.toThrow();
  });

  it('drops an optional field that is null and omits one that is absent', () => {
    const out = coerceToSchema(editorialReviewSchema, {
      story_id: 's1',
      scores: { voice_match: 8, audience_fit: 8, bitcoin_accuracy: 8, clarity: 8, evidence_quality: 8, length_discipline: 8 },
      overall_score: 8,
      passes_gate: true,
      critique: 'Solid.',
      editor_note: 'Pass.',
    });
    expect('revised_draft' in out).toBe(false);
  });

  it('leaves a fully-valid object unchanged', () => {
    const valid = {
      story_id: 's1',
      working_title: 'Treasury moves',
      angle: 'CFO lens',
      key_points: ['a', 'b'],
      source_ids: ['x'],
      relevance_score: 9,
      data_completeness: 7,
      needs_research: true,
      research_queries: ['q'],
      rex_rationale: 'because',
    };
    expect(coerceToSchema(storyCandidateSchema, valid)).toEqual(valid);
  });

  it('replaces a non-array with an empty array and an array element of wrong type', () => {
    const out = coerceToSchema(storyDraftSchema, {
      story_id: 's1',
      working_title: 't',
      draft_title: 't',
      body: 'b',
      word_count: 10,
      key_message: 'k',
      sources_used: 'not-an-array',
      charlie_note: 'n',
    });
    expect(out.sources_used).toEqual([]);
  });
});
