import { describe, it, expect } from 'vitest';
import { isKeyLimitError } from './llmErrors.js';

describe('isKeyLimitError', () => {
  it('matches a 403 with the OpenRouter key-limit message', () => {
    expect(
      isKeyLimitError({
        statusCode: 403,
        message: 'Key limit exceeded (total limit). Manage it using https://openrouter.ai/...',
      }),
    ).toBe(true);
  });

  it('matches when the phrase is only in the responseBody', () => {
    expect(
      isKeyLimitError({
        statusCode: 403,
        message: 'Forbidden',
        responseBody: '{"error":{"message":"Key limit exceeded (total limit)","code":403}}',
      }),
    ).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isKeyLimitError({ statusCode: 403, message: 'KEY LIMIT EXCEEDED' })).toBe(true);
  });

  it('does not match a 403 without the phrase', () => {
    expect(isKeyLimitError({ statusCode: 403, message: 'Forbidden' })).toBe(false);
  });

  it('does not match a 429 rate-limit error', () => {
    expect(isKeyLimitError({ statusCode: 429, message: 'Key limit exceeded' })).toBe(false);
  });

  it('does not match a plain Error', () => {
    expect(isKeyLimitError(new Error('Key limit exceeded'))).toBe(false);
  });

  it('handles null/undefined/non-objects', () => {
    expect(isKeyLimitError(null)).toBe(false);
    expect(isKeyLimitError(undefined)).toBe(false);
    expect(isKeyLimitError('Key limit exceeded')).toBe(false);
  });
});
