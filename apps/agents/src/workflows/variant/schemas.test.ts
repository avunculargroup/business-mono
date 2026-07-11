import { describe, it, expect } from 'vitest';
import {
  charlieVariantSchema,
  formatConfigSchema,
  lexVerdictSchema,
  variantGateResumeSchema,
  variantResultSchema,
} from './schemas.js';

describe('charlieVariantSchema', () => {
  it('fills defaults for a minimal object', () => {
    const parsed = charlieVariantSchema.parse({ body: 'hi' });
    expect(parsed).toEqual({
      is_thread: false,
      title: '',
      body: 'hi',
      segments: [],
      charlie_note: '',
    });
  });
});

describe('formatConfigSchema', () => {
  it('accepts the char-count, emoji, and thread-style fields so they survive into the context', () => {
    const parsed = formatConfigSchema.parse({
      char_count_min: 100,
      char_count_max: 250,
      emoji_use: 'none',
      thread_style: 'single-only',
    });
    expect(parsed).toEqual({
      char_count_min: 100,
      char_count_max: 250,
      emoji_use: 'none',
      thread_style: 'single-only',
    });
  });

  it('rejects an unknown thread_style value', () => {
    expect(() => formatConfigSchema.parse({ thread_style: 'prefer-threads' })).toThrow();
  });
});

describe('lexVerdictSchema', () => {
  it('defaults disclaimer fields when omitted', () => {
    const parsed = lexVerdictSchema.parse({ classification: 'educational' });
    expect(parsed.needs_disclaimer).toBe(false);
    expect(parsed.disclaimer_key).toBeNull();
  });
  it('rejects an unknown classification', () => {
    expect(() => lexVerdictSchema.parse({ classification: 'speculation' })).toThrow();
  });
});

describe('variantGateResumeSchema', () => {
  it('accepts approve and request_change', () => {
    expect(variantGateResumeSchema.parse({ decision: 'approve' }).decision).toBe('approve');
    expect(
      variantGateResumeSchema.parse({ decision: 'request_change', instruction: 'sharpen it' }).instruction,
    ).toBe('sharpen it');
  });
  it('rejects an unknown decision', () => {
    expect(() => variantGateResumeSchema.parse({ decision: 'delete' })).toThrow();
  });
});

describe('variantResultSchema', () => {
  it('validates a completed result', () => {
    const parsed = variantResultSchema.parse({
      contentItemId: 'ci-1',
      status: 'approved',
      isThread: false,
      classification: 'educational',
      needsDisclaimer: false,
      charCount: 42,
    });
    expect(parsed.status).toBe('approved');
  });
});
