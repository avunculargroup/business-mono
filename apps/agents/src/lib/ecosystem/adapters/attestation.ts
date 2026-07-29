// Attestation freshness — the state-shaped adapter, and the only one that
// detects a change by ABSENCE.
//
// Nothing new arriving IS the signal: a proof-of-reserves page that has not
// moved in 400 days against a quarterly cadence is the finding. That has two
// consequences the other adapters do not have:
//
//   1. It must run on a clock even when the fetched page is byte-identical to
//      last time, so it is never short-circuited on "no diff".
//   2. It reports on the FIRST run, unlike the version-shaped adapters — an
//      attestation can already be overdue the moment we start watching.
//
// The output is a neutral fact ("last attested N days ago; expected every M"),
// never an inference about solvency. That framing is not the narrator's job to
// get right — the payload simply contains no vocabulary for it.

import type {
  AdapterInput,
  EcosystemAdapter,
  EcosystemAdapterResult,
  DetectedChange,
} from '../types.js';
import { configError, configNumber, configString } from '../types.js';
import { fetchWithStatus } from '../http.js';

const MS_PER_DAY = 86_400_000;

interface AttestationState {
  last_attested_at?: string | null;
}

export const attestationAdapter: EcosystemAdapter = {
  watchType: 'attestation',

  async detect({ config, lastState, now }: AdapterInput): Promise<EcosystemAdapterResult> {
    const url = configString(config, 'attestation_url');
    if (!url) return configError('attestation needs `attestation_url`');

    const cadenceDays = configNumber(config, 'expected_cadence_days') ?? 90;
    if (cadenceDays <= 0) return configError('`expected_cadence_days` must be greater than zero');

    const result = await fetchWithStatus(url, { Accept: 'text/html,application/xhtml+xml' });
    if (!result.ok) return result;

    const attestedAt = extractAttestationDate(result.body, configString(config, 'date_selector'), now);

    // Cannot read a date: report indeterminate rather than treating an
    // unreadable page as "never attested". The difference between those two is
    // the difference between a broken watch and an accusation.
    if (!attestedAt) {
      return {
        ok: false,
        error: {
          kind: 'indeterminate',
          message: `no attestation date found at ${url}`,
        },
      };
    }

    const daysSince = Math.floor((now.getTime() - Date.parse(attestedAt)) / MS_PER_DAY);
    const daysOverdue = daysSince - cadenceDays;
    const nextState = { last_attested_at: attestedAt };

    if (daysOverdue <= 0) return { ok: true, changes: [], nextState };

    // Keyed on the attestation date, so the overdue state is reported ONCE per
    // stale attestation rather than every tick for however long it stays stale.
    // A fresh attestation moves the key and closes the episode.
    const previous = (lastState as AttestationState | null)?.last_attested_at ?? null;
    const change: DetectedChange = {
      changeType: 'staleness',
      title: `Attestation ${daysSince} days old`,
      payload: {
        metric: 'attestation',
        last_event_at: attestedAt,
        previous_event_at: previous,
        days_since: daysSince,
        expected_cadence_days: cadenceDays,
        days_overdue: daysOverdue,
        url,
      },
      dedupKey: `staleness:${attestedAt}`,
      occurredAt: attestedAt,
      externalUrl: url,
    };

    return { ok: true, changes: [change], nextState };
  },
};

/**
 * Pull the attestation date out of the page.
 *
 * With a `meta[...]` selector, read that tag's content — the reliable path, and
 * what a vendor publishing machine-readable attestations will offer. Otherwise
 * fall back to scanning for ISO dates and taking the most recent one that is
 * not in the future.
 *
 * Exported for tests: this is the part that decides whether a counterparty gets
 * reported as overdue, so it is unit-tested against real page shapes.
 */
export function extractAttestationDate(
  html: string,
  selector: string | undefined,
  now: Date,
): string | null {
  const fromMeta = selector ? extractMetaDate(html, selector) : null;
  if (fromMeta) return fromMeta;

  // A selector that was supplied but matched nothing is a failed read, not an
  // invitation to guess from the page body.
  if (selector) return null;

  const matches = html.match(/\d{4}-\d{2}-\d{2}/g);
  if (!matches) return null;

  const nowMs = now.getTime();
  const candidates = matches
    .map((date) => ({ date, ms: Date.parse(date) }))
    .filter((c) => Number.isFinite(c.ms) && c.ms <= nowMs)
    .sort((a, b) => b.ms - a.ms);

  return candidates[0]?.date ?? null;
}

/** `meta[name='attested-at']` / `meta[property='...']` → that tag's content. */
function extractMetaDate(html: string, selector: string): string | null {
  const selectorMatch = selector.match(/meta\[\s*(name|property)\s*=\s*['"]?([^'"\]]+)['"]?\s*\]/i);
  if (!selectorMatch) return null;

  const [, attr, value] = selectorMatch;
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Content can precede or follow the name/property attribute in the tag.
  const patterns = [
    new RegExp(`<meta[^>]*${attr}\\s*=\\s*["']${escaped}["'][^>]*content\\s*=\\s*["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]*content\\s*=\\s*["']([^"']+)["'][^>]*${attr}\\s*=\\s*["']${escaped}["']`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (!match) continue;
    const parsed = Date.parse(match[1]);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString().slice(0, 10);
  }
  return null;
}
