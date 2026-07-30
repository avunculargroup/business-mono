import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { parseBgeometricsResponse, bgeometricsAdapter } from './bgeometrics.js';
import type { OnchainIndicatorConfig } from '../types.js';

describe('parseBgeometricsResponse', () => {
  it('maps each row to realised_cap, oldest→newest', () => {
    const payload = [
      { d: '2026-06-19', realizedCap: '736000000000' },
      { d: '2026-06-20', realizedCap: '738000000000' },
    ];
    const res = parseBgeometricsResponse(payload, 'realised_cap');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.observations).toHaveLength(2);
    expect(res.observations[0]).toMatchObject({ observedAt: '2026-06-19', key: 'realised_cap', value: 736000000000 });
    expect(res.observations[1].value).toBe(738000000000);
  });

  it('treats a missing/empty value as absent for that day (NOT a zero)', () => {
    const payload = [{ d: '2026-06-20', realizedCap: '' }, { d: '2026-06-21' }];
    const res = parseBgeometricsResponse(payload, 'realised_cap');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.observations).toHaveLength(0);
  });

  it('parse error (not NaN, not a throw) on a non-numeric value', () => {
    const res = parseBgeometricsResponse([{ d: '2026-06-20', realizedCap: 'n/a' }], 'realised_cap');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('parse');
  });

  it('parse error when a row is missing its date', () => {
    const res = parseBgeometricsResponse([{ realizedCap: '123' }], 'realised_cap');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('parse');
    expect(res.error.message).toContain('missing date');
  });

  it('parse error (with raw body attached) when the payload is not an array', () => {
    const res = parseBgeometricsResponse({ error: 'forbidden' }, 'realised_cap');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('parse');
    expect(res.error.message).toContain('expected an array');
  });
});

describe('bgeometricsAdapter.fetchLatest', () => {
  const indicators: OnchainIndicatorConfig[] = [
    { key: 'realised_cap', provider: 'bgeometrics', providerMetricCode: 'realized-cap', unit: 'usd' },
  ];

  beforeEach(() => {
    process.env['BGEOMETRICS_API_KEY'] = 'test-key';
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env['BGEOMETRICS_API_KEY'];
  });

  it('fetches and parses the realised_cap series, sending the token as a query param', async () => {
    const fetchMock = vi.fn(async (input: URL | string) => {
      const url = new URL(input);
      expect(url.searchParams.get('token')).toBe('test-key');
      return new Response(JSON.stringify([{ d: '2026-06-20', realizedCap: '738000000000' }]), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await bgeometricsAdapter.fetchLatest(indicators);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.observations).toEqual([
      { observedAt: '2026-06-20', key: 'realised_cap', value: 738000000000, raw: { d: '2026-06-20', realizedCap: '738000000000' } },
    ]);
  });

  it('fails (not silently) when BGEOMETRICS_API_KEY is not set', async () => {
    delete process.env['BGEOMETRICS_API_KEY'];
    const res = await bgeometricsAdapter.fetchLatest(indicators);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.message).toContain('BGEOMETRICS_API_KEY');
  });

  it('surfaces an HTTP error as a typed adapter error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('forbidden', { status: 403 })));
    const res = await bgeometricsAdapter.fetchLatest(indicators);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.status).toBe(403);
  });

  it('fails when called without a realised_cap indicator in the config list', async () => {
    const res = await bgeometricsAdapter.fetchLatest([]);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('not_found');
  });
});
