import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SITE_ORIGIN, siteOrigin } from './siteUrl';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('siteOrigin', () => {
  it('falls back to the deployed origin when nothing is configured', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    expect(siteOrigin()).toBe(DEFAULT_SITE_ORIGIN);
  });

  it('never falls back to localhost', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    expect(siteOrigin()).not.toContain('localhost');
    expect(siteOrigin()).not.toContain('127.0.0.1');
  });

  it('uses the configured origin when there is one', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000');
    expect(siteOrigin()).toBe('http://localhost:3000');
  });

  it.each(['https://minute.example/', 'https://minute.example///'])(
    'strips the trailing slash from %s, which GoTrue matches exactly',
    (configured) => {
      vi.stubEnv('NEXT_PUBLIC_SITE_URL', configured);
      expect(`${siteOrigin()}/auth/callback`).toBe('https://minute.example/auth/callback');
    },
  );

  it('treats a whitespace-only value as unset', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '   ');
    expect(siteOrigin()).toBe(DEFAULT_SITE_ORIGIN);
  });
});
