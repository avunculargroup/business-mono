import { describe, it, expect, vi, afterEach } from 'vitest';
import { attestationAdapter, extractAttestationDate } from './attestation.js';

const NOW = new Date('2026-07-29T00:00:00Z');

function mockFetch(body: string, status = 200) {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    text: async () => body,
  })) as unknown as typeof fetch;
}

const config = { attestation_url: 'https://custodian.example/attestation', expected_cadence_days: 90 };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('extractAttestationDate', () => {
  it('reads the date from a meta selector', () => {
    const html = `<html><head><meta name="attested-at" content="2025-06-06"></head></html>`;

    expect(extractAttestationDate(html, "meta[name='attested-at']", NOW)).toBe('2025-06-06');
  });

  it('reads a meta tag with the attributes in either order', () => {
    const html = `<meta content="2025-06-06" property="og:attested">`;

    expect(extractAttestationDate(html, "meta[property='og:attested']", NOW)).toBe('2025-06-06');
  });

  // The important negative: a selector that matched nothing must NOT silently
  // fall back to scraping a date out of the page body. The director configured
  // a precise source; guessing from a footer copyright year is not that source.
  it('returns null when a supplied selector matches nothing, rather than guessing', () => {
    const html = `<html><body><p>Last audited 2025-06-06</p><footer>2026-01-01</footer></body></html>`;

    expect(extractAttestationDate(html, "meta[name='attested-at']", NOW)).toBeNull();
  });

  it('takes the most recent non-future date when no selector is configured', () => {
    const html = `<p>2024-01-01</p><p>2025-06-06</p><p>2030-01-01</p>`;

    expect(extractAttestationDate(html, undefined, NOW)).toBe('2025-06-06');
  });

  it('returns null when the page carries no date at all', () => {
    expect(extractAttestationDate('<p>Coming soon</p>', undefined, NOW)).toBeNull();
  });
});

describe('attestationAdapter', () => {
  it('reports overdue on the first run — absence is the signal, not a diff', async () => {
    vi.stubGlobal('fetch', mockFetch('<meta name="attested-at" content="2025-06-06">'));

    const result = await attestationAdapter.detect({
      config: { ...config, date_selector: "meta[name='attested-at']" },
      lastState: null,
      now: NOW,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toMatchObject({
      changeType: 'staleness',
      dedupKey: 'staleness:2025-06-06',
      occurredAt: '2025-06-06',
    });
    expect(result.changes[0].payload).toMatchObject({
      metric: 'attestation',
      last_event_at: '2025-06-06',
      days_since: 418,
      expected_cadence_days: 90,
      days_overdue: 328,
    });
  });

  it('stays silent while the attestation is within its cadence', async () => {
    vi.stubGlobal('fetch', mockFetch('<meta name="attested-at" content="2026-07-01">'));

    const result = await attestationAdapter.detect({
      config: { ...config, date_selector: "meta[name='attested-at']" },
      lastState: null,
      now: NOW,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changes).toEqual([]);
    expect(result.nextState).toEqual({ last_attested_at: '2026-07-01' });
  });

  it('reports one overdue change per stale attestation, not one per tick', async () => {
    vi.stubGlobal('fetch', mockFetch('<meta name="attested-at" content="2025-06-06">'));
    const selectorConfig = { ...config, date_selector: "meta[name='attested-at']" };

    const first = await attestationAdapter.detect({ config: selectorConfig, lastState: null, now: NOW });
    const second = await attestationAdapter.detect({
      config: selectorConfig,
      lastState: { last_attested_at: '2025-06-06' },
      now: new Date('2026-07-30T00:00:00Z'),
    });

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    // Same key a day later, so the dedup index absorbs it and the feed shows the
    // overdue attestation once rather than every day it stays overdue.
    expect(second.changes[0].dedupKey).toBe(first.changes[0].dedupKey);
  });

  // The failure that must never be reported as a fact: we could not read the
  // page, which is not the same as "this custodian never attested".
  it('returns indeterminate when no date can be read, rather than never-attested', async () => {
    vi.stubGlobal('fetch', mockFetch('<html><body>Under maintenance</body></html>'));

    const result = await attestationAdapter.detect({ config, lastState: null, now: NOW });

    expect(result).toMatchObject({ ok: false, error: { kind: 'indeterminate' } });
  });

  it('reports a fetch failure without emitting a change', async () => {
    vi.stubGlobal('fetch', mockFetch('', 503));

    const result = await attestationAdapter.detect({ config, lastState: null, now: NOW });

    expect(result.ok).toBe(false);
  });

  it('rejects a missing url or a nonsensical cadence', async () => {
    await expect(
      attestationAdapter.detect({ config: {}, lastState: null, now: NOW }),
    ).resolves.toMatchObject({ ok: false, error: { kind: 'config' } });

    await expect(
      attestationAdapter.detect({
        config: { ...config, expected_cadence_days: 0 },
        lastState: null,
        now: NOW,
      }),
    ).resolves.toMatchObject({ ok: false, error: { kind: 'config' } });
  });
});
