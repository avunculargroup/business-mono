import { readFileSync } from 'node:fs';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { githubReleaseAdapter } from './githubRelease.js';

// Shape recorded from the GitHub REST releases endpoint (fields trimmed to the
// ones the adapter reads). Includes a pre-release and a draft, because both are
// filtered and both have burned feeds elsewhere in the app.
const releases = JSON.parse(
  readFileSync(new URL('./__fixtures__/github-releases.json', import.meta.url), 'utf8'),
);

const NOW = new Date('2026-07-29T00:00:00Z');

function mockFetch(body: unknown, status = 200) {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    text: async () => JSON.stringify(body),
  })) as unknown as typeof fetch;
}

const config = { owner: 'Coldcard', repo: 'firmware' };

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch(releases));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('githubReleaseAdapter', () => {
  it('reports nothing on the first run and just anchors', async () => {
    const result = await githubReleaseAdapter.detect({ config, lastState: null, now: NOW });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Forty historical releases in the feed on day one would be noise a director
    // has to dismiss before reaching anything that matters.
    expect(result.changes).toEqual([]);
    expect(result.nextState).toMatchObject({ latest_tag: 'v6.3.4' });
  });

  it('emits only releases it has not seen before', async () => {
    const result = await githubReleaseAdapter.detect({
      config,
      lastState: { seen_ids: [183990003], latest_tag: 'v6.3.3' },
      now: NOW,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toMatchObject({
      changeType: 'release',
      title: 'firmware v6.3.4',
      dedupKey: 'release:184238001',
      occurredAt: '2026-07-12T02:00:00Z',
    });
    expect(result.changes[0].payload).toMatchObject({
      old_version: 'v6.3.3',
      new_version: 'v6.3.4',
    });
  });

  it('skips drafts and pre-releases unless pre-releases are opted in', async () => {
    const withoutPre = await githubReleaseAdapter.detect({
      config,
      lastState: { seen_ids: [], latest_tag: null },
      now: NOW,
    });
    const withPre = await githubReleaseAdapter.detect({
      config: { ...config, include_prereleases: true },
      lastState: { seen_ids: [], latest_tag: null },
      now: NOW,
    });

    expect(withoutPre.ok && withoutPre.changes.map((c) => c.payload.new_version)).toEqual([
      'v6.3.3',
      'v6.3.4',
    ]);
    expect(withPre.ok && withPre.changes.map((c) => c.payload.new_version)).toEqual([
      'v6.3.3',
      'v6.3.4-rc1',
      'v6.3.4',
    ]);
    // The draft never appears in either.
    const allVersions = [
      ...(withoutPre.ok ? withoutPre.changes : []),
      ...(withPre.ok ? withPre.changes : []),
    ].map((c) => c.payload.new_version);
    expect(allVersions).not.toContain('v6.3.3-draft');
  });

  it('chains old_version through a burst rather than repeating the anchor', async () => {
    const result = await githubReleaseAdapter.detect({
      config,
      lastState: { seen_ids: [], latest_tag: 'v6.3.2' },
      now: NOW,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changes.map((c) => [c.payload.old_version, c.payload.new_version])).toEqual([
      ['v6.3.2', 'v6.3.3'],
      ['v6.3.3', 'v6.3.4'],
    ]);
  });

  it('produces a stable dedup key across runs, so a re-run adds nothing new', async () => {
    const first = await githubReleaseAdapter.detect({
      config,
      lastState: { seen_ids: [183990003], latest_tag: 'v6.3.3' },
      now: NOW,
    });
    const second = await githubReleaseAdapter.detect({
      config,
      lastState: { seen_ids: [183990003], latest_tag: 'v6.3.3' },
      now: NOW,
    });

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.changes[0].dedupKey).toBe(second.changes[0].dedupKey);
  });

  it('reports a config problem when owner or repo is missing', async () => {
    const result = await githubReleaseAdapter.detect({ config: { owner: 'x' }, lastState: null, now: NOW });

    expect(result).toMatchObject({ ok: false, error: { kind: 'config' } });
  });

  it('separates a missing repo from a rate limit', async () => {
    vi.stubGlobal('fetch', mockFetch({}, 404));
    const missing = await githubReleaseAdapter.detect({ config, lastState: null, now: NOW });

    vi.stubGlobal('fetch', mockFetch({}, 429));
    const limited = await githubReleaseAdapter.detect({ config, lastState: null, now: NOW });

    expect(missing).toMatchObject({ ok: false, error: { kind: 'not_found' } });
    expect(limited).toMatchObject({ ok: false, error: { kind: 'rate_limit' } });
  });

  it('treats a non-array body as a parse failure rather than an empty read', async () => {
    vi.stubGlobal('fetch', mockFetch({ message: 'Not Found' }));

    const result = await githubReleaseAdapter.detect({ config, lastState: null, now: NOW });

    expect(result).toMatchObject({ ok: false, error: { kind: 'parse' } });
  });
});
