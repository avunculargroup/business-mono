import { resolve4 } from 'node:dns/promises';

let cached: Promise<string> | undefined;

async function resolve(connStr: string): Promise<string> {
  let url: URL;
  try {
    url = new URL(connStr);
  } catch {
    return connStr;
  }
  const hostname = url.hostname;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return connStr;
  try {
    const [ipv4] = await resolve4(hostname);
    url.hostname = ipv4;
    // Connecting via IP makes hostname-based cert verification impossible
    // (cert CN is the hostname, not the IP). Both Railway's internal Postgres
    // plugin and Supabase use self-signed certs not in Node.js's trust store,
    // causing SELF_SIGNED_CERT_IN_CHAIN with sslmode=require. Force no-verify:
    // the connection remains encrypted; cert chain and hostname checks skipped.
    url.searchParams.set('sslmode', 'no-verify');
    return url.toString();
  } catch (err) {
    throw new Error(
      `MASTRA_DB_URL hostname "${hostname}" has no IPv4 (A) DNS records. ` +
      'Railway containers cannot reach IPv6 addresses. ' +
      'Recommended fix: add a Railway Postgres plugin and set MASTRA_DB_URL=${{Postgres.DATABASE_URL}}. ' +
      'If using Supabase, enable the IPv4 Add-On (Dashboard → Settings → Add-Ons → IPv4 address, ~$4/mo). ' +
      `DNS error: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Returns the Mastra Postgres connection string with hostname rewritten to
 * an explicit IPv4 address. Cached so multiple consumers (PostgresStore,
 * PgVector) share one DNS lookup.
 *
 * Throws fast at startup with an actionable message if MASTRA_DB_URL is
 * unset, contains a literal IPv6 address, or resolves only to AAAA records.
 */
export function getResolvedMastraDbUrl(): Promise<string> {
  if (cached) return cached;

  const url = process.env['MASTRA_DB_URL'] ?? process.env['SUPABASE_DB_URL'];
  if (!url) {
    throw new Error(
      'MASTRA_DB_URL is not set. Add a Postgres connection string for Mastra storage. ' +
      'Recommended: add a Railway Postgres plugin and set MASTRA_DB_URL=${{Postgres.DATABASE_URL}}. ' +
      'Alternatively, use the Supabase direct connection URL (db.[ref].supabase.co:5432) ' +
      'with the Supabase IPv4 Add-On enabled.'
    );
  }

  const hasLiteralIPv6 = /\[[\da-fA-F:]+\]/.test(url) ||
    /postgres(?:ql)?:\/\/[^@]+@[\da-fA-F]{0,4}(?::[\da-fA-F]{0,4}){2,}:/.test(url);
  if (hasLiteralIPv6) {
    throw new Error(
      'MASTRA_DB_URL contains a literal IPv6 address which Railway cannot reach (ENETUNREACH). ' +
      'Use a hostname-based URL. Recommended: Railway Postgres plugin (${{Postgres.DATABASE_URL}}). ' +
      'If using Supabase, use db.[ref].supabase.co:5432 (not the IPv6 address directly) ' +
      'with the Supabase IPv4 Add-On enabled.'
    );
  }

  cached = resolve(url);
  return cached;
}
