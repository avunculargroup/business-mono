import { describe, it, expect } from 'vitest';
import { SOCIAL_POST_FORMS, SOCIAL_POST_FORM_VALUES } from './forms.js';

describe('SOCIAL_POST_FORMS', () => {
  it('gives every form both an editorDesc and a generateInstruction', () => {
    for (const [key, def] of Object.entries(SOCIAL_POST_FORMS)) {
      expect(def.editorDesc.trim().length, `${key} editorDesc`).toBeGreaterThan(0);
      expect(def.generateInstruction.trim().length, `${key} generateInstruction`).toBeGreaterThan(0);
      // Charlie's prompt renders the generateInstruction verbatim as the form block.
      expect(def.generateInstruction, `${key} generateInstruction`).toMatch(/^Form: /);
    }
  });

  it('keeps SOCIAL_POST_FORM_VALUES in sync with the catalog keys', () => {
    expect([...SOCIAL_POST_FORM_VALUES].sort()).toEqual(Object.keys(SOCIAL_POST_FORMS).sort());
    // No duplicates in the enum tuple.
    expect(new Set(SOCIAL_POST_FORM_VALUES).size).toBe(SOCIAL_POST_FORM_VALUES.length);
  });

  it('keeps the two original forms so the editor fallback stays valid', () => {
    expect(SOCIAL_POST_FORM_VALUES).toContain('share_with_context');
    expect(SOCIAL_POST_FORM_VALUES).toContain('teach');
  });
});
