import { describe, it, expect } from 'vitest';
import { newsletterInputSchema } from './schemas.js';

describe('newsletterInputSchema', () => {
  it('accepts a null audienceContext (stored routine config writes null)', () => {
    const parsed = newsletterInputSchema.parse({
      timeRange: 'month',
      storyCount: 5,
      targetWordCount: 250,
      audienceContext: null,
      triggerSource: 'schedule',
    });
    expect(parsed.audienceContext).toBeNull();
  });

  it('accepts an omitted audienceContext', () => {
    const parsed = newsletterInputSchema.parse({ triggerSource: 'web' });
    expect(parsed.audienceContext).toBeUndefined();
  });

  it('keeps a provided audienceContext string', () => {
    const parsed = newsletterInputSchema.parse({ audienceContext: 'CFO audience' });
    expect(parsed.audienceContext).toBe('CFO audience');
  });
});
