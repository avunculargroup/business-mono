// Helpers for image URLs that end up in outbound email (the news digest's
// headline image). Email clients fetch images through their own proxies and
// show a broken-image box on any failure, so a URL is only worth sending once
// we know it resolves to a format every client renders.

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const PROBE_TIMEOUT_MS = 8_000;

// WebP/AVIF/SVG are left out on purpose: Outlook desktop and several webmail
// clients render them as a broken image.
const EMAIL_SAFE_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/pjpeg', 'image/png', 'image/gif']);

/**
 * Decode the HTML entities that appear in URLs lifted from markup
 * (`?w=1&amp;h=2`). Left encoded, the `&amp;` is escaped again when the URL is
 * written into the email's HTML and the image server receives a mangled query.
 */
export function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/**
 * True when the URL answers 2xx with an email-safe image content type. Best
 * effort: a network error, timeout, non-image response or unsupported format
 * all yield false so the caller can move on to the next candidate.
 */
export async function isEmailSafeImage(url: string): Promise<boolean> {
  if (!/^https?:\/\//i.test(url)) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': BROWSER_UA, Accept: 'image/jpeg,image/png,image/gif,image/*;q=0.8' },
      redirect: 'follow',
      signal: controller.signal,
    });
    const type = (res.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
    return res.ok && EMAIL_SAFE_TYPES.has(type);
  } catch {
    return false;
  } finally {
    // Only the headers matter; abort so the image body is never downloaded.
    clearTimeout(timer);
    controller.abort();
  }
}
