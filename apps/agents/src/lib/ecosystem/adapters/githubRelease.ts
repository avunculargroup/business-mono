// GitHub releases (or tags) for a watched repo — the version-shaped adapter.
//
// Diffing is by release id against last_state, not by "newest is different":
// a vendor can publish two releases between ticks, and a repo can retract one.
// Ids we have never seen are new; everything else is not.

import type {
  AdapterInput,
  EcosystemAdapter,
  EcosystemAdapterResult,
  DetectedChange,
} from '../types.js';
import { configBoolean, configError, configString } from '../types.js';
import { fetchJson, githubHeaders } from '../http.js';

// One page is plenty: a watch that falls more than 30 releases behind has been
// broken for months, and the anchor reset is the right behaviour anyway.
const PER_PAGE = 30;

interface GithubRelease {
  id: number;
  tag_name: string;
  name: string | null;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
  html_url: string;
}

interface GithubTag {
  name: string;
  commit: { sha: string };
}

interface ReleaseState {
  seen_ids?: number[];
  latest_tag?: string | null;
  seen_tags?: string[];
}

export const githubReleaseAdapter: EcosystemAdapter = {
  watchType: 'github_release',

  async detect({ config, lastState }: AdapterInput): Promise<EcosystemAdapterResult> {
    const owner = configString(config, 'owner');
    const repo = configString(config, 'repo');
    if (!owner || !repo) return configError('github_release needs both `owner` and `repo`');

    const track = configString(config, 'track') ?? 'releases';
    return track === 'tags'
      ? detectTags(owner, repo, lastState as ReleaseState | null)
      : detectReleases(owner, repo, configBoolean(config, 'include_prereleases'), lastState as ReleaseState | null);
  },
};

async function detectReleases(
  owner: string,
  repo: string,
  includePrereleases: boolean,
  lastState: ReleaseState | null,
): Promise<EcosystemAdapterResult> {
  const result = await fetchJson<GithubRelease[]>(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases?per_page=${PER_PAGE}`,
    githubHeaders(),
  );
  if (!result.ok) return result;
  if (!Array.isArray(result.data)) {
    return { ok: false, error: { kind: 'parse', message: 'expected an array of releases' } };
  }

  // Drafts are not published events. Pre-releases are opt-in: most vendors ship
  // release candidates continuously, and a feed full of RCs buries the signal.
  const releases = result.data
    .filter((r) => !r.draft)
    .filter((r) => includePrereleases || !r.prerelease);

  const seenIds = new Set(lastState?.seen_ids ?? []);
  const nextState = {
    seen_ids: releases.map((r) => r.id).slice(0, PER_PAGE),
    latest_tag: releases[0]?.tag_name ?? null,
  };

  // First run: anchor only. Everything the vendor has ever shipped is not news.
  if (!lastState) return { ok: true, changes: [], nextState };

  const previousTag = lastState.latest_tag ?? null;
  const fresh = releases.filter((r) => !seenIds.has(r.id));

  // Oldest first, so a burst of releases reads chronologically in the feed.
  const changes: DetectedChange[] = fresh.reverse().map((release, index) => ({
    changeType: 'release' as const,
    title: `${repo} ${release.tag_name}`,
    payload: {
      // Only the first change in a burst can claim the previously-anchored
      // version as its predecessor; the rest follow the one before them.
      old_version: index === 0 ? previousTag : fresh[index - 1].tag_name,
      new_version: release.tag_name,
      tag: release.tag_name,
      name: release.name,
      prerelease: release.prerelease,
      published_at: release.published_at,
      url: release.html_url,
    },
    dedupKey: `release:${release.id}`,
    occurredAt: release.published_at,
    externalUrl: release.html_url,
  }));

  return { ok: true, changes, nextState };
}

async function detectTags(
  owner: string,
  repo: string,
  lastState: ReleaseState | null,
): Promise<EcosystemAdapterResult> {
  const result = await fetchJson<GithubTag[]>(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/tags?per_page=${PER_PAGE}`,
    githubHeaders(),
  );
  if (!result.ok) return result;
  if (!Array.isArray(result.data)) {
    return { ok: false, error: { kind: 'parse', message: 'expected an array of tags' } };
  }

  const tags = result.data;
  const nextState = { seen_tags: tags.map((t) => t.name), latest_tag: tags[0]?.name ?? null };
  if (!lastState) return { ok: true, changes: [], nextState };

  const seenTags = new Set(lastState.seen_tags ?? []);
  const previousTag = lastState.latest_tag ?? null;
  const fresh = tags.filter((t) => !seenTags.has(t.name));

  // A tag carries no publish date — occurredAt is null rather than invented,
  // and the feed falls back to detected_at for ordering.
  const changes: DetectedChange[] = fresh.reverse().map((tag, index) => ({
    changeType: 'release' as const,
    title: `${repo} ${tag.name}`,
    payload: {
      old_version: index === 0 ? previousTag : fresh[index - 1].name,
      new_version: tag.name,
      tag: tag.name,
      commit: tag.commit?.sha ?? null,
      url: `https://github.com/${owner}/${repo}/releases/tag/${tag.name}`,
    },
    dedupKey: `tag:${tag.name}`,
    occurredAt: null,
    externalUrl: `https://github.com/${owner}/${repo}/releases/tag/${tag.name}`,
  }));

  return { ok: true, changes, nextState };
}
