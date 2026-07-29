// Outbound fetch for the ecosystem adapters.
//
// `fetchText` in ../fetchFeed.ts throws a bare `HTTP 404`, which loses the
// status an adapter needs to tell apart "this repo does not exist" (a config
// problem, report it) from "GitHub is rate-limiting us" (transient, retry next
// tick). So adapters go through this instead: it never throws, and it hands
// back the status. Same 20s abort and byte cap discipline as fetchFeed.

import type { EcosystemAdapterError } from './types.js';

const TIMEOUT_MS = 20_000;
const MAX_BYTES = 2_000_000;

const UA = 'BTSEcosystemWatch/1.0 (+https://btreasury.com.au)';

export type HttpResult =
  | { ok: true; status: number; body: string }
  | { ok: false; error: EcosystemAdapterError };

function classify(status: number): EcosystemAdapterError['kind'] {
  if (status === 404) return 'not_found';
  if (status === 429 || status === 403) return 'rate_limit';
  return 'transport';
}

export async function fetchWithStatus(
  url: string,
  headers: Record<string, string> = {},
): Promise<HttpResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, ...headers },
      redirect: 'follow',
      signal: controller.signal,
    });

    if (!res.ok) {
      return {
        ok: false,
        error: { kind: classify(res.status), message: `HTTP ${res.status} from ${url}`, status: res.status },
      };
    }

    const declared = Number(res.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > MAX_BYTES) {
      return {
        ok: false,
        error: { kind: 'transport', message: `response too large (${declared} bytes)` },
      };
    }

    const body = await res.text();
    if (body.length > MAX_BYTES) {
      return { ok: false, error: { kind: 'transport', message: 'response exceeded byte cap' } };
    }

    return { ok: true, status: res.status, body };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: { kind: 'transport', message } };
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch and JSON-parse. A malformed body is a parse error, not a transport one. */
export async function fetchJson<T>(
  url: string,
  headers: Record<string, string> = {},
): Promise<{ ok: true; data: T } | { ok: false; error: EcosystemAdapterError }> {
  const result = await fetchWithStatus(url, { Accept: 'application/json', ...headers });
  if (!result.ok) return result;

  try {
    return { ok: true, data: JSON.parse(result.body) as T };
  } catch {
    return { ok: false, error: { kind: 'parse', message: `invalid JSON from ${url}` } };
  }
}

/** GitHub REST headers, with the token when one is configured (the anonymous
 *  rate limit is 60/hour, which a handful of watches would exhaust). */
export function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}
