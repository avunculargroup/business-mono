import { describe, it, expect } from 'vitest';
import { buildWatchConfig } from './watchConfig';

describe('buildWatchConfig', () => {
  it('keeps only the fields the chosen watch_type uses', () => {
    // A director who starts an RSS watch, then switches to GitHub, leaves the
    // feed_url behind in the DOM. It must not reach the config.
    const config = buildWatchConfig('github_release', {
      owner: 'Coldcard',
      repo: 'firmware',
      feed_url: 'https://leftover.example/rss.xml',
      identifier: 'DCE100XXXXXX-001',
    });

    expect(config).toEqual({
      owner: 'Coldcard',
      repo: 'firmware',
      include_prereleases: false,
      track: 'releases',
    });
  });

  it('omits blank optional fields rather than writing empty strings', () => {
    const config = buildWatchConfig('rss', {
      feed_url: 'https://blog.example.com/rss.xml',
      match: '   ',
      event_terms: '',
    });

    expect(config).toEqual({ feed_url: 'https://blog.example.com/rss.xml' });
    expect(config).not.toHaveProperty('match');
    expect(config).not.toHaveProperty('event_terms');
  });

  it('splits event terms on commas and drops the empties', () => {
    const config = buildWatchConfig('rss', {
      feed_url: 'https://blog.example.com/rss.xml',
      event_terms: 'acquired, raises , ,insolvent',
    });

    expect(config).toMatchObject({ event_terms: ['acquired', 'raises', 'insolvent'] });
  });

  it('trims whitespace off a regulatory identifier', () => {
    const config = buildWatchConfig('regulatory_register', {
      register: 'austrac_dce',
      identifier: '  DCE100XXXXXX-001  ',
    });

    expect(config).toEqual({ register: 'austrac_dce', identifier: 'DCE100XXXXXX-001' });
  });

  it('applies numeric defaults but keeps an explicit value', () => {
    expect(buildWatchConfig('attestation', { attestation_url: 'https://e.example/a' })).toMatchObject({
      expected_cadence_days: 90,
    });
    expect(
      buildWatchConfig('attestation', {
        attestation_url: 'https://e.example/a',
        expected_cadence_days: '30',
      }),
    ).toMatchObject({ expected_cadence_days: 30 });
  });

  it('falls back to the default when a number field is not a number', () => {
    expect(
      buildWatchConfig('policy_diff', { page_url: 'https://e.example/terms', min_change_ratio: 'abc' }),
    ).toMatchObject({ min_change_ratio: 0.02 });
  });

  it('returns an empty config for an unknown watch type', () => {
    expect(buildWatchConfig('nope', { owner: 'x' })).toEqual({});
  });
});
