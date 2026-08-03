/**
 * Candidate identity — hashing, filenames, and a re-export of the shared URL
 * rules.
 *
 * `normalizeReportUrl` and `passesUrlFilters` live in `@platform/shared` rather
 * than here, because the /news/sources "Test detection" dry run has to apply
 * exactly the same rules: a dry run that normalises differently from the scan
 * tells the operator something untrue about what the scan will find. Re-exported
 * so this module stays the single import site for the engine.
 *
 * What stays here is what needs `node:crypto` — `@platform/shared` is imported
 * by client components, and a Node builtin in that bundle would break the build.
 */

import { createHash } from 'node:crypto';

export { normalizeReportUrl, passesUrlFilters } from '@platform/shared';

/** sha256 over the NORMALISED url — the discovery idempotency guard. */
export function urlHash(normalizedUrl: string): string {
  return createHash('sha256').update(normalizedUrl).digest('hex');
}

/** sha256 over raw artefact bytes — the identity key on `reports`. */
export function contentHash(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Best-effort filename for the stored artefact, from the URL path. */
export function fileNameFromUrl(url: string, fallbackExt: string): string {
  try {
    const { pathname } = new URL(url);
    const last = pathname.split('/').filter(Boolean).pop();
    if (last && /\.[a-z0-9]{2,5}$/i.test(last)) return decodeURIComponent(last);
    if (last) return `${decodeURIComponent(last)}.${fallbackExt}`;
  } catch {
    /* fall through */
  }
  return `report.${fallbackExt}`;
}
