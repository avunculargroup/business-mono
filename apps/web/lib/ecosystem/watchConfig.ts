// Builds a watch's `config` JSONB from the flat form submission.
//
// The watch form renders one set of fields per `watch_type`, but a director who
// switches the type after typing can leave stale values in the DOM. This picks
// only the fields the chosen type actually uses and drops everything else, so
// `config` never carries a leftover `feed_url` from an abandoned RSS draft.
//
// Blank optional fields are omitted rather than written as empty strings —
// adapters check for presence, and `{ match: '' }` is not the same as no match.

// The return type is `Json`, not one of the `EcosystemWatchConfig` members: what
// this builds is whatever the director typed, and a config can also be edited
// directly in the DB. Every adapter validates its own config at run time and
// degrades the watch rather than trusting the shape. The typed configs in
// @platform/shared are what the adapters narrow to once they have.

import type { Json } from '@platform/db';

export type WatchConfigFields = Record<string, string | undefined>;

function text(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function number(value: string | undefined): number | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Comma-separated keyword list → trimmed array; omitted when empty. */
function terms(value: string | undefined): string[] | undefined {
  const list = (value ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  return list.length > 0 ? list : undefined;
}

/** Drop undefined values so they never serialise into the JSONB as nulls. */
function compact(obj: Record<string, unknown>): Json {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Json;
}

export function buildWatchConfig(watchType: string, fields: WatchConfigFields): Json {
  switch (watchType) {
    case 'github_release':
      return compact({
        owner:               text(fields.owner),
        repo:                text(fields.repo),
        include_prereleases: fields.include_prereleases === 'on',
        track:               text(fields.track) ?? 'releases',
      });

    case 'github_advisory':
      return compact({
        owner: text(fields.owner),
        repo:  text(fields.repo),
      });

    case 'rss':
      return compact({
        feed_url:    text(fields.feed_url),
        match:       text(fields.match),
        event_terms: terms(fields.event_terms),
      });

    case 'newsletter':
      return compact({
        recipient_local_part: text(fields.recipient_local_part),
        subdomain:            text(fields.subdomain),
        event_terms:          terms(fields.event_terms),
      });

    case 'status_page':
      return compact({
        provider: text(fields.provider) ?? 'statuspage',
        base_url: text(fields.base_url),
        api:      text(fields.api),
      });

    case 'attestation':
      return compact({
        attestation_url:       text(fields.attestation_url),
        expected_cadence_days: number(fields.expected_cadence_days) ?? 90,
        date_selector:         text(fields.date_selector),
      });

    case 'policy_diff':
      return compact({
        page_url:         text(fields.page_url),
        content_selector: text(fields.content_selector),
        min_change_ratio: number(fields.min_change_ratio) ?? 0.02,
        content_kind:     text(fields.content_kind),
      });

    case 'regulatory_register':
      return compact({
        register:        text(fields.register),
        // Never a name to search: the adapter resolves this exact identifier and
        // nothing else, because a false de-listing defames a counterparty.
        identifier:      text(fields.identifier),
        expected_status: text(fields.expected_status),
      });

    default:
      return {};
  }
}
