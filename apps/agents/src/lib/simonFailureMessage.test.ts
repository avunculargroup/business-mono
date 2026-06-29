import { describe, it, expect } from 'vitest';
import { simonFailureMessage } from './simonFailureMessage.js';

describe('simonFailureMessage', () => {
  it('explains a timeout and invites a retry', () => {
    const msg = simonFailureMessage(new Error('aborted'), true);
    expect(msg).toMatch(/longer than I could wait/i);
    expect(msg).toMatch(/again|rephras/i);
  });

  it('explains a provider usage limit instead of a generic error', () => {
    const keyLimit = { statusCode: 403, responseBody: 'Key limit exceeded' };
    const msg = simonFailureMessage(keyLimit, false);
    expect(msg).toMatch(/usage limit/i);
    expect(msg).toMatch(/top-up|flag/i);
  });

  it('falls back to a humane generic message and never goes silent', () => {
    const msg = simonFailureMessage(new Error('boom'), false);
    expect(msg.length).toBeGreaterThan(0);
    expect(msg).toMatch(/went wrong|send it again/i);
  });

  it('has no exclamation marks (brand voice)', () => {
    for (const m of [
      simonFailureMessage(new Error('x'), true),
      simonFailureMessage({ statusCode: 403, responseBody: 'Key limit exceeded' }, false),
      simonFailureMessage(new Error('x'), false),
    ]) {
      expect(m).not.toContain('!');
    }
  });
});
